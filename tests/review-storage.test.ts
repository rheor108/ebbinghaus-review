import assert from "node:assert/strict";
import test from "node:test";
import {
  getLegacyPropertyNames,
  hasLegacyProperties,
  normalizeStoredSchedule,
  readLegacySchedule,
} from "../src/review-storage";

const fields = getLegacyPropertyNames("ebbinghaus_review");

test("reads a legacy frontmatter schedule for internal migration", () => {
  assert.deepEqual(readLegacySchedule({
    ebbinghaus_review_enabled: true,
    ebbinghaus_review_started: "2026-08-18",
    ebbinghaus_review_stage: 1,
    ebbinghaus_review_next: "2026-08-19",
    ebbinghaus_review_last: "2026-08-18",
    ebbinghaus_review_history: [null, "2026-08-18"],
  }, fields), {
    enabled: true,
    startedDate: "2026-08-18",
    stage: 1,
    nextDate: "2026-08-19",
    lastDate: "2026-08-18",
    history: [null, "2026-08-18"],
  });
});

test("ignores unrelated properties and invalid legacy schedules", () => {
  assert.equal(hasLegacyProperties({ title: "Note" }, fields), false);
  assert.equal(readLegacySchedule({
    ebbinghaus_review_started: "not-a-date",
  }, fields), null);
});

test("validates schedules loaded from plugin data", () => {
  const schedule = {
    enabled: false,
    startedDate: "2026-08-18",
    stage: 7,
    nextDate: null,
    lastDate: "2026-12-16",
    history: ["2026-08-19", null],
  };
  assert.deepEqual(normalizeStoredSchedule(schedule), schedule);
  assert.equal(normalizeStoredSchedule({ ...schedule, stage: -1 }), null);
  assert.equal(normalizeStoredSchedule({ ...schedule, history: ["invalid"] }), null);
});
