import { ItemView, WorkspaceLeaf } from "obsidian";
import type EbbinghausReviewPlugin from "./main";
import type { ReviewItem } from "./main";
import { daysUntil, parseDateKey } from "./scheduler";

export const REVIEW_DASHBOARD_VIEW_TYPE = "ebbinghaus-review-dashboard-view";
export type DashboardTab = "today" | "overdue" | "statistics";

function dueLabel(nextDate: string): string {
  const days = daysUntil(nextDate, new Date());
  if (days === null) return "날짜 없음";
  if (days === 0) return "오늘";
  return `${Math.abs(days)}일 지남`;
}

function weekdayLabel(dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date
    ? new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date)
    : "-";
}

export class ReviewDashboardView extends ItemView {
  private activeTab: DashboardTab = "today";

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: EbbinghausReviewPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return REVIEW_DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "학습 대시보드";
  }

  getIcon(): string {
    return "layout-dashboard";
  }

  async onOpen(): Promise<void> {
    await this.render();
  }

  async setTab(tab: DashboardTab): Promise<void> {
    this.activeTab = tab;
    await this.render();
  }

  async render(): Promise<void> {
    const content = this.contentEl;
    content.empty();
    content.addClass("ebbinghaus-dashboard");

    const header = content.createDiv({ cls: "ebbinghaus-dashboard-header" });
    const heading = header.createDiv();
    heading.createEl("div", { cls: "ebbinghaus-status-eyebrow", text: "Ebbinghaus Review" });
    heading.createEl("h2", { text: "학습 대시보드" });
    heading.createEl("p", { text: "오늘 할 일과 학습 흐름을 한곳에서 확인하세요." });

    const tabs = content.createDiv({ cls: "ebbinghaus-dashboard-tabs", attr: { role: "tablist" } });
    this.renderTabButton(tabs, "today", "오늘 복습");
    this.renderTabButton(tabs, "overdue", "놓친 복습");
    this.renderTabButton(tabs, "statistics", "학습 통계");

    const body = content.createDiv({ cls: "ebbinghaus-dashboard-body" });
    if (this.activeTab === "today") this.renderToday(body);
    else if (this.activeTab === "overdue") this.renderOverdue(body);
    else this.renderStatistics(body);
  }

  private renderTabButton(container: HTMLElement, tab: DashboardTab, label: string): void {
    const button = container.createEl("button", {
      cls: this.activeTab === tab ? "is-active" : "",
      text: label,
    });
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(this.activeTab === tab));
    button.addEventListener("click", () => void this.setTab(tab));
  }

  private renderToday(container: HTMLElement): void {
    const reviews = this.plugin.getReviewsDueToday();
    const sectionHeader = container.createDiv({ cls: "ebbinghaus-dashboard-section-header" });
    const title = sectionHeader.createDiv();
    title.createEl("h3", { text: "오늘 복습" });
    title.createEl("p", { text: "예정일이 오늘인 노트입니다." });
    sectionHeader.createEl("span", {
      cls: "ebbinghaus-dashboard-count",
      text: `${reviews.length}개`,
    });
    this.renderUndoBanner(container);

    if (reviews.length === 0) {
      const empty = container.createDiv({ cls: "ebbinghaus-dashboard-empty" });
      empty.createEl("div", { cls: "ebbinghaus-dashboard-empty-mark", text: "✓" });
      empty.createEl("h4", { text: "오늘 복습을 모두 마쳤습니다" });
      empty.createEl("p", { text: "새 복습 대상이 생기면 이곳에 자동으로 표시됩니다." });
      return;
    }

    this.renderReviewList(container, reviews);
  }

  private renderOverdue(container: HTMLElement): void {
    const reviews = this.plugin.getOverdueReviews();
    const sectionHeader = container.createDiv({ cls: "ebbinghaus-dashboard-section-header" });
    const title = sectionHeader.createDiv();
    title.createEl("h3", { text: "놓친 복습" });
    title.createEl("p", { text: "예정일이 지났지만 아직 완료하지 않은 노트입니다." });
    sectionHeader.createEl("span", {
      cls: reviews.length > 0
        ? "ebbinghaus-dashboard-count is-overdue"
        : "ebbinghaus-dashboard-count",
      text: `${reviews.length}개`,
    });
    this.renderUndoBanner(container);

    if (reviews.length === 0) {
      const empty = container.createDiv({ cls: "ebbinghaus-dashboard-empty" });
      empty.createEl("div", { cls: "ebbinghaus-dashboard-empty-mark", text: "✓" });
      empty.createEl("h4", { text: "놓친 복습이 없습니다" });
      empty.createEl("p", { text: "모든 복습 일정이 제때 진행되고 있습니다." });
      return;
    }

    this.renderReviewList(container, reviews);
  }

  private renderReviewList(container: HTMLElement, reviews: ReviewItem[]): void {
    const list = container.createDiv({ cls: "ebbinghaus-dashboard-review-list" });
    for (const review of reviews) {
      const card = list.createDiv({ cls: "ebbinghaus-dashboard-review-card" });
      const main = card.createDiv({ cls: "ebbinghaus-dashboard-review-main" });
      main.createEl("span", {
        cls: review.nextDate < this.plugin.todayDateKey() ? "is-overdue" : "is-today",
        text: dueLabel(review.nextDate),
      });
      main.createEl("h4", { text: review.file.basename });
      main.createEl("p", {
        text: `예정일 ${review.nextDate} · ${review.stage + 1}/${this.plugin.intervals.length}번째 복습`,
      });

      const actions = card.createDiv({ cls: "ebbinghaus-dashboard-review-actions" });
      const open = actions.createEl("button", { text: "노트 열기" });
      open.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(review.file);
      });

      const snooze = actions.createEl("button", { text: "내일로" });
      snooze.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.snoozeReview(review.file));
      });

      const complete = actions.createEl("button", { cls: "mod-cta", text: "복습 완료" });
      complete.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.completeReview(review.file));
      });
    }
  }

  private renderUndoBanner(container: HTMLElement): void {
    const latest = this.plugin.getLatestUndoReview();
    if (!latest) return;
    const banner = container.createDiv({ cls: "ebbinghaus-undo-banner" });
    const message = banner.createDiv();
    message.createEl("strong", { text: `${latest.file.basename} 복습을 완료했습니다` });
    message.createEl("small", { text: `${latest.completedDate} 완료 기록` });
    const undo = banner.createEl("button", { text: "복습 완료 취소" });
    undo.addEventListener("click", () => {
      void this.runAndRefresh(() => this.plugin.undoReview(latest.file));
    });
  }

  private renderStatistics(container: HTMLElement): void {
    const stats = this.plugin.getStudyStatistics();
    const sectionHeader = container.createDiv({ cls: "ebbinghaus-dashboard-section-header" });
    const title = sectionHeader.createDiv();
    title.createEl("h3", { text: "학습 통계" });
    title.createEl("p", { text: "복습 완료 기록을 기준으로 계산합니다." });

    const cards = container.createDiv({ cls: "ebbinghaus-stat-cards" });
    this.renderStatCard(cards, "오늘 완료", String(stats.reviewsToday), "회");
    this.renderStatCard(cards, "연속 학습", String(stats.streakDays), "일");
    this.renderStatCard(cards, "진행 중 노트", String(stats.activeNotes), "개");
    this.renderStatCard(cards, "전체 완료", String(stats.completedNotes), "개");

    const chartCard = container.createDiv({ cls: "ebbinghaus-activity-card" });
    const chartHeader = chartCard.createDiv({ cls: "ebbinghaus-activity-header" });
    const chartTitle = chartHeader.createDiv();
    chartTitle.createEl("h4", { text: "최근 7일 복습량" });
    chartTitle.createEl("p", { text: `누적 복습 ${stats.totalReviews}회` });
    chartHeader.createEl("strong", { text: `${stats.lastSevenDaysTotal}회` });

    const maxCount = Math.max(1, ...stats.dailyActivity.map((day) => day.count));
    const chart = chartCard.createDiv({ cls: "ebbinghaus-activity-chart" });
    for (const day of stats.dailyActivity) {
      const column = chart.createDiv({ cls: "ebbinghaus-activity-column" });
      const value = column.createEl("span", { text: String(day.count) });
      value.addClass("ebbinghaus-activity-value");
      const track = column.createDiv({ cls: "ebbinghaus-activity-track" });
      const bar = track.createDiv({ cls: day.count > 0 ? "is-active" : "" });
      bar.style.height = `${day.count === 0 ? 4 : Math.max(18, (day.count / maxCount) * 100)}%`;
      column.createEl("small", { text: weekdayLabel(day.date) });
    }

    const summary = container.createDiv({ cls: "ebbinghaus-stat-summary" });
    summary.createEl("span", { text: "복습 일정이 있는 노트" });
    summary.createEl("strong", { text: `${stats.scheduledNotes}개` });
    summary.createEl("span", { text: "오늘 복습 대상" });
    summary.createEl("strong", { text: `${stats.todayDueNotes}개` });
    summary.createEl("span", { text: "놓친 복습" });
    summary.createEl("strong", { text: `${stats.overdueNotes}개` });
  }

  private renderStatCard(
    container: HTMLElement,
    label: string,
    value: string,
    unit: string,
  ): void {
    const card = container.createDiv({ cls: "ebbinghaus-stat-card" });
    card.createEl("span", { text: label });
    const figure = card.createDiv();
    figure.createEl("strong", { text: value });
    figure.createEl("small", { text: unit });
  }

  private async runAndRefresh(action: () => Promise<void>): Promise<void> {
    await this.plugin.withNoticeErrors(action);
    await this.render();
  }
}
