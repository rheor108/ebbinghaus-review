import { parseDateKey } from "./scheduler";

export interface StoredReviewSchedule {
  enabled: boolean;
  startedDate: string;
  stage: number;
  nextDate: string | null;
  lastDate: string | null;
  history: Array<string | null>;
}

export interface LegacyPropertyNames {
  enabled: string;
  started: string;
  stage: string;
  next: string;
  last: string;
  history: string;
}

function validDateOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && parseDateKey(value) !== null);
}

export function getLegacyPropertyNames(prefix: string): LegacyPropertyNames {
  return {
    enabled: `${prefix}_enabled`,
    started: `${prefix}_started`,
    stage: `${prefix}_stage`,
    next: `${prefix}_next`,
    last: `${prefix}_last`,
    history: `${prefix}_history`,
  };
}

export function normalizeStoredSchedule(value: unknown): StoredReviewSchedule | null {
  if (!value || typeof value !== "object") return null;
  const schedule = value as Record<string, unknown>;
  if (
    typeof schedule.enabled !== "boolean" ||
    typeof schedule.startedDate !== "string" ||
    parseDateKey(schedule.startedDate) === null ||
    !Number.isSafeInteger(schedule.stage) ||
    Number(schedule.stage) < 0 ||
    !validDateOrNull(schedule.nextDate) ||
    !validDateOrNull(schedule.lastDate) ||
    !Array.isArray(schedule.history) ||
    !schedule.history.every((date) => validDateOrNull(date))
  ) {
    return null;
  }

  return {
    enabled: schedule.enabled,
    startedDate: schedule.startedDate,
    stage: Number(schedule.stage),
    nextDate: schedule.nextDate,
    lastDate: schedule.lastDate,
    history: [...schedule.history],
  };
}

export function readLegacySchedule(
  frontmatter: unknown,
  fields: LegacyPropertyNames,
): StoredReviewSchedule | null {
  if (!frontmatter || typeof frontmatter !== "object") return null;
  const values = frontmatter as Record<string, unknown>;
  const startedDate = values[fields.started];
  if (typeof startedDate !== "string" || parseDateKey(startedDate) === null) return null;

  const rawStage = Number(values[fields.stage]);
  const stage = Number.isSafeInteger(rawStage) && rawStage >= 0 ? rawStage : 0;
  const nextDate = validDateOrNull(values[fields.next] ?? null)
    ? (values[fields.next] ?? null) as string | null
    : null;
  const lastDate = validDateOrNull(values[fields.last] ?? null)
    ? (values[fields.last] ?? null) as string | null
    : null;
  const rawHistory: unknown[] = Array.isArray(values[fields.history])
    ? values[fields.history] as unknown[]
    : [];
  const history = rawHistory.map((date) =>
    typeof date === "string" && parseDateKey(date) !== null ? date : null);

  return {
    enabled: values[fields.enabled] === true,
    startedDate,
    stage,
    nextDate,
    lastDate,
    history,
  };
}

export function hasLegacyProperties(
  frontmatter: unknown,
  fields: LegacyPropertyNames,
): boolean {
  if (!frontmatter || typeof frontmatter !== "object") return false;
  const values = frontmatter as Record<string, unknown>;
  return Object.values(fields).some((field) => Object.prototype.hasOwnProperty.call(values, field));
}
