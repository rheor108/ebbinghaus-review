import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/review-dashboard-view.ts", import.meta.url), "utf8");

test("the dashboard header offers a localized manual refresh", () => {
  assert.match(source, /cls: "ebbinghaus-refresh-data"/);
  assert.match(source, /i18n\.t\("refresh"\)/);
  assert.match(source, /setIcon\(refreshIcon, "refresh-cw"\)/);
  assert.match(source, /plugin\.refreshSyncedData\(\)/);
});
