import {
  App,
  type Command,
  getLanguage,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  addDays,
  advanceSchedule,
  daysUntil,
  firstReviewDate,
  isDue,
  isDueToday,
  isOverdue,
  parseDateKey,
  parseIntervals,
  projectReviewDates,
  toDateKey,
} from "./scheduler";
import { REVIEW_STATUS_VIEW_TYPE, ReviewStatusView } from "./review-status-view";
import {
  REVIEW_DASHBOARD_VIEW_TYPE,
  ReviewDashboardView,
  type DashboardTab,
} from "./review-dashboard-view";
import {
  buildDailyActivity,
  calculateCurrentStreak,
  deduplicateActivity,
  removeActivityEntry,
  type DailyActivity,
  type ReviewActivityEntry,
} from "./statistics";
import {
  getLegacyPropertyNames,
  hasLegacyProperties,
  normalizeStoredSchedule,
  readLegacySchedule,
  type StoredReviewSchedule,
} from "./review-storage";
import {
  AUTO_LOCALE,
  createI18n,
  localeDisplayName,
  normalizeLocalePreference,
  SUPPORTED_LOCALES,
  type I18n,
  type LocalePreference,
} from "./i18n";
import type { MessageKey } from "./messages";
import { settingsFingerprint } from "./settings-sync";
import { reregisterCommand } from "./localized-command";

interface EbbinghausReviewSettings {
  language: LocalePreference;
  intervals: string;
  /** Kept only to locate and remove properties written by versions before 0.5.0. */
  propertyPrefix: string;
  checkIntervalMinutes: number;
  notificationTime: string;
  notifyOnStartup: boolean;
  keepStatusPanelOpen: boolean;
  systemNotifications: boolean;
  lastNotificationDate: string;
  reviewLog: ReviewActivityEntry[];
  undoSnapshots: Record<string, CompletionUndoSnapshot>;
  schedules: Record<string, StoredReviewSchedule>;
}

type UserSettingKey = Exclude<
  keyof EbbinghausReviewSettings,
  "reviewLog" | "undoSnapshots" | "schedules"
>;

interface SettingsMutation<T> {
  changed: boolean;
  value: T;
}

interface CompletionUndoSnapshot {
  enabled: boolean;
  stage: number;
  nextDate: string | null;
  lastDate: string | null;
  history: Array<string | null> | null;
  completedDate: string;
  completedStage: number;
  hadLogEntry: boolean;
  createdAt: number;
}

export interface ReviewItem {
  file: TFile;
  nextDate: string;
  stage: number;
}

export interface StudyStatistics {
  scheduledNotes: number;
  activeNotes: number;
  completedNotes: number;
  dueNotes: number;
  todayDueNotes: number;
  overdueNotes: number;
  reviewsToday: number;
  totalReviews: number;
  lastSevenDaysTotal: number;
  streakDays: number;
  dailyActivity: DailyActivity[];
}

export interface ReviewState {
  status: "unscheduled" | "active" | "completed" | "paused";
  startedDate: string | null;
  lastDate: string | null;
  nextDate: string | null;
  daysUntilNext: number | null;
  completedCount: number;
  totalStages: number;
  progressPercent: number;
  steps: ReviewStep[];
}

export interface ReviewStep {
  date: string | null;
  daysFromToday: number | null;
  status: "completed" | "current" | "upcoming";
}

const DEFAULT_SETTINGS: EbbinghausReviewSettings = {
  language: AUTO_LOCALE,
  intervals: "1, 3, 7, 14, 30, 60, 120",
  propertyPrefix: "ebbinghaus_review",
  checkIntervalMinutes: 30,
  notificationTime: "09:00",
  notifyOnStartup: true,
  keepStatusPanelOpen: true,
  systemNotifications: false,
  lastNotificationDate: "",
  reviewLog: [],
  undoSnapshots: {},
  schedules: {},
};

const SETTINGS_SYNC_INTERVAL_MS = 2_000;

function isCompletionUndoSnapshot(value: unknown): value is CompletionUndoSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  const validOptionalDate = (date: unknown): boolean =>
    date === null || (typeof date === "string" && parseDateKey(date) !== null);
  return (
    typeof snapshot.enabled === "boolean" &&
    Number.isSafeInteger(snapshot.stage) && Number(snapshot.stage) >= 0 &&
    validOptionalDate(snapshot.nextDate) &&
    validOptionalDate(snapshot.lastDate) &&
    (snapshot.history === null || (
      Array.isArray(snapshot.history) &&
      snapshot.history.every((date) => validOptionalDate(date))
    )) &&
    typeof snapshot.completedDate === "string" &&
    parseDateKey(snapshot.completedDate) !== null &&
    Number.isSafeInteger(snapshot.completedStage) && Number(snapshot.completedStage) >= 0 &&
    typeof snapshot.hadLogEntry === "boolean" &&
    typeof snapshot.createdAt === "number" && Number.isFinite(snapshot.createdAt)
  );
}

export default class EbbinghausReviewPlugin extends Plugin {
  settings: EbbinghausReviewSettings = DEFAULT_SETTINGS;
  i18n: I18n = createI18n(getLanguage());
  private dueStatusBar: HTMLElement | null = null;
  private noteStatusBar: HTMLElement | null = null;
  private dueRibbonIcon: HTMLElement | null = null;
  private statusRibbonIcon: HTMLElement | null = null;
  private settingTab: EbbinghausReviewSettingTab | null = null;
  private readonly localizedCommands: Array<{
    definition: Omit<Command, "name">;
    key: MessageKey;
    registered: Command;
  }> = [];
  private checkIntervalId: number | null = null;
  private settingsSyncIntervalId: number | null = null;
  private knownSettingsFingerprint = "";
  private settingsQueue: Promise<void> = Promise.resolve();
  private restoringStatusView = false;
  private isUnloading = false;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.applyConfiguredLanguage();

    this.registerView(
      REVIEW_STATUS_VIEW_TYPE,
      (leaf) => new ReviewStatusView(leaf, this),
    );
    this.registerView(
      REVIEW_DASHBOARD_VIEW_TYPE,
      (leaf) => new ReviewDashboardView(leaf, this),
    );

    this.dueStatusBar = this.addStatusBarItem();
    this.dueStatusBar.addClass("ebbinghaus-review-status");
    this.dueStatusBar.setAttribute("aria-label", this.i18n.t("openTodayReviewsA11y"));
    this.dueStatusBar.addEventListener("click", () => this.openDueReviews());

    this.noteStatusBar = this.addStatusBarItem();
    this.noteStatusBar.addClass("ebbinghaus-review-status", "ebbinghaus-note-status");
    this.noteStatusBar.setAttribute("aria-label", this.i18n.t("openStatusA11y"));
    this.noteStatusBar.addEventListener("click", () => void this.activateStatusView());

    this.dueRibbonIcon = this.addRibbonIcon("calendar-clock", this.i18n.t("todayReviewList"), () => {
      this.openDueReviews();
    });

    this.statusRibbonIcon = this.addRibbonIcon("chart-no-axes-column-increasing", this.i18n.t("currentReviewStatus"), () => {
      void this.activateStatusView();
    });

    this.addLocalizedCommand("commandStartRestart", {
      id: "start-review-schedule",
      callback: () => void this.startScheduleForActiveFile(),
    });

    this.addLocalizedCommand("commandMarkReviewed", {
      id: "mark-current-note-reviewed",
      callback: () => void this.completeActiveReview(),
    });

    this.addLocalizedCommand("commandUndo", {
      id: "undo-current-note-review",
      callback: () => void this.undoActiveReview(),
    });

    this.addLocalizedCommand("commandSnooze", {
      id: "snooze-current-note-one-day",
      callback: () => void this.snoozeActiveReview(),
    });

    this.addLocalizedCommand("commandOpenToday", {
      id: "open-due-reviews",
      callback: () => this.openDueReviews(),
    });

    this.addLocalizedCommand("commandOpenStatus", {
      id: "open-review-status",
      callback: () => void this.activateStatusView(),
    });

    this.addLocalizedCommand("commandOpenStats", {
      id: "open-study-statistics",
      callback: () => void this.activateDashboard("statistics"),
    });

    this.addLocalizedCommand("commandOpenDashboard", {
      id: "open-study-dashboard",
      callback: () => void this.activateDashboard("today"),
    });

    this.addLocalizedCommand("commandOpenOverdue", {
      id: "open-overdue-reviews",
      callback: () => void this.activateDashboard("overdue"),
    });

    this.settingTab = new EbbinghausReviewSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.updateCheckInterval();
    this.startSettingsSync();

    this.app.workspace.onLayoutReady(() => void this.initializeLayout());

    this.registerEvent(this.app.metadataCache.on("changed", () => void this.refreshStatus()));
    this.registerEvent(this.app.vault.on("delete", (file) => void this.handleDeletedPath(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) =>
      void this.handleRenamedPath(oldPath, file.path)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.refreshStatus()));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      if (
        !this.isUnloading &&
        this.settings.keepStatusPanelOpen &&
        this.app.workspace.getLeavesOfType(REVIEW_STATUS_VIEW_TYPE).length === 0
      ) {
        void this.ensureStatusView(true);
      }
    }));
  }

  private addLocalizedCommand(key: MessageKey, command: Omit<Command, "name">): void {
    const registered = this.addCommand({ ...command, name: this.i18n.t(key) });
    this.localizedCommands.push({ definition: command, key, registered });
  }

  private applyConfiguredLanguage(): void {
    const locale = this.settings.language === AUTO_LOCALE
      ? getLanguage()
      : this.settings.language;
    this.i18n = createI18n(locale);
  }

  private refreshLocalizedChrome(): void {
    this.dueStatusBar?.setAttribute("aria-label", this.i18n.t("openTodayReviewsA11y"));
    this.noteStatusBar?.setAttribute("aria-label", this.i18n.t("openStatusA11y"));
    this.dueRibbonIcon?.setAttribute("aria-label", this.i18n.t("todayReviewList"));
    this.statusRibbonIcon?.setAttribute("aria-label", this.i18n.t("currentReviewStatus"));
    for (const localized of this.localizedCommands) {
      localized.registered = reregisterCommand(
        localized.registered,
        localized.definition,
        this.i18n.t(localized.key),
        (commandId) => this.removeCommand(commandId),
        (command) => this.addCommand(command),
      );
    }
  }

  async setLanguagePreference(language: LocalePreference): Promise<void> {
    await this.updateSetting("language", language);
    this.applyConfiguredLanguage();
    this.refreshLocalizedChrome();
    this.settingTab?.display();
    await this.refreshStatus();
    this.app.workspace.trigger("layout-change");
  }

  onunload(): void {
    this.isUnloading = true;
    this.app.workspace.detachLeavesOfType(REVIEW_STATUS_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(REVIEW_DASHBOARD_VIEW_TYPE);
  }

  get propertyNames() {
    return getLegacyPropertyNames(this.settings.propertyPrefix);
  }

  get intervals(): number[] {
    return parseIntervals(this.settings.intervals) ?? parseIntervals(DEFAULT_SETTINGS.intervals)!;
  }

  getReviewState(file: TFile, now = new Date()): ReviewState {
    const schedule = this.settings.schedules[file.path];
    const totalStages = this.intervals.length;

    if (!schedule) {
      return {
        status: "unscheduled",
        startedDate: null,
        lastDate: null,
        nextDate: null,
        daysUntilNext: null,
        completedCount: 0,
        totalStages,
        progressPercent: 0,
        steps: this.intervals.map(() => ({
          date: null,
          daysFromToday: null,
          status: "upcoming",
        })),
      };
    }

    const stage = schedule.stage;
    const completedCount = Math.min(stage, totalStages);
    const enabled = schedule.enabled;
    const status = enabled
      ? "active"
      : completedCount >= totalStages
        ? "completed"
        : "paused";
    const nextDate = schedule.nextDate;
    const lastDate = schedule.lastDate;
    const history = schedule.history;
    const projectedDates = projectReviewDates(nextDate, completedCount, this.intervals);
    const steps: ReviewStep[] = this.intervals.map((_, index) => {
      const stepStatus = index < completedCount
        ? "completed"
        : index === completedCount && status === "active"
          ? "current"
          : "upcoming";
      const date = stepStatus === "completed"
        ? history[index] ?? (index === completedCount - 1 ? lastDate : null)
        : projectedDates[index];
      return {
        date,
        daysFromToday: daysUntil(date, now),
        status: stepStatus,
      };
    });

    return {
      status,
      startedDate: schedule.startedDate,
      lastDate,
      nextDate,
      daysUntilNext: enabled ? daysUntil(nextDate, now) : null,
      completedCount,
      totalStages,
      progressPercent: totalStages === 0 ? 0 : Math.round((completedCount / totalStages) * 100),
      steps,
    };
  }

  async startSchedule(file: TFile, now = new Date()): Promise<void> {
    const nextDate = await this.mutateSettings(() => {
      const date = firstReviewDate(now, this.intervals);
      this.settings.schedules[file.path] = {
        enabled: true,
        startedDate: toDateKey(now),
        stage: 0,
        nextDate: date,
        lastDate: null,
        history: [],
      };
      delete this.settings.undoSnapshots[file.path];
      return { changed: true, value: date };
    });
    new Notice(this.i18n.t("scheduleStartedNotice", { date: nextDate }));
    await this.refreshStatus();
    await this.activateStatusView();
  }

  async completeReview(file: TFile, now = new Date()): Promise<void> {
    const resultMessage = await this.mutateSettings(() => {
      const schedule = this.settings.schedules[file.path];
      if (!schedule?.enabled) {
        throw new Error(this.i18n.t("noActiveSchedule"));
      }
      const completedDate = toDateKey(now);
      const stage = schedule.stage;
      const next = advanceSchedule(now, stage, this.intervals);
      const history = [...schedule.history];
      const activityEntry = { date: completedDate, filePath: file.path, stage };
      this.settings.undoSnapshots[file.path] = {
        enabled: schedule.enabled,
        stage,
        nextDate: schedule.nextDate,
        lastDate: schedule.lastDate,
        history: [...history],
        completedDate,
        completedStage: stage,
        hadLogEntry: this.settings.reviewLog.some((entry) =>
          entry.date === activityEntry.date &&
          entry.filePath === activityEntry.filePath &&
          entry.stage === activityEntry.stage),
        createdAt: Date.now(),
      };
      history[stage] = completedDate;
      this.settings.schedules[file.path] = {
        ...schedule,
        enabled: !next.completed,
        stage: next.nextStage,
        nextDate: next.nextDate,
        lastDate: completedDate,
        history,
      };
      this.settings.reviewLog.push(activityEntry);
      this.settings.reviewLog = deduplicateActivity(this.settings.reviewLog);
      return {
        changed: true,
        value: next.completed
          ? this.i18n.t("allStagesCompleted")
          : this.i18n.t("reviewRecordedNext", { date: next.nextDate ?? "" }),
      };
    });
    new Notice(resultMessage);
    await this.refreshStatus();
  }

  async snoozeReview(file: TFile, now = new Date()): Promise<void> {
    const tomorrow = await this.mutateSettings(() => {
      const schedule = this.settings.schedules[file.path];
      if (!schedule?.enabled) {
        throw new Error(this.i18n.t("noActiveSchedule"));
      }
      const date = toDateKey(addDays(now, 1));
      this.settings.schedules[file.path] = { ...schedule, nextDate: date };
      delete this.settings.undoSnapshots[file.path];
      return { changed: true, value: date };
    });
    new Notice(this.i18n.t("reviewPostponed", { date: tomorrow }));
    await this.refreshStatus();
  }

  canUndoReview(file: TFile): boolean {
    return this.settings.undoSnapshots[file.path] !== undefined;
  }

  getLatestUndoReview(): { file: TFile; completedDate: string } | null {
    for (const [path, snapshot] of Object.entries(this.settings.undoSnapshots)
      .sort(([, a], [, b]) => b.createdAt - a.createdAt)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) return { file, completedDate: snapshot.completedDate };
    }
    return null;
  }

  async undoReview(file: TFile): Promise<void> {
    await this.mutateSettings(() => {
      const snapshot = this.settings.undoSnapshots[file.path];
      if (!snapshot) throw new Error(this.i18n.t("noUndoRecord"));
      const schedule = this.settings.schedules[file.path];
      if (!schedule || schedule.stage !== snapshot.stage + 1 ||
        schedule.lastDate !== snapshot.completedDate) {
        throw new Error(this.i18n.t("cannotUndoChanged"));
      }

      this.settings.schedules[file.path] = {
        ...schedule,
        enabled: snapshot.enabled,
        stage: snapshot.stage,
        nextDate: snapshot.nextDate,
        lastDate: snapshot.lastDate,
        history: snapshot.history ? [...snapshot.history] : [],
      };

      if (!snapshot.hadLogEntry) {
        this.settings.reviewLog = removeActivityEntry(this.settings.reviewLog, {
          date: snapshot.completedDate,
          filePath: file.path,
          stage: snapshot.completedStage,
        });
      }
      delete this.settings.undoSnapshots[file.path];
      return { changed: true, value: undefined };
    });
    new Notice(this.i18n.t("reviewUndoNotice", { note: file.basename }));
    await this.refreshStatus();
  }

  getDueReviews(now = new Date()): ReviewItem[] {
    const reviews: ReviewItem[] = [];

    for (const [path, schedule] of Object.entries(this.settings.schedules)) {
      if (!schedule.enabled || !isDue(schedule.nextDate, now)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      reviews.push({
        file,
        nextDate: schedule.nextDate!,
        stage: schedule.stage,
      });
    }

    return reviews.sort((a, b) => {
      const byDate = a.nextDate.localeCompare(b.nextDate);
      return byDate !== 0 ? byDate : a.file.basename.localeCompare(b.file.basename);
    });
  }

  getReviewsDueToday(now = new Date()): ReviewItem[] {
    return this.getDueReviews(now).filter((review) => isDueToday(review.nextDate, now));
  }

  getOverdueReviews(now = new Date()): ReviewItem[] {
    return this.getDueReviews(now).filter((review) => isOverdue(review.nextDate, now));
  }

  todayDateKey(now = new Date()): string {
    return toDateKey(now);
  }

  getReviewActivity(now = new Date()): ReviewActivityEntry[] {
    const activity = [...this.settings.reviewLog];

    for (const path of Object.keys(this.settings.schedules)) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile) || file.extension !== "md") continue;
      const state = this.getReviewState(file, now);
      state.steps.forEach((step, stage) => {
        if (step.status === "completed" && step.date) {
          activity.push({ date: step.date, filePath: file.path, stage });
        }
      });
    }

    return deduplicateActivity(activity);
  }

  getStudyStatistics(now = new Date()): StudyStatistics {
    const states = Object.keys(this.settings.schedules)
      .map((path) => this.app.vault.getAbstractFileByPath(path))
      .filter((file): file is TFile => file instanceof TFile && file.extension === "md")
      .map((file) => this.getReviewState(file, now));
    const activity = this.getReviewActivity(now);
    const today = toDateKey(now);
    const dailyActivity = buildDailyActivity(activity, now, 7);

    return {
      scheduledNotes: states.length,
      activeNotes: states.filter((state) => state.status === "active").length,
      completedNotes: states.filter((state) => state.status === "completed").length,
      dueNotes: this.getDueReviews(now).length,
      todayDueNotes: this.getReviewsDueToday(now).length,
      overdueNotes: this.getOverdueReviews(now).length,
      reviewsToday: activity.filter((entry) => entry.date === today).length,
      totalReviews: activity.length,
      lastSevenDaysTotal: dailyActivity.reduce((sum, day) => sum + day.count, 0),
      streakDays: calculateCurrentStreak(activity, now),
      dailyActivity,
    };
  }

  async refreshStatus(): Promise<void> {
    const todayCount = this.getReviewsDueToday().length;
    const overdueCount = this.getOverdueReviews().length;
    this.dueStatusBar?.setText(this.i18n.t("dueCounts", {
      today: todayCount,
      overdue: overdueCount,
    }));

    const file = this.getActiveMarkdownFile();
    if (!file) {
      this.noteStatusBar?.setText(this.i18n.t("noNoteStatusBar"));
    } else {
      const state = this.getReviewState(file);
      if (state.status === "active") {
        const timing = state.daysUntilNext === 0
          ? this.i18n.t("today")
          : state.daysUntilNext !== null && state.daysUntilNext > 0
            ? `D-${state.daysUntilNext}`
            : state.daysUntilNext !== null
              ? this.i18n.t("daysOverdue", { count: Math.abs(state.daysUntilNext) })
              : this.i18n.t("noDate");
        this.noteStatusBar?.setText(
          this.i18n.t("reviewStatusBar", {
            completed: state.completedCount,
            total: state.totalStages,
            timing,
          }),
        );
      } else if (state.status === "completed") {
        this.noteStatusBar?.setText(this.i18n.t("reviewAllCompleteStatus"));
      } else if (state.status === "paused") {
        this.noteStatusBar?.setText(this.i18n.t("reviewPausedStatus"));
      } else {
        this.noteStatusBar?.setText(this.i18n.t("reviewNoScheduleStatus"));
      }
    }

    for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_STATUS_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ReviewStatusView) void view.render();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_DASHBOARD_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof ReviewDashboardView) void view.render();
    }
  }

  openDueReviews(): void {
    void this.activateDashboard("today");
  }

  async activateDashboard(tab: DashboardTab): Promise<void> {
    let leaf: WorkspaceLeaf | undefined = this.app.workspace
      .getLeavesOfType(REVIEW_DASHBOARD_VIEW_TYPE)
      .at(0);
    if (!leaf) {
      leaf = this.app.workspace.getLeaf("tab");
      await leaf.setViewState({ type: REVIEW_DASHBOARD_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
    if (leaf.view instanceof ReviewDashboardView) await leaf.view.setTab(tab);
  }

  async activateStatusView(): Promise<void> {
    await this.ensureStatusView(true);
  }

  async ensureStatusView(reveal: boolean): Promise<void> {
    if (this.isUnloading || this.restoringStatusView) return;
    this.restoringStatusView = true;
    try {
      let leaf: WorkspaceLeaf | undefined = this.app.workspace
        .getLeavesOfType(REVIEW_STATUS_VIEW_TYPE)
        .at(0);
      if (!leaf) {
        leaf = this.app.workspace.getRightLeaf(false) ?? undefined;
        if (!leaf) {
          if (reveal) new Notice(this.i18n.t("cannotOpenStatusPanel"));
          return;
        }
        await leaf.setViewState({ type: REVIEW_STATUS_VIEW_TYPE, active: true });
      }
      if (reveal) await this.app.workspace.revealLeaf(leaf);
      if (leaf.view instanceof ReviewStatusView) await leaf.view.render();
    } finally {
      this.restoringStatusView = false;
    }
  }

  async checkAndNotify(ignoreTime: boolean): Promise<void> {
    const now = new Date();
    const today = toDateKey(now);
    const notification = await this.mutateSettings(() => {
      if (this.settings.lastNotificationDate === today) {
        return { changed: false, value: null };
      }
      if (!ignoreTime && !this.isNotificationTime(now)) {
        return { changed: false, value: null };
      }

      const reviews = this.getDueReviews(now);
      if (reviews.length === 0) return { changed: false, value: null };

      this.settings.lastNotificationDate = today;
      return {
        changed: true,
        value: {
          message: this.i18n.t("dueNotification", { count: reviews.length }),
          systemNotifications: this.settings.systemNotifications,
        },
      };
    });
    await this.refreshStatus();
    if (!notification) return;

    const { message, systemNotifications } = notification;
    new Notice(message, 8000);

    if (systemNotifications && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification("Ebbinghaus Review", { body: message });
      }
    }
  }

  isNotificationTime(now: Date): boolean {
    const match = /^(\d{2}):(\d{2})$/.exec(this.settings.notificationTime);
    if (!match) return true;
    const targetMinutes = Number(match[1]) * 60 + Number(match[2]);
    return now.getHours() * 60 + now.getMinutes() >= targetMinutes;
  }

  private async initializeLayout(): Promise<void> {
    await this.withNoticeErrors(async () => {
      const { imported, cleaned } = await this.migrateLegacySchedules();
      if (imported > 0 || cleaned > 0) {
        new Notice(this.i18n.t("migrationNotice", { count: imported }));
      }
    });
    await this.refreshStatus();
    if (this.settings.keepStatusPanelOpen) await this.ensureStatusView(true);
    if (this.settings.notifyOnStartup) await this.checkAndNotify(true);
  }

  async migrateLegacySchedules(): Promise<{ imported: number; cleaned: number }> {
    const { imported, candidates } = await this.mutateSettings(() => {
      const prefixes = [...new Set([
        this.settings.propertyPrefix,
        DEFAULT_SETTINGS.propertyPrefix,
      ])];
      const pending: Array<{
        file: TFile;
        fields: ReturnType<typeof getLegacyPropertyNames>;
      }> = [];
      let count = 0;

      for (const file of this.app.vault.getMarkdownFiles()) {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        for (const prefix of prefixes) {
          const fields = getLegacyPropertyNames(prefix);
          if (!hasLegacyProperties(frontmatter, fields)) continue;
          const legacy = readLegacySchedule(frontmatter, fields);
          if (!this.settings.schedules[file.path] && legacy) {
            this.settings.schedules[file.path] = legacy;
            count += 1;
          }
          if (this.settings.schedules[file.path]) pending.push({ file, fields });
        }
      }

      return {
        changed: count > 0,
        value: { imported: count, candidates: pending },
      };
    });

    let cleaned = 0;
    for (const { file, fields } of candidates) {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        for (const field of Object.values(fields)) delete frontmatter[field];
      });
      cleaned += 1;
    }
    return { imported, cleaned };
  }

  private async handleRenamedPath(oldPath: string, newPath: string): Promise<void> {
    const remap = (path: string): string | null => {
      if (path === oldPath) return newPath;
      return path.startsWith(`${oldPath}/`) ? `${newPath}${path.slice(oldPath.length)}` : null;
    };
    await this.mutateSettings(() => {
      let changed = false;
      for (const [path, schedule] of Object.entries(this.settings.schedules)) {
        const target = remap(path);
        if (!target) continue;
        delete this.settings.schedules[path];
        this.settings.schedules[target] = schedule;
        changed = true;
      }
      for (const [path, snapshot] of Object.entries(this.settings.undoSnapshots)) {
        const target = remap(path);
        if (!target) continue;
        delete this.settings.undoSnapshots[path];
        this.settings.undoSnapshots[target] = snapshot;
        changed = true;
      }
      this.settings.reviewLog = this.settings.reviewLog.map((entry) => {
        const target = remap(entry.filePath);
        if (!target) return entry;
        changed = true;
        return { ...entry, filePath: target };
      });
      return { changed, value: undefined };
    });
    await this.refreshStatus();
  }

  private async handleDeletedPath(path: string): Promise<void> {
    const matches = (candidate: string): boolean =>
      candidate === path || candidate.startsWith(`${path}/`);
    await this.mutateSettings(() => {
      let changed = false;
      for (const schedulePath of Object.keys(this.settings.schedules)) {
        if (!matches(schedulePath)) continue;
        delete this.settings.schedules[schedulePath];
        changed = true;
      }
      for (const snapshotPath of Object.keys(this.settings.undoSnapshots)) {
        if (!matches(snapshotPath)) continue;
        delete this.settings.undoSnapshots[snapshotPath];
        changed = true;
      }
      return { changed, value: undefined };
    });
    await this.refreshStatus();
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<EbbinghausReviewSettings> | null;
    this.applyLoadedSettings(loaded);
    this.knownSettingsFingerprint = settingsFingerprint(loaded);
  }

  private applyLoadedSettings(loaded: Partial<EbbinghausReviewSettings> | null): void {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    this.settings.language = normalizeLocalePreference(loaded?.language);
    this.settings.reviewLog = Array.isArray(loaded?.reviewLog)
      ? loaded.reviewLog.filter((entry): entry is ReviewActivityEntry =>
        typeof entry?.date === "string" &&
        parseDateKey(entry.date) !== null &&
        typeof entry.filePath === "string" &&
        Number.isSafeInteger(entry.stage) &&
        entry.stage >= 0)
      : [];
    this.settings.undoSnapshots = loaded?.undoSnapshots &&
      typeof loaded.undoSnapshots === "object"
      ? Object.fromEntries(
        Object.entries(loaded.undoSnapshots)
          .filter((entry): entry is [string, CompletionUndoSnapshot] =>
            isCompletionUndoSnapshot(entry[1])),
      )
      : {};
    this.settings.schedules = loaded?.schedules && typeof loaded.schedules === "object"
      ? Object.fromEntries(
        Object.entries(loaded.schedules)
          .map(([path, schedule]) => [path, normalizeStoredSchedule(schedule)] as const)
          .filter((entry): entry is readonly [string, StoredReviewSchedule] => entry[1] !== null),
      )
      : {};
    this.settings.propertyPrefix = typeof loaded?.propertyPrefix === "string" &&
      loaded.propertyPrefix.trim().length > 0
      ? loaded.propertyPrefix
      : DEFAULT_SETTINGS.propertyPrefix;
  }

  private async persistSettingsLocked(): Promise<void> {
    await this.saveData(this.settings);
    this.knownSettingsFingerprint = settingsFingerprint(this.settings);
  }

  private enqueueSettingsOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.settingsQueue.then(operation, operation);
    this.settingsQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async reloadSettingsIfChangedLocked(): Promise<boolean> {
    const loaded = (await this.loadData()) as Partial<EbbinghausReviewSettings> | null;
    const fingerprint = settingsFingerprint(loaded);
    if (fingerprint === this.knownSettingsFingerprint) return false;
    this.applyLoadedSettings(loaded);
    this.knownSettingsFingerprint = fingerprint;
    return true;
  }

  private async mutateSettings<T>(
    mutation: () => SettingsMutation<T> | Promise<SettingsMutation<T>>,
  ): Promise<T> {
    return this.enqueueSettingsOperation(async () => {
      await this.reloadSettingsIfChangedLocked();
      let result = await mutation();
      if (result.changed) {
        const latest = (await this.loadData()) as Partial<EbbinghausReviewSettings> | null;
        const latestFingerprint = settingsFingerprint(latest);
        if (latestFingerprint !== this.knownSettingsFingerprint) {
          this.applyLoadedSettings(latest);
          this.knownSettingsFingerprint = latestFingerprint;
          result = await mutation();
        }
      }
      if (result.changed) await this.persistSettingsLocked();
      return result.value;
    });
  }

  async updateSetting<K extends UserSettingKey>(
    key: K,
    value: EbbinghausReviewSettings[K],
  ): Promise<void> {
    await this.mutateSettings(() => {
      const changed = this.settings[key] !== value;
      this.settings[key] = value;
      return { changed, value: undefined };
    });
  }

  private startSettingsSync(): void {
    if (this.settingsSyncIntervalId !== null) {
      window.clearInterval(this.settingsSyncIntervalId);
    }
    this.settingsSyncIntervalId = window.setInterval(
      () => void this.synchronizeSettingsFromDisk(),
      SETTINGS_SYNC_INTERVAL_MS,
    );
    this.registerInterval(this.settingsSyncIntervalId);
  }

  private async synchronizeSettingsFromDisk(): Promise<void> {
    try {
      const { changed, checkIntervalChanged, languageChanged } = await this.enqueueSettingsOperation(async () => {
        const previousCheckInterval = this.settings.checkIntervalMinutes;
        const previousLanguage = this.settings.language;
        const reloaded = await this.reloadSettingsIfChangedLocked();
        return {
          changed: reloaded,
          checkIntervalChanged: reloaded &&
            previousCheckInterval !== this.settings.checkIntervalMinutes,
          languageChanged: reloaded && previousLanguage !== this.settings.language,
        };
      });
      if (!changed) return;
      if (checkIntervalChanged) this.updateCheckInterval();
      if (languageChanged) {
        this.applyConfiguredLanguage();
        this.refreshLocalizedChrome();
        this.settingTab?.display();
      }
      await this.refreshStatus();
      if (languageChanged) this.app.workspace.trigger("layout-change");
    } catch (error) {
      console.error("Ebbinghaus Review: failed to reload synced settings", error);
    }
  }

  updateCheckInterval(): void {
    if (this.checkIntervalId !== null) window.clearInterval(this.checkIntervalId);
    this.checkIntervalId = window.setInterval(
      () => void this.checkAndNotify(false),
      this.settings.checkIntervalMinutes * 60 * 1000,
    );
    this.registerInterval(this.checkIntervalId);
  }

  getActiveMarkdownFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    return file?.extension === "md" ? file : null;
  }

  private async startScheduleForActiveFile(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice(this.i18n.t("openMarkdownFirst"));
    await this.withNoticeErrors(() => this.startSchedule(file));
  }

  private async completeActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice(this.i18n.t("openMarkdownFirst"));
    await this.withNoticeErrors(() => this.completeReview(file));
  }

  private async undoActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice(this.i18n.t("openMarkdownFirst"));
    await this.withNoticeErrors(() => this.undoReview(file));
  }

  private async snoozeActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice(this.i18n.t("openMarkdownFirst"));
    await this.withNoticeErrors(() => this.snoozeReview(file));
  }

  async withNoticeErrors(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Ebbinghaus Review: ${message}`);
    }
  }
}

class EbbinghausReviewSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: EbbinghausReviewPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName("Ebbinghaus Review")
      .setHeading();

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("languageSetting"))
      .setDesc(this.plugin.i18n.t("languageSettingDesc"))
      .addDropdown((dropdown) => {
        const obsidianLocale = createI18n(getLanguage()).locale;
        const obsidianLanguage = localeDisplayName(obsidianLocale, this.plugin.i18n.intlLocale);
        dropdown.addOption(
          AUTO_LOCALE,
          this.plugin.i18n.t("followObsidianLanguage", { language: obsidianLanguage }),
        );
        const collator = new Intl.Collator(this.plugin.i18n.intlLocale);
        const localeOptions = SUPPORTED_LOCALES
          .map((locale) => ({
            locale,
            name: localeDisplayName(locale, this.plugin.i18n.intlLocale),
          }))
          .sort((first, second) => collator.compare(first.name, second.name));
        for (const { locale, name } of localeOptions) dropdown.addOption(locale, name);
        dropdown.setValue(this.plugin.settings.language).onChange(async (value) => {
          const language = normalizeLocalePreference(value);
          await this.plugin.setLanguagePreference(language);
        });
      });

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("reviewIntervalsSetting"))
      .setDesc(this.plugin.i18n.t("reviewIntervalsDesc"))
      .addText((text) =>
        text.setValue(this.plugin.settings.intervals).onChange(async (value) => {
          if (!parseIntervals(value)) {
            text.inputEl.addClass("ebbinghaus-review-invalid");
            return;
          }
          text.inputEl.removeClass("ebbinghaus-review-invalid");
          await this.plugin.updateSetting("intervals", value);
        }),
      );

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("notificationTimeSetting"))
      .setDesc(this.plugin.i18n.t("notificationTimeDesc"))
      .addText((text) => {
        text.inputEl.type = "time";
        text.setValue(this.plugin.settings.notificationTime).onChange(async (value) => {
          await this.plugin.updateSetting("notificationTime", value);
        });
      });

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("checkIntervalSetting"))
      .setDesc(this.plugin.i18n.t("checkIntervalDesc"))
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.setValue(String(this.plugin.settings.checkIntervalMinutes)).onChange(async (value) => {
          const minutes = Number(value);
          if (!Number.isSafeInteger(minutes) || minutes < 1) return;
          await this.plugin.updateSetting("checkIntervalMinutes", minutes);
          this.plugin.updateCheckInterval();
        });
      });

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("keepPanelSetting"))
      .setDesc(this.plugin.i18n.t("keepPanelDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.keepStatusPanelOpen).onChange(async (value) => {
          await this.plugin.updateSetting("keepStatusPanelOpen", value);
          if (value) await this.plugin.ensureStatusView(true);
        }),
      );

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("notifyOnStartupSetting"))
      .setDesc(this.plugin.i18n.t("notifyOnStartupDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.notifyOnStartup).onChange(async (value) => {
          await this.plugin.updateSetting("notifyOnStartup", value);
        }),
      );

    new Setting(this.containerEl)
      .setName(this.plugin.i18n.t("systemNotificationsSetting"))
      .setDesc(this.plugin.i18n.t("systemNotificationsDesc"))
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.systemNotifications).onChange(async (value) => {
          if (value && typeof Notification === "undefined") {
            toggle.setValue(false);
            new Notice(this.plugin.i18n.t("systemNotificationUnavailable"));
            value = false;
          } else if (value && typeof Notification !== "undefined") {
            const permission = Notification.permission === "default"
              ? await Notification.requestPermission()
              : Notification.permission;
            if (permission !== "granted") {
              toggle.setValue(false);
              new Notice(this.plugin.i18n.t("systemNotificationPermissionDenied"));
              value = false;
            }
          }
          await this.plugin.updateSetting("systemNotifications", value);
        }),
      );

  }
}
