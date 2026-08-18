import { addDays, parseDateKey, toDateKey } from "./scheduler";

export interface ReviewActivityEntry {
  date: string;
  filePath: string;
  stage: number;
}

export interface DailyActivity {
  date: string;
  count: number;
}

function validActivityDates(entries: readonly ReviewActivityEntry[]): string[] {
  return entries
    .map((entry) => entry.date)
    .filter((date) => parseDateKey(date) !== null);
}

export function buildDailyActivity(
  entries: readonly ReviewActivityEntry[],
  today: Date,
  dayCount = 7,
): DailyActivity[] {
  const counts = new Map<string, number>();
  for (const date of validActivityDates(entries)) {
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return Array.from({ length: dayCount }, (_, index) => {
    const date = toDateKey(addDays(today, index - dayCount + 1));
    return { date, count: counts.get(date) ?? 0 };
  });
}

export function calculateCurrentStreak(
  entries: readonly ReviewActivityEntry[],
  today: Date,
): number {
  const activeDates = new Set(validActivityDates(entries));
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!activeDates.has(toDateKey(cursor))) cursor = addDays(cursor, -1);

  let streak = 0;
  while (activeDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function deduplicateActivity(
  entries: readonly ReviewActivityEntry[],
): ReviewActivityEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.filePath}\u0000${entry.stage}\u0000${entry.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function removeActivityEntry(
  entries: readonly ReviewActivityEntry[],
  target: ReviewActivityEntry,
): ReviewActivityEntry[] {
  return entries.filter((entry) => !(
    entry.date === target.date &&
    entry.filePath === target.filePath &&
    entry.stage === target.stage
  ));
}
