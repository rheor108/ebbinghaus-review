import { ItemView, WorkspaceLeaf } from "obsidian";
import type EbbinghausReviewPlugin from "./main";
import type { ReviewItem } from "./main";
import { daysUntil, parseDateKey } from "./scheduler";
import type { I18n } from "./i18n";

export const REVIEW_DASHBOARD_VIEW_TYPE = "ebbinghaus-review-dashboard-view";
export type DashboardTab = "today" | "overdue" | "statistics";

function dueLabel(i18n: I18n, nextDate: string): string {
  const days = daysUntil(nextDate, new Date());
  if (days === null) return i18n.t("noDate");
  if (days === 0) return i18n.t("today");
  return i18n.t("daysOverdue", { count: Math.abs(days) });
}

function weekdayLabel(i18n: I18n, dateKey: string): string {
  const date = parseDateKey(dateKey);
  return date ? i18n.formatWeekday(date) : "-";
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
    return this.plugin.i18n.t("studyDashboard");
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
    heading.createEl("h2", { text: this.plugin.i18n.t("studyDashboard") });
    heading.createEl("p", { text: this.plugin.i18n.t("dashboardSubtitle") });

    const tabs = content.createDiv({ cls: "ebbinghaus-dashboard-tabs", attr: { role: "tablist" } });
    this.renderTabButton(tabs, "today", this.plugin.i18n.t("todayReview"));
    this.renderTabButton(tabs, "overdue", this.plugin.i18n.t("overdueReviews"));
    this.renderTabButton(tabs, "statistics", this.plugin.i18n.t("studyStatistics"));

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
    title.createEl("h3", { text: this.plugin.i18n.t("todayReview") });
    title.createEl("p", { text: this.plugin.i18n.t("notesDueToday") });
    sectionHeader.createEl("span", {
      cls: "ebbinghaus-dashboard-count",
      text: this.plugin.i18n.t("itemCount", { count: reviews.length }),
    });
    this.renderUndoBanner(container);

    if (reviews.length === 0) {
      const empty = container.createDiv({ cls: "ebbinghaus-dashboard-empty" });
      empty.createEl("div", { cls: "ebbinghaus-dashboard-empty-mark", text: "✓" });
      empty.createEl("h4", { text: this.plugin.i18n.t("allReviewsDoneToday") });
      empty.createEl("p", { text: this.plugin.i18n.t("newReviewsAppear") });
      return;
    }

    this.renderReviewList(container, reviews);
  }

  private renderOverdue(container: HTMLElement): void {
    const reviews = this.plugin.getOverdueReviews();
    const sectionHeader = container.createDiv({ cls: "ebbinghaus-dashboard-section-header" });
    const title = sectionHeader.createDiv();
    title.createEl("h3", { text: this.plugin.i18n.t("overdueReviews") });
    title.createEl("p", { text: this.plugin.i18n.t("overdueDescription") });
    sectionHeader.createEl("span", {
      cls: reviews.length > 0
        ? "ebbinghaus-dashboard-count is-overdue"
        : "ebbinghaus-dashboard-count",
      text: this.plugin.i18n.t("itemCount", { count: reviews.length }),
    });
    this.renderUndoBanner(container);

    if (reviews.length === 0) {
      const empty = container.createDiv({ cls: "ebbinghaus-dashboard-empty" });
      empty.createEl("div", { cls: "ebbinghaus-dashboard-empty-mark", text: "✓" });
      empty.createEl("h4", { text: this.plugin.i18n.t("noOverdueReviews") });
      empty.createEl("p", { text: this.plugin.i18n.t("schedulesOnTime") });
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
        text: dueLabel(this.plugin.i18n, review.nextDate),
      });
      main.createEl("h4", { text: review.file.basename });
      main.createEl("p", {
        text: this.plugin.i18n.t("dueDateAndStage", {
          date: review.nextDate,
          stage: review.stage + 1,
          total: this.plugin.intervals.length,
        }),
      });

      const actions = card.createDiv({ cls: "ebbinghaus-dashboard-review-actions" });
      const open = actions.createEl("button", { text: this.plugin.i18n.t("openNote") });
      open.addEventListener("click", () => {
        void this.app.workspace.getLeaf(false).openFile(review.file);
      });

      const snooze = actions.createEl("button", { text: this.plugin.i18n.t("tomorrow") });
      snooze.addEventListener("click", () => {
        void this.runAndRefresh(() => this.plugin.snoozeReview(review.file));
      });

      const complete = actions.createEl("button", {
        cls: "mod-cta",
        text: this.plugin.i18n.t("reviewComplete"),
      });
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
    message.createEl("strong", {
      text: this.plugin.i18n.t("reviewCompletedForNote", { note: latest.file.basename }),
    });
    message.createEl("small", {
      text: this.plugin.i18n.t("completionRecord", { date: latest.completedDate }),
    });
    const undo = banner.createEl("button", {
      text: this.plugin.i18n.t("undoReviewCompletion"),
    });
    undo.addEventListener("click", () => {
      void this.runAndRefresh(() => this.plugin.undoReview(latest.file));
    });
  }

  private renderStatistics(container: HTMLElement): void {
    const stats = this.plugin.getStudyStatistics();
    const sectionHeader = container.createDiv({ cls: "ebbinghaus-dashboard-section-header" });
    const title = sectionHeader.createDiv();
    title.createEl("h3", { text: this.plugin.i18n.t("studyStatistics") });
    title.createEl("p", { text: this.plugin.i18n.t("statsBasedOnCompletions") });

    const cards = container.createDiv({ cls: "ebbinghaus-stat-cards" });
    this.renderStatCard(cards, this.plugin.i18n.t("completedToday"), String(stats.reviewsToday), this.plugin.i18n.t("timesUnit"));
    this.renderStatCard(cards, this.plugin.i18n.t("studyStreak"), String(stats.streakDays), this.plugin.i18n.t("daysUnit"));
    this.renderStatCard(cards, this.plugin.i18n.t("activeNotes"), String(stats.activeNotes), this.plugin.i18n.t("notesUnit"));
    this.renderStatCard(cards, this.plugin.i18n.t("totalCompleted"), String(stats.completedNotes), this.plugin.i18n.t("notesUnit"));

    const chartCard = container.createDiv({ cls: "ebbinghaus-activity-card" });
    const chartHeader = chartCard.createDiv({ cls: "ebbinghaus-activity-header" });
    const chartTitle = chartHeader.createDiv();
    chartTitle.createEl("h4", { text: this.plugin.i18n.t("reviewsLast7Days") });
    chartTitle.createEl("p", {
      text: this.plugin.i18n.t("totalReviews", { count: stats.totalReviews }),
    });
    chartHeader.createEl("strong", {
      text: `${stats.lastSevenDaysTotal} ${this.plugin.i18n.t("timesUnit")}`,
    });

    const maxCount = Math.max(1, ...stats.dailyActivity.map((day) => day.count));
    const chart = chartCard.createDiv({ cls: "ebbinghaus-activity-chart" });
    for (const day of stats.dailyActivity) {
      const column = chart.createDiv({ cls: "ebbinghaus-activity-column" });
      const value = column.createEl("span", { text: String(day.count) });
      value.addClass("ebbinghaus-activity-value");
      const track = column.createDiv({ cls: "ebbinghaus-activity-track" });
      const bar = track.createDiv({ cls: day.count > 0 ? "is-active" : "" });
      bar.style.height = `${day.count === 0 ? 4 : Math.max(18, (day.count / maxCount) * 100)}%`;
      column.createEl("small", { text: weekdayLabel(this.plugin.i18n, day.date) });
    }

    const summary = container.createDiv({ cls: "ebbinghaus-stat-summary" });
    summary.createEl("span", { text: this.plugin.i18n.t("scheduledNotes") });
    summary.createEl("strong", { text: this.plugin.i18n.t("itemCount", { count: stats.scheduledNotes }) });
    summary.createEl("span", { text: this.plugin.i18n.t("reviewsDueToday") });
    summary.createEl("strong", { text: this.plugin.i18n.t("itemCount", { count: stats.todayDueNotes }) });
    summary.createEl("span", { text: this.plugin.i18n.t("overdueReviews") });
    summary.createEl("strong", { text: this.plugin.i18n.t("itemCount", { count: stats.overdueNotes }) });
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
