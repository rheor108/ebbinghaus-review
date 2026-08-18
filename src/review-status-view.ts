import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type EbbinghausReviewPlugin from "./main";

export const REVIEW_STATUS_VIEW_TYPE = "ebbinghaus-review-status-view";

function timingLabel(days: number | null): string {
  if (days === null) return "날짜 없음";
  if (days === 0) return "오늘 복습";
  if (days > 0) return `${days}일 후`;
  return `${Math.abs(days)}일 지남`;
}

function stepTimingLabel(days: number | null): string {
  if (days === null) return "날짜 미정";
  if (days === 0) return "오늘";
  if (days > 0) return `${days}일 후`;
  return `${Math.abs(days)}일 전`;
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
    return "복습 현황";
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
    titleBlock.createEl("div", { cls: "ebbinghaus-status-eyebrow", text: "현재 노트" });
    titleBlock.createEl("h3", { text: file?.basename ?? "열린 Markdown 노트 없음" });

    if (!file) {
      content.createEl("p", {
        cls: "ebbinghaus-status-empty",
        text: "Markdown 노트를 열면 이곳에 복습 진행 상황이 표시됩니다.",
      });
      return;
    }

    const state = this.plugin.getReviewState(file);
    const badgeText = state.status === "active"
      ? timingLabel(state.daysUntilNext)
      : state.status === "completed"
        ? "전체 완료"
        : state.status === "paused"
          ? "일정 중지"
          : "일정 없음";
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
    progressTop.createEl("span", { text: "전체 진행률" });
    progressTop.createEl("strong", {
      text: `${state.completedCount}/${state.totalStages} 완료`,
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
        ? `${stepState.date} · ${stepTimingLabel(stepState.daysFromToday)}${stepState.status === "completed" ? " · 완료" : ""}`
        : stepState?.status === "completed"
          ? "완료 날짜 기록 없음"
          : "날짜 미정";
      step.setAttribute("aria-label", tooltip);
      step.setAttribute("data-tooltip-position", "top");
    }

    const facts = content.createDiv({ cls: "ebbinghaus-status-facts" });
    if (state.status === "active") {
      this.renderFact(facts, "다음 복습", state.nextDate ?? "날짜 없음", timingLabel(state.daysUntilNext));
    }
    this.renderFact(facts, "마지막 복습", state.lastDate ?? "아직 없음");
    this.renderFact(facts, "일정 시작", state.startedDate ?? "알 수 없음");

    const schedule = content.createDiv({ cls: "ebbinghaus-schedule-preview" });
    schedule.createEl("div", { cls: "ebbinghaus-status-eyebrow", text: "복습 간격" });
    schedule.createEl("p", { text: this.plugin.intervals.map((days) => `${days}일`).join(" → ") });

    const actions = content.createDiv({ cls: "ebbinghaus-status-panel-actions" });
    if (state.status === "active") {
      const reviewed = actions.createEl("button", { cls: "mod-cta", text: "복습 완료" });
      reviewed.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.completeReview(file), version);
      });

      const snooze = actions.createEl("button", { text: "내일로 미루기" });
      snooze.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.snoozeReview(file), version);
      });
    }

    if (this.plugin.canUndoReview(file)) {
      const undo = actions.createEl("button", {
        cls: "ebbinghaus-undo-review",
        text: "복습 완료 취소",
      });
      undo.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.undoReview(file), version);
      });
    }

    const restart = actions.createEl("button", {
      text: state.status === "completed" ? "일정 다시 시작" : "처음부터 재시작",
    });
    restart.addEventListener("click", () => {
      void this.runAndRefresh(() => this.plugin.startSchedule(file), version);
    });
  }

  private renderUnscheduled(content: HTMLElement, file: TFile): void {
    const empty = content.createDiv({ cls: "ebbinghaus-status-empty-card" });
    empty.createEl("div", { cls: "ebbinghaus-status-empty-icon", text: "↗" });
    empty.createEl("h4", { text: "아직 복습 일정이 없습니다" });
    empty.createEl("p", {
      text: `기본 간격 ${this.plugin.intervals.join(" · ")}일로 복습을 시작할 수 있습니다.`,
    });
    const start = empty.createEl("button", { cls: "mod-cta", text: "복습 일정 시작" });
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
