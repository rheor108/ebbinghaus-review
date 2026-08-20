import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/review-status-view.ts", import.meta.url), "utf8");

test("the review status panel always offers a localized dashboard shortcut", () => {
  const buttonIndex = source.indexOf('cls: "ebbinghaus-open-dashboard"');
  const noFileGuardIndex = source.indexOf("if (!file)");

  assert.ok(buttonIndex >= 0, "missing dashboard shortcut button");
  assert.ok(
    buttonIndex < noFileGuardIndex,
    "dashboard shortcut should render even when no Markdown note is open",
  );
  assert.match(source, /i18n\.t\("commandOpenDashboard"\)/);
  assert.match(source, /setIcon\(dashboardIcon, "layout-dashboard"\)/);
  assert.match(source, /activateDashboard\("today"\)/);
});
