import assert from "node:assert/strict";
import test from "node:test";
import { normalizeStoredSchedule } from "../src/review-storage";

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
