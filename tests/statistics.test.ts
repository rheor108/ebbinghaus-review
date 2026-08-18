import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDailyActivity,
  calculateCurrentStreak,
  deduplicateActivity,
  removeActivityEntry,
  type ReviewActivityEntry,
} from "../src/statistics";

const activity: ReviewActivityEntry[] = [
  { date: "2026-08-16", filePath: "a.md", stage: 0 },
  { date: "2026-08-17", filePath: "a.md", stage: 1 },
  { date: "2026-08-18", filePath: "a.md", stage: 2 },
  { date: "2026-08-18", filePath: "b.md", stage: 0 },
];

test("builds a chronological activity window", () => {
  assert.deepEqual(buildDailyActivity(activity, new Date(2026, 7, 18), 4), [
    { date: "2026-08-15", count: 0 },
    { date: "2026-08-16", count: 1 },
    { date: "2026-08-17", count: 1 },
    { date: "2026-08-18", count: 2 },
  ]);
});

test("counts a streak ending today", () => {
  assert.equal(calculateCurrentStreak(activity, new Date(2026, 7, 18)), 3);
});

test("keeps a streak alive when the latest activity was yesterday", () => {
  assert.equal(calculateCurrentStreak(activity.slice(0, 2), new Date(2026, 7, 18)), 2);
});

test("returns zero when there is no activity today or yesterday", () => {
  assert.equal(calculateCurrentStreak(activity.slice(0, 1), new Date(2026, 7, 18)), 0);
});

test("deduplicates the same note, stage, and date", () => {
  assert.equal(deduplicateActivity([...activity, activity[0]]).length, activity.length);
});

test("removes only the matching completion record", () => {
  const remaining = removeActivityEntry(activity, {
    date: "2026-08-18",
    filePath: "a.md",
    stage: 2,
  });
  assert.equal(remaining.length, 3);
  assert.ok(remaining.some((entry) => entry.filePath === "b.md" && entry.date === "2026-08-18"));
});
