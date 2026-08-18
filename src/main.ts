import {
  App,
  Notice,
  Platform,
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
import { GoogleCalendarApi } from "./google-calendar-api";
import { buildGoogleCalendarEvent } from "./google-calendar-model";
import { authorizeGoogleCalendarDesktop } from "./google-oauth";

interface EbbinghausReviewSettings {
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
  googleOAuthClientId: string;
  googleCalendarId: string;
  googleCalendarName: string;
  googleReviewTime: string;
  googleReminderMinutes: number;
  googleLastSyncAt: string;
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
  googleOAuthClientId: "",
  googleCalendarId: "",
  googleCalendarName: "Obsidian 복습",
  googleReviewTime: "09:00",
  googleReminderMinutes: 0,
  googleLastSyncAt: "",
};

const GOOGLE_REFRESH_TOKEN_SECRET_ID = "ebbinghaus-review-google-refresh-token";

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
  private dueStatusBar: HTMLElement | null = null;
  private noteStatusBar: HTMLElement | null = null;
  private checkIntervalId: number | null = null;
  private restoringStatusView = false;
  private isUnloading = false;
  private googleSyncTimerId: number | null = null;
  private googleSyncPromise: Promise<void> | null = null;
  private lastGoogleSyncErrorNoticeAt = 0;

  async onload(): Promise<void> {
    await this.loadSettings();

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
    this.dueStatusBar.setAttribute("aria-label", "오늘 복습 목록 열기");
    this.dueStatusBar.addEventListener("click", () => this.openDueReviews());

    this.noteStatusBar = this.addStatusBarItem();
    this.noteStatusBar.addClass("ebbinghaus-review-status", "ebbinghaus-note-status");
    this.noteStatusBar.setAttribute("aria-label", "현재 노트 복습 현황 열기");
    this.noteStatusBar.addEventListener("click", () => void this.activateStatusView());

    this.addRibbonIcon("calendar-clock", "오늘 복습 목록", () => {
      this.openDueReviews();
    });

    this.addRibbonIcon("chart-no-axes-column-increasing", "현재 노트 복습 현황", () => {
      void this.activateStatusView();
    });

    this.addCommand({
      id: "start-review-schedule",
      name: "현재 노트 복습 일정 시작 또는 재시작",
      callback: () => void this.startScheduleForActiveFile(),
    });

    this.addCommand({
      id: "mark-current-note-reviewed",
      name: "현재 노트를 복습 완료로 기록",
      callback: () => void this.completeActiveReview(),
    });

    this.addCommand({
      id: "undo-current-note-review",
      name: "현재 노트의 마지막 복습 완료 취소",
      callback: () => void this.undoActiveReview(),
    });

    this.addCommand({
      id: "snooze-current-note-one-day",
      name: "현재 노트 복습을 내일로 미루기",
      callback: () => void this.snoozeActiveReview(),
    });

    this.addCommand({
      id: "open-due-reviews",
      name: "오늘 복습 목록 열기",
      callback: () => this.openDueReviews(),
    });

    this.addCommand({
      id: "open-review-status",
      name: "현재 노트 복습 현황 패널 열기",
      callback: () => void this.activateStatusView(),
    });

    this.addCommand({
      id: "open-study-statistics",
      name: "학습 통계 화면 열기",
      callback: () => void this.activateDashboard("statistics"),
    });

    this.addCommand({
      id: "open-study-dashboard",
      name: "학습 대시보드 열기",
      callback: () => void this.activateDashboard("today"),
    });

    this.addCommand({
      id: "open-overdue-reviews",
      name: "놓친 복습 목록 열기",
      callback: () => void this.activateDashboard("overdue"),
    });

    this.addCommand({
      id: "connect-google-calendar",
      name: "Google Calendar 계정 연결",
      callback: () => void this.withNoticeErrors(() => this.connectGoogleCalendar()),
    });

    this.addCommand({
      id: "sync-google-calendar",
      name: "Google Calendar 지금 동기화",
      callback: () => void this.withNoticeErrors(() => this.syncGoogleCalendar(true)),
    });

    this.addCommand({
      id: "disconnect-google-calendar",
      name: "Google Calendar 계정 연결 해제",
      callback: () => void this.withNoticeErrors(() => this.disconnectGoogleCalendar()),
    });

    this.addSettingTab(new EbbinghausReviewSettingTab(this.app, this));

    this.updateCheckInterval();

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

  onunload(): void {
    this.isUnloading = true;
    if (this.googleSyncTimerId !== null) window.clearTimeout(this.googleSyncTimerId);
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
    const nextDate = firstReviewDate(now, this.intervals);
    this.settings.schedules[file.path] = {
      enabled: true,
      startedDate: toDateKey(now),
      stage: 0,
      nextDate,
      lastDate: null,
      history: [],
    };
    delete this.settings.undoSnapshots[file.path];
    await this.saveSettings();
    this.queueGoogleCalendarSync();
    new Notice(`복습 일정을 시작했습니다. 첫 복습일: ${nextDate}`);
    await this.refreshStatus();
    await this.activateStatusView();
  }

  async completeReview(file: TFile, now = new Date()): Promise<void> {
    const schedule = this.settings.schedules[file.path];
    if (!schedule?.enabled) {
      throw new Error("이 노트에는 진행 중인 복습 일정이 없습니다.");
    }
    let resultMessage = "복습 완료를 기록했습니다.";
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
    resultMessage = next.completed
      ? "모든 복습 단계를 완료했습니다."
      : `복습 완료를 기록했습니다. 다음 복습일: ${next.nextDate}`;
    this.settings.reviewLog.push({
      date: completedDate,
      filePath: file.path,
      stage,
    });
    this.settings.reviewLog = deduplicateActivity(this.settings.reviewLog);
    await this.saveSettings();
    this.queueGoogleCalendarSync();
    new Notice(resultMessage);
    await this.refreshStatus();
  }

  async snoozeReview(file: TFile, now = new Date()): Promise<void> {
    const schedule = this.settings.schedules[file.path];
    if (!schedule?.enabled) {
      throw new Error("이 노트에는 진행 중인 복습 일정이 없습니다.");
    }
    const tomorrow = toDateKey(addDays(now, 1));
    this.settings.schedules[file.path] = { ...schedule, nextDate: tomorrow };
    delete this.settings.undoSnapshots[file.path];
    await this.saveSettings();
    this.queueGoogleCalendarSync();
    new Notice(`복습을 ${tomorrow}로 미뤘습니다.`);
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
    const snapshot = this.settings.undoSnapshots[file.path];
    if (!snapshot) throw new Error("취소할 복습 완료 기록이 없습니다.");
    const schedule = this.settings.schedules[file.path];
    if (!schedule || schedule.stage !== snapshot.stage + 1 ||
      schedule.lastDate !== snapshot.completedDate) {
      throw new Error("복습 완료 후 일정이 변경되어 자동으로 취소할 수 없습니다.");
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
    await this.saveSettings();
    this.queueGoogleCalendarSync();
    new Notice(`복습 완료를 취소했습니다: ${file.basename}`);
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
    this.dueStatusBar?.setText(`오늘 ${todayCount} · 놓침 ${overdueCount}`);

    const file = this.getActiveMarkdownFile();
    if (!file) {
      this.noteStatusBar?.setText("복습: 노트 없음");
    } else {
      const state = this.getReviewState(file);
      if (state.status === "active") {
        const timing = state.daysUntilNext === 0
          ? "오늘"
          : state.daysUntilNext !== null && state.daysUntilNext > 0
            ? `D-${state.daysUntilNext}`
            : state.daysUntilNext !== null
              ? `${Math.abs(state.daysUntilNext)}일 지남`
              : "날짜 없음";
        this.noteStatusBar?.setText(
          `복습 ${state.completedCount}/${state.totalStages} · ${timing}`,
        );
      } else if (state.status === "completed") {
        this.noteStatusBar?.setText("복습 전체 완료");
      } else if (state.status === "paused") {
        this.noteStatusBar?.setText("복습 일정 중지");
      } else {
        this.noteStatusBar?.setText("복습 일정 없음");
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
          if (reveal) new Notice("복습 현황 패널을 열 수 없습니다.");
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
    await this.refreshStatus();

    const now = new Date();
    const today = toDateKey(now);
    if (this.settings.lastNotificationDate === today) return;
    if (!ignoreTime && !this.isNotificationTime(now)) return;

    const reviews = this.getDueReviews(now);
    if (reviews.length === 0) return;

    const message = `오늘 복습할 노트가 ${reviews.length}개 있습니다.`;
    new Notice(message, 8000);

    if (this.settings.systemNotifications && typeof Notification !== "undefined") {
      if (Notification.permission === "granted") {
        new Notification("Ebbinghaus Review", { body: message });
      }
    }

    this.settings.lastNotificationDate = today;
    await this.saveSettings();
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
        new Notice(`복습 정보 ${imported}개를 내부 저장소로 이전하고 노트 속성을 정리했습니다.`);
      }
    });
    await this.refreshStatus();
    if (this.settings.keepStatusPanelOpen) await this.ensureStatusView(true);
    if (this.settings.notifyOnStartup) await this.checkAndNotify(true);
    this.queueGoogleCalendarSync();
  }

  isGoogleCalendarConnected(): boolean {
    return Platform.isDesktopApp &&
      this.settings.googleOAuthClientId.endsWith(".apps.googleusercontent.com") &&
      Boolean(this.app.secretStorage.getSecret(GOOGLE_REFRESH_TOKEN_SECRET_ID));
  }

  async connectGoogleCalendar(): Promise<void> {
    if (!Platform.isDesktopApp) {
      throw new Error("Google Calendar 계정 연결은 macOS, Windows, Linux 데스크톱에서 진행하세요.");
    }
    const clientId = this.settings.googleOAuthClientId.trim();
    if (!clientId.endsWith(".apps.googleusercontent.com")) {
      throw new Error("설정에 Google OAuth 데스크톱 클라이언트 ID를 먼저 입력하세요.");
    }

    const tokens = await authorizeGoogleCalendarDesktop(clientId);
    this.app.secretStorage.setSecret(GOOGLE_REFRESH_TOKEN_SECRET_ID, tokens.refreshToken);
    await this.syncGoogleCalendar(false);
    new Notice("Google Calendar 연결과 첫 동기화를 완료했습니다.");
  }

  async disconnectGoogleCalendar(): Promise<void> {
    if (!Platform.isDesktopApp) {
      throw new Error("Google Calendar 연결 해제는 연결한 데스크톱에서 진행하세요.");
    }
    const refreshToken = this.app.secretStorage.getSecret(GOOGLE_REFRESH_TOKEN_SECRET_ID);
    if (!refreshToken) {
      new Notice("연결된 Google Calendar 계정이 없습니다.");
      return;
    }

    const clientId = this.settings.googleOAuthClientId.trim();
    if (clientId) {
      await new GoogleCalendarApi(clientId, refreshToken).revoke();
    }
    this.app.secretStorage.setSecret(GOOGLE_REFRESH_TOKEN_SECRET_ID, "");
    new Notice("Google Calendar 계정 연결을 해제했습니다. 기존 캘린더와 일정은 유지됩니다.");
  }

  async syncGoogleCalendar(showNotice: boolean): Promise<void> {
    if (!Platform.isDesktopApp) {
      if (showNotice) throw new Error("Google Calendar 동기화는 데스크톱에서 실행됩니다.");
      return;
    }
    const clientId = this.settings.googleOAuthClientId.trim();
    const refreshToken = this.app.secretStorage.getSecret(GOOGLE_REFRESH_TOKEN_SECRET_ID);
    if (!clientId.endsWith(".apps.googleusercontent.com") || !refreshToken) {
      if (showNotice) throw new Error("설정에서 Google Calendar 계정을 먼저 연결하세요.");
      return;
    }
    if (this.googleSyncPromise) {
      await this.googleSyncPromise;
      if (showNotice) new Notice("Google Calendar 동기화를 완료했습니다.");
      return;
    }

    let resultMessage = "";
    this.googleSyncPromise = (async () => {
      const api = new GoogleCalendarApi(clientId, refreshToken);
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const calendarId = await api.ensureCalendar(
        this.settings.googleCalendarId,
        this.settings.googleCalendarName,
        timeZone,
      );
      if (calendarId !== this.settings.googleCalendarId) {
        this.settings.googleCalendarId = calendarId;
        await this.saveSettings();
      }

      const desiredEvents = await Promise.all(
        Object.entries(this.settings.schedules).flatMap(([path, schedule]) => {
          if (!schedule.enabled || !schedule.nextDate) return [];
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile) || file.extension !== "md") return [];
          return [buildGoogleCalendarEvent({
            vaultName: this.app.vault.getName(),
            filePath: file.path,
            basename: file.basename,
            nextDate: schedule.nextDate,
            reviewTime: this.settings.googleReviewTime,
            timeZone,
            reminderMinutes: this.settings.googleReminderMinutes,
            stage: schedule.stage,
            totalStages: this.intervals.length,
          })];
        }),
      );
      const result = await api.syncEvents(calendarId, desiredEvents);
      this.settings.googleLastSyncAt = new Date().toISOString();
      await this.saveSettings();
      resultMessage = `Google Calendar 동기화 완료 · 생성 ${result.created}, 갱신 ${result.updated}, 삭제 ${result.deleted}`;
    })();

    try {
      await this.googleSyncPromise;
      if (showNotice) new Notice(resultMessage);
    } finally {
      this.googleSyncPromise = null;
    }
  }

  queueGoogleCalendarSync(): void {
    if (!this.isGoogleCalendarConnected()) return;
    if (this.googleSyncTimerId !== null) window.clearTimeout(this.googleSyncTimerId);
    this.googleSyncTimerId = window.setTimeout(() => {
      this.googleSyncTimerId = null;
      void this.syncGoogleCalendar(false).catch((error) => {
        console.error("Ebbinghaus Review Google Calendar sync failed", error);
        const now = Date.now();
        if (now - this.lastGoogleSyncErrorNoticeAt >= 60 * 60 * 1000) {
          this.lastGoogleSyncErrorNoticeAt = now;
          const message = error instanceof Error ? error.message : String(error);
          new Notice(`Google Calendar 자동 동기화 실패: ${message}`);
        }
      });
    }, 1500);
  }

  async onExternalSettingsChange(): Promise<void> {
    await this.loadSettings();
    this.updateCheckInterval();
    await this.refreshStatus();
    this.queueGoogleCalendarSync();
  }

  async migrateLegacySchedules(): Promise<{ imported: number; cleaned: number }> {
    const prefixes = [...new Set([this.settings.propertyPrefix, DEFAULT_SETTINGS.propertyPrefix])];
    const candidates: Array<{ file: TFile; fields: ReturnType<typeof getLegacyPropertyNames> }> = [];
    let imported = 0;

    for (const file of this.app.vault.getMarkdownFiles()) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      for (const prefix of prefixes) {
        const fields = getLegacyPropertyNames(prefix);
        if (!hasLegacyProperties(frontmatter, fields)) continue;
        const legacy = readLegacySchedule(frontmatter, fields);
        if (!this.settings.schedules[file.path] && legacy) {
          this.settings.schedules[file.path] = legacy;
          imported += 1;
        }
        if (this.settings.schedules[file.path]) candidates.push({ file, fields });
      }
    }

    if (imported > 0) await this.saveSettings();

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

    if (changed) await this.saveSettings();
    if (changed) this.queueGoogleCalendarSync();
    await this.refreshStatus();
  }

  private async handleDeletedPath(path: string): Promise<void> {
    const matches = (candidate: string): boolean =>
      candidate === path || candidate.startsWith(`${path}/`);
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
    if (changed) await this.saveSettings();
    if (changed) this.queueGoogleCalendarSync();
    await this.refreshStatus();
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<EbbinghausReviewSettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
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
    this.settings.googleOAuthClientId = typeof loaded?.googleOAuthClientId === "string"
      ? loaded.googleOAuthClientId.trim()
      : DEFAULT_SETTINGS.googleOAuthClientId;
    this.settings.googleCalendarId = typeof loaded?.googleCalendarId === "string"
      ? loaded.googleCalendarId
      : DEFAULT_SETTINGS.googleCalendarId;
    this.settings.googleCalendarName = typeof loaded?.googleCalendarName === "string" &&
      loaded.googleCalendarName.trim().length > 0
      ? loaded.googleCalendarName.trim()
      : DEFAULT_SETTINGS.googleCalendarName;
    this.settings.googleReviewTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(loaded?.googleReviewTime ?? "")
      ? loaded!.googleReviewTime!
      : DEFAULT_SETTINGS.googleReviewTime;
    this.settings.googleReminderMinutes = Number.isSafeInteger(loaded?.googleReminderMinutes) &&
      Number(loaded?.googleReminderMinutes) >= 0 && Number(loaded?.googleReminderMinutes) <= 40320
      ? Number(loaded?.googleReminderMinutes)
      : DEFAULT_SETTINGS.googleReminderMinutes;
    this.settings.googleLastSyncAt = typeof loaded?.googleLastSyncAt === "string"
      ? loaded.googleLastSyncAt
      : DEFAULT_SETTINGS.googleLastSyncAt;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
    if (!file) return void new Notice("먼저 Markdown 노트를 여세요.");
    await this.withNoticeErrors(() => this.startSchedule(file));
  }

  private async completeActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice("먼저 Markdown 노트를 여세요.");
    await this.withNoticeErrors(() => this.completeReview(file));
  }

  private async undoActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice("먼저 Markdown 노트를 여세요.");
    await this.withNoticeErrors(() => this.undoReview(file));
  }

  private async snoozeActiveReview(): Promise<void> {
    const file = this.getActiveMarkdownFile();
    if (!file) return void new Notice("먼저 Markdown 노트를 여세요.");
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
    this.containerEl.createEl("h2", { text: "Ebbinghaus Review" });

    new Setting(this.containerEl)
      .setName("복습 간격")
      .setDesc("각 복습 완료 후 다음 복습까지의 일수를 쉼표로 구분합니다. 예: 1, 3, 7, 14")
      .addText((text) =>
        text.setValue(this.plugin.settings.intervals).onChange(async (value) => {
          if (!parseIntervals(value)) {
            text.inputEl.addClass("ebbinghaus-review-invalid");
            return;
          }
          text.inputEl.removeClass("ebbinghaus-review-invalid");
          this.plugin.settings.intervals = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(this.containerEl)
      .setName("알림 시각")
      .setDesc("이 시각 이후에 오늘의 복습 알림을 표시합니다.")
      .addText((text) => {
        text.inputEl.type = "time";
        text.setValue(this.plugin.settings.notificationTime).onChange(async (value) => {
          this.plugin.settings.notificationTime = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.containerEl)
      .setName("확인 주기")
      .setDesc("Obsidian이 열려 있을 때 복습 대상 노트를 확인하는 주기(분)입니다.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "1";
        text.setValue(String(this.plugin.settings.checkIntervalMinutes)).onChange(async (value) => {
          const minutes = Number(value);
          if (!Number.isSafeInteger(minutes) || minutes < 1) return;
          this.plugin.settings.checkIntervalMinutes = minutes;
          await this.plugin.saveSettings();
          this.plugin.updateCheckInterval();
        });
      });

    new Setting(this.containerEl)
      .setName("현황 패널 자동 유지")
      .setDesc("Obsidian 시작이나 플러그인 업데이트 후 패널을 자동으로 열고, 닫히면 다시 복원합니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.keepStatusPanelOpen).onChange(async (value) => {
          this.plugin.settings.keepStatusPanelOpen = value;
          await this.plugin.saveSettings();
          if (value) await this.plugin.ensureStatusView(true);
        }),
      );

    new Setting(this.containerEl)
      .setName("시작할 때 알림")
      .setDesc("설정한 알림 시각 전이라도 Obsidian을 열 때 오늘의 복습을 알려줍니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.notifyOnStartup).onChange(async (value) => {
          this.plugin.settings.notifyOnStartup = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(this.containerEl)
      .setName("시스템 알림")
      .setDesc("권한이 허용된 경우 운영체제 알림도 함께 표시합니다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.systemNotifications).onChange(async (value) => {
          if (value && typeof Notification === "undefined") {
            toggle.setValue(false);
            new Notice("이 기기에서는 시스템 알림을 사용할 수 없습니다.");
            value = false;
          } else if (value && typeof Notification !== "undefined") {
            const permission = Notification.permission === "default"
              ? await Notification.requestPermission()
              : Notification.permission;
            if (permission !== "granted") {
              toggle.setValue(false);
              new Notice("시스템 알림 권한이 허용되지 않았습니다.");
              value = false;
            }
          }
          this.plugin.settings.systemNotifications = value;
          await this.plugin.saveSettings();
        }),
      );

    this.containerEl.createEl("h3", { text: "Google Calendar 연동" });
    this.containerEl.createEl("p", {
      cls: "setting-item-description",
      text: Platform.isDesktopApp
        ? "외부 서버 없이 이 데스크톱이 복습 일정을 Google Calendar에 동기화합니다."
        : "계정 연결과 동기화는 데스크톱에서 실행됩니다. 동기화된 일정 알림은 모바일 Google Calendar 앱에서도 받을 수 있습니다.",
    });

    new Setting(this.containerEl)
      .setName("OAuth 데스크톱 클라이언트 ID")
      .setDesc("Google Cloud에서 만든 '데스크톱 앱' 유형의 클라이언트 ID입니다. 클라이언트 보안 비밀은 입력하지 않습니다.")
      .addText((text) => {
        text.setPlaceholder("…apps.googleusercontent.com");
        text.setValue(this.plugin.settings.googleOAuthClientId).onChange(async (value) => {
          this.plugin.settings.googleOAuthClientId = value.trim();
          await this.plugin.saveSettings();
        });
        text.inputEl.disabled = !Platform.isDesktopApp;
      });

    new Setting(this.containerEl)
      .setName("복습 일정 시각")
      .setDesc("Google Calendar에 생성할 15분짜리 복습 일정의 시작 시각입니다.")
      .addText((text) => {
        text.inputEl.type = "time";
        text.setValue(this.plugin.settings.googleReviewTime).onChange(async (value) => {
          if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return;
          this.plugin.settings.googleReviewTime = value;
          await this.plugin.saveSettings();
          this.plugin.queueGoogleCalendarSync();
        });
      });

    new Setting(this.containerEl)
      .setName("미리 알림")
      .setDesc("일정 시작 몇 분 전에 Google Calendar 알림을 받을지 설정합니다. 0은 시작 시각입니다.")
      .addText((text) => {
        text.inputEl.type = "number";
        text.inputEl.min = "0";
        text.inputEl.max = "40320";
        text.setValue(String(this.plugin.settings.googleReminderMinutes)).onChange(async (value) => {
          const minutes = Number(value);
          if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes > 40320) return;
          this.plugin.settings.googleReminderMinutes = minutes;
          await this.plugin.saveSettings();
          this.plugin.queueGoogleCalendarSync();
        });
      });

    const connected = this.plugin.isGoogleCalendarConnected();
    const lastSync = this.plugin.settings.googleLastSyncAt
      ? new Date(this.plugin.settings.googleLastSyncAt).toLocaleString("ko-KR")
      : "아직 동기화하지 않음";
    new Setting(this.containerEl)
      .setName(connected ? "Google Calendar 연결됨" : "Google Calendar 연결 안 됨")
      .setDesc(`마지막 동기화: ${lastSync}`)
      .addButton((button) => {
        button.setButtonText(connected ? "다시 연결" : "계정 연결");
        button.setCta();
        button.setDisabled(!Platform.isDesktopApp);
        button.onClick(async () => {
          await this.plugin.withNoticeErrors(() => this.plugin.connectGoogleCalendar());
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("지금 동기화");
        button.setDisabled(!connected);
        button.onClick(async () => {
          await this.plugin.withNoticeErrors(() => this.plugin.syncGoogleCalendar(true));
          this.display();
        });
      })
      .addButton((button) => {
        button.setButtonText("연결 해제");
        button.setWarning();
        button.setDisabled(!connected);
        button.onClick(async () => {
          await this.plugin.withNoticeErrors(() => this.plugin.disconnectGoogleCalendar());
          this.display();
        });
      });
  }
}
