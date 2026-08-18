import assert from "node:assert/strict";
import test from "node:test";
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
} from "../src/scheduler";

test("parses a valid interval list", () => {
  assert.deepEqual(parseIntervals("1, 3, 7, 14, 30"), [1, 3, 7, 14, 30]);
});

test("rejects invalid interval lists", () => {
  assert.equal(parseIntervals("1, 0, 7"), null);
  assert.equal(parseIntervals("1, nope, 7"), null);
  assert.equal(parseIntervals("1,,7"), null);
  assert.equal(parseIntervals(""), null);
});

test("date keys use the local calendar date", () => {
  assert.equal(toDateKey(new Date(2026, 7, 18, 23, 59)), "2026-08-18");
  assert.equal(toDateKey(addDays(new Date(2026, 11, 31), 1)), "2027-01-01");
});

test("parses only real ISO calendar dates", () => {
  assert.ok(parseDateKey("2026-02-28"));
  assert.equal(parseDateKey("2026-02-30"), null);
  assert.equal(parseDateKey("2026-2-8"), null);
});

test("starts with the first configured delay", () => {
  assert.equal(firstReviewDate(new Date(2026, 7, 18), [1, 3, 7]), "2026-08-19");
});

test("advances relative to the actual completion date", () => {
  assert.deepEqual(advanceSchedule(new Date(2026, 7, 20), 0, [1, 3, 7]), {
    completed: false,
    nextDate: "2026-08-23",
    nextStage: 1,
  });
});

test("completes after the last stage", () => {
  assert.deepEqual(advanceSchedule(new Date(2026, 7, 20), 2, [1, 3, 7]), {
    completed: true,
    nextDate: null,
    nextStage: 3,
  });
});

test("a review is due on or after its local date", () => {
  assert.equal(isDue("2026-08-18", new Date(2026, 7, 18, 0, 1)), true);
  assert.equal(isDue("2026-08-18", new Date(2026, 7, 17, 23, 59)), false);
  assert.equal(isDue("invalid", new Date(2026, 7, 18)), false);
});

test("separates reviews due today from overdue reviews", () => {
  const today = new Date(2026, 7, 18, 15, 0);
  assert.equal(isDueToday("2026-08-18", today), true);
  assert.equal(isDueToday("2026-08-17", today), false);
  assert.equal(isOverdue("2026-08-17", today), true);
  assert.equal(isOverdue("2026-08-18", today), false);
  assert.equal(isOverdue("invalid", today), false);
});

test("calculates calendar days until a review across month boundaries", () => {
  assert.equal(daysUntil("2026-09-01", new Date(2026, 7, 30, 23, 59)), 2);
  assert.equal(daysUntil("2026-08-18", new Date(2026, 7, 18, 0, 1)), 0);
  assert.equal(daysUntil("2026-08-16", new Date(2026, 7, 18)), -2);
  assert.equal(daysUntil("invalid", new Date(2026, 7, 18)), null);
});

test("projects remaining review dates from the current scheduled review", () => {
  assert.deepEqual(projectReviewDates("2026-08-19", 1, [1, 3, 7, 14]), [
    null,
    "2026-08-19",
    "2026-08-26",
    "2026-09-09",
  ]);
});

test("returns an empty projection for invalid schedule data", () => {
  assert.deepEqual(projectReviewDates("invalid", 0, [1, 3, 7]), [null, null, null]);
  assert.deepEqual(projectReviewDates("2026-08-19", 3, [1, 3, 7]), [null, null, null]);
});
