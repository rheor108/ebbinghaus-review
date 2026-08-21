import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MANUAL_REFRESH_RETRY_ATTEMPTS,
  MANUAL_REFRESH_RETRY_DELAY_MS,
  settingsFingerprint,
} from "../src/settings-sync";

const mainSource = await readFile(new URL("../src/main.ts", import.meta.url), "utf8");

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

test("manual refresh retries are fast and bounded", () => {
  assert.equal(MANUAL_REFRESH_RETRY_DELAY_MS, 500);
  assert.equal(MANUAL_REFRESH_RETRY_ATTEMPTS, 20);
  assert.equal(
    MANUAL_REFRESH_RETRY_DELAY_MS * MANUAL_REFRESH_RETRY_ATTEMPTS,
    10_000,
  );
});

test("uses Obsidian's external settings callback instead of frequent polling", () => {
  assert.match(mainSource, /async onExternalSettingsChange\(\): Promise<void>/);
  assert.match(mainSource, /async refreshSyncedData\(\): Promise<void>/);
  assert.match(mainSource, /MANUAL_REFRESH_RETRY_ATTEMPTS/);
  assert.match(mainSource, /window\.setTimeout\(resolve, MANUAL_REFRESH_RETRY_DELAY_MS\)/);
  assert.match(mainSource, /document, "visibilitychange"/);
  assert.match(mainSource, /window, "focus"/);
  assert.doesNotMatch(mainSource, /SETTINGS_SYNC_INTERVAL_MS/);
  assert.doesNotMatch(mainSource, /startSettingsSync/);
  assert.doesNotMatch(mainSource, /setInterval\([\s\S]{0,160}synchronizeSettingsFromDisk/);
});
