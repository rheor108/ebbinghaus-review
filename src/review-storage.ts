import { parseDateKey } from "./scheduler";

export interface StoredReviewSchedule {
  enabled: boolean;
  startedDate: string;
  stage: number;
  nextDate: string | null;
  lastDate: string | null;
  history: Array<string | null>;
}

function validDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && parseDateKey(value) !== null);
}

export function normalizeStoredSchedule(value: unknown): StoredReviewSchedule | null {
  if (!value || typeof value !== "object") return null;
  const schedule = value as Record<string, unknown>;
  const rawHistory: unknown = schedule.history;
  if (
    typeof schedule.enabled !== "boolean" ||
    typeof schedule.startedDate !== "string" ||
    parseDateKey(schedule.startedDate) === null ||
    !Number.isSafeInteger(schedule.stage) ||
    Number(schedule.stage) < 0 ||
    !validDateOrNull(schedule.nextDate) ||
    !validDateOrNull(schedule.lastDate) ||
    !Array.isArray(rawHistory) ||
    !rawHistory.every((date: unknown) => validDateOrNull(date))
  ) {
    return null;
  }

  return {
    enabled: schedule.enabled,
    startedDate: schedule.startedDate,
    stage: Number(schedule.stage),
    nextDate: schedule.nextDate,
    lastDate: schedule.lastDate,
    history: rawHistory.map((date: unknown) => validDateOrNull(date) ? date : null),
  };
}
