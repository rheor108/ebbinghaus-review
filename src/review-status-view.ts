import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type EbbinghausReviewPlugin from "./main";
import type { I18n } from "./i18n";

export const REVIEW_STATUS_VIEW_TYPE = "ebbinghaus-review-status-view";

function timingLabel(i18n: I18n, days: number | null): string {
  if (days === null) return i18n.t("noDate");
  if (days === 0) return i18n.t("todayReview");
  if (days > 0) return i18n.t("inDays", { count: days });
  return i18n.t("daysOverdue", { count: Math.abs(days) });
}

function stepTimingLabel(i18n: I18n, days: number | null): string {
  if (days === null) return i18n.t("dateTbd");
  if (days === 0) return i18n.t("today");
  if (days > 0) return i18n.t("inDays", { count: days });
  return i18n.t("daysAgo", { count: Math.abs(days) });
}

export class ReviewStatusView extends ItemView {
  private renderVersion = 0;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: EbbinghausReviewPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return REVIEW_STATUS_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.i18n.t("reviewStatus");
  }

  getIcon(): string {
    return "chart-no-axes-column-increasing";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async render(): Promise<void> {
    const version = ++this.renderVersion;
    const content = this.contentEl;
    content.empty();
    content.addClass("ebbinghaus-status-panel");

    const file = this.plugin.getActiveMarkdownFile();
    const header = content.createDiv({ cls: "ebbinghaus-status-header" });
    const titleBlock = header.createDiv();
    titleBlock.createEl("div", {
      cls: "ebbinghaus-status-eyebrow",
      text: this.plugin.i18n.t("currentNote"),
    });
    titleBlock.createEl("h3", {
      text: file?.basename ?? this.plugin.i18n.t("noMarkdownNoteOpen"),
    });

    if (!file) {
      content.createEl("p", {
        cls: "ebbinghaus-status-empty",
        text: this.plugin.i18n.t("openMarkdownToSeeProgress"),
      });
      return;
    }

    const state = this.plugin.getReviewState(file);
    const badgeText = state.status === "active"
      ? timingLabel(this.plugin.i18n, state.daysUntilNext)
      : state.status === "completed"
        ? this.plugin.i18n.t("allComplete")
        : state.status === "paused"
          ? this.plugin.i18n.t("schedulePaused")
          : this.plugin.i18n.t("noSchedule");
    header.createEl("span", {
      cls: `ebbinghaus-status-badge is-${state.status}`,
      text: badgeText,
    });

    if (state.status === "unscheduled") {
      this.renderUnscheduled(content, file);
      return;
    }

    const progressCard = content.createDiv({ cls: "ebbinghaus-progress-card" });
    const progressTop = progressCard.createDiv({ cls: "ebbinghaus-progress-top" });
    progressTop.createEl("span", { text: this.plugin.i18n.t("overallProgress") });
    progressTop.createEl("strong", {
      text: this.plugin.i18n.t("progressComplete", {
        completed: state.completedCount,
        total: state.totalStages,
      }),
    });

    const progress = progressCard.createDiv({ cls: "ebbinghaus-progress-track" });
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute("aria-valuemax", String(state.totalStages));
    progress.setAttribute("aria-valuenow", String(state.completedCount));
    const fill = progress.createDiv({ cls: "ebbinghaus-progress-fill" });
    fill.style.width = `${state.progressPercent}%`;

    const steps = progressCard.createDiv({ cls: "ebbinghaus-progress-steps" });
    for (let index = 0; index < state.totalStages; index += 1) {
      const stepState = state.steps[index];
      const step = steps.createEl("span", {
        cls: index < state.completedCount
          ? "is-complete"
          : index === state.completedCount && state.status === "active"
            ? "is-current"
            : "",
        text: String(index + 1),
      });
      const tooltip = stepState?.date
        ? `${stepState.date} · ${stepTimingLabel(this.plugin.i18n, stepState.daysFromToday)}${stepState.status === "completed" ? ` · ${this.plugin.i18n.t("completed")}` : ""}`
        : stepState?.status === "completed"
          ? this.plugin.i18n.t("completedDateMissing")
          : this.plugin.i18n.t("dateTbd");
      step.setAttribute("aria-label", tooltip);
      step.setAttribute("data-tooltip-position", "top");
    }

    const facts = content.createDiv({ cls: "ebbinghaus-status-facts" });
    if (state.status === "active") {
      this.renderFact(
        facts,
        this.plugin.i18n.t("nextReview"),
        state.nextDate ?? this.plugin.i18n.t("noDate"),
        timingLabel(this.plugin.i18n, state.daysUntilNext),
      );
    }
    this.renderFact(
      facts,
      this.plugin.i18n.t("lastReview"),
      state.lastDate ?? this.plugin.i18n.t("noneYet"),
    );
    this.renderFact(
      facts,
      this.plugin.i18n.t("scheduleStarted"),
      state.startedDate ?? this.plugin.i18n.t("unknown"),
    );

    const schedule = content.createDiv({ cls: "ebbinghaus-schedule-preview" });
    schedule.createEl("div", {
      cls: "ebbinghaus-status-eyebrow",
      text: this.plugin.i18n.t("reviewIntervals"),
    });
    schedule.createEl("p", {
      text: this.plugin.intervals
        .map((days) => this.plugin.i18n.t("intervalDay", { count: days }))
        .join(" → "),
    });

    const actions = content.createDiv({ cls: "ebbinghaus-status-panel-actions" });
    if (state.status === "active") {
      const reviewed = actions.createEl("button", {
        cls: "mod-cta",
        text: this.plugin.i18n.t("reviewComplete"),
      });
      reviewed.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.completeReview(file), version);
      });

      const snooze = actions.createEl("button", {
        text: this.plugin.i18n.t("postponeUntilTomorrow"),
      });
      snooze.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.snoozeReview(file), version);
      });
    }

    if (this.plugin.canUndoReview(file)) {
      const undo = actions.createEl("button", {
        cls: "ebbinghaus-undo-review",
        text: this.plugin.i18n.t("undoReviewCompletion"),
      });
      undo.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.undoReview(file), version);
      });
    }

    const restart = actions.createEl("button", {
      text: state.status === "completed"
        ? this.plugin.i18n.t("restartSchedule")
        : this.plugin.i18n.t("restartFromBeginning"),
    });
    restart.addEventListener("click", () => {
      void this.runAndRefresh(() => this.plugin.startSchedule(file), version);
    });
  }

  private renderUnscheduled(content: HTMLElement, file: TFile): void {
    const empty = content.createDiv({ cls: "ebbinghaus-status-empty-card" });
    empty.createEl("div", { cls: "ebbinghaus-status-empty-icon", text: "↗" });
    empty.createEl("h4", { text: this.plugin.i18n.t("noReviewScheduleYet") });
    empty.createEl("p", {
      text: this.plugin.i18n.t("startWithDefaultIntervals", {
        intervals: this.plugin.intervals
          .map((days) => this.plugin.i18n.t("intervalDay", { count: days }))
          .join(" · "),
      }),
    });
    const start = empty.createEl("button", {
      cls: "mod-cta",
      text: this.plugin.i18n.t("startReviewSchedule"),
    });
    start.addEventListener("click", () => {
      void this.runAndRefresh(() => this.plugin.startSchedule(file), this.renderVersion);
    });
  }

  private renderFact(
    container: HTMLElement,
    label: string,
    value: string,
    detail?: string,
  ): void {
    const row = container.createDiv({ cls: "ebbinghaus-status-fact" });
    row.createEl("span", { text: label });
    const valueBlock = row.createDiv();
    valueBlock.createEl("strong", { text: value });
    if (detail) valueBlock.createEl("small", { text: detail });
  }

  private async runAndRefresh(action: () => Promise<void>, version: number): Promise<void> {
    await this.plugin.withNoticeErrors(action);
    if (version <= this.renderVersion) await this.render();
  }
}
