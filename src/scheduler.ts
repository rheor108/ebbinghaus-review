export type DateKey = `${number}-${number}-${number}`;

export interface ScheduleAdvance {
  completed: boolean;
  nextDate: DateKey | null;
  nextStage: number;
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}` as DateKey;
}

export function parseDateKey(value: unknown): Date | null {
  if (typeof value !== "string") return null;

  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + days);
  return result;
}

export function parseIntervals(value: string): number[] | null {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part.length === 0)) return null;

  const intervals = parts.map(Number);
  if (
    intervals.some(
      (interval) => !Number.isSafeInteger(interval) || interval < 1 || interval > 36500,
    )
  ) {
    return null;
  }

  return intervals;
}

export function firstReviewDate(startedAt: Date, intervals: readonly number[]): DateKey {
  if (intervals.length === 0) throw new Error("At least one review interval is required.");
  return toDateKey(addDays(startedAt, intervals[0]));
}

export function advanceSchedule(
  completedAt: Date,
  currentStage: number,
  intervals: readonly number[],
): ScheduleAdvance {
  const nextStage = Math.max(0, currentStage) + 1;
  if (nextStage >= intervals.length) {
    return { completed: true, nextDate: null, nextStage };
  }

  return {
    completed: false,
    nextDate: toDateKey(addDays(completedAt, intervals[nextStage])),
    nextStage,
  };
}

export function isDue(nextReview: unknown, today: Date): boolean {
  const date = parseDateKey(nextReview);
  if (!date) return false;
  return date.getTime() <= parseDateKey(toDateKey(today))!.getTime();
}

export function isDueToday(nextReview: unknown, today: Date): boolean {
  return daysUntil(nextReview, today) === 0;
}

export function isOverdue(nextReview: unknown, today: Date): boolean {
  const days = daysUntil(nextReview, today);
  return days !== null && days < 0;
}

export function daysUntil(dateKey: unknown, today: Date): number | null {
  const target = parseDateKey(dateKey);
  if (!target) return null;

  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetDay - todayDay) / 86_400_000);
}

export function projectReviewDates(
  nextReview: unknown,
  currentStage: number,
  intervals: readonly number[],
): Array<DateKey | null> {
  const projected: Array<DateKey | null> = Array.from(
    { length: intervals.length },
    () => null,
  );
  const nextDate = parseDateKey(nextReview);
  if (!nextDate || currentStage < 0 || currentStage >= intervals.length) return projected;

  let cursor = nextDate;
  projected[currentStage] = toDateKey(cursor);
  for (let stage = currentStage + 1; stage < intervals.length; stage += 1) {
    cursor = addDays(cursor, intervals[stage]);
    projected[stage] = toDateKey(cursor);
  }

  return projected;
}
