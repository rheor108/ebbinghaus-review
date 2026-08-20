import assert from "node:assert/strict";
import test from "node:test";
import { settingsFingerprint } from "../src/settings-sync";

test("settings fingerprint ignores object key order", () => {
  const first = {
    schedules: {
      "Notes/A.md": { stage: 2, history: ["2026-08-20"] },
    },
    intervals: "1, 3, 7",
  };
  const second = {
    intervals: "1, 3, 7",
    schedules: {
      "Notes/A.md": { history: ["2026-08-20"], stage: 2 },
    },
  };

  assert.equal(settingsFingerprint(first), settingsFingerprint(second));
});

test("settings fingerprint changes with a synced review completion", () => {
  const before = {
    schedules: {
      "Notes/A.md": { stage: 2, lastDate: "2026-08-19" },
    },
  };
  const after = {
    schedules: {
      "Notes/A.md": { stage: 3, lastDate: "2026-08-20" },
    },
  };

  assert.notEqual(settingsFingerprint(before), settingsFingerprint(after));
});

test("settings fingerprint changes with a language preference", () => {
  assert.notEqual(
    settingsFingerprint({ language: "auto" }),
    settingsFingerprint({ language: "ko" }),
  );
});
