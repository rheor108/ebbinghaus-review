import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("mobile plugin views clear the floating navigation and device safe area", () => {
  const rule = styles.match(
    /\.is-mobile \.ebbinghaus-dashboard,\s*\.is-mobile \.ebbinghaus-status-panel\s*\{([^}]*)\}/,
  );

  assert.ok(rule, "missing shared mobile-safe-area rule for plugin views");
  assert.match(rule[1], /env\(safe-area-inset-bottom,\s*0px\)/);
  assert.match(rule[1], /padding-bottom:\s*var\(--ebbinghaus-mobile-bottom-clearance\)/);
  assert.match(rule[1], /scroll-padding-bottom:\s*var\(--ebbinghaus-mobile-bottom-clearance\)/);
});
