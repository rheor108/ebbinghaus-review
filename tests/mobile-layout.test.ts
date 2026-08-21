import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("the phone dashboard ends above Obsidian's floating navigation", () => {
  const rule = styles.match(
    /body\.is-phone\.is-floating-nav[^{]+\{([^}]*)\}/,
  );

  assert.ok(rule, "missing floating-navigation rule for the dashboard");
  assert.match(rule[0], /\.view-content\.ebbinghaus-dashboard/);
  assert.doesNotMatch(rule[0], /\.view-content\.ebbinghaus-status-panel/);
  assert.match(
    rule[1],
    /height:\s*calc\(100% - var\(--view-top-spacing\) - var\(--view-bottom-spacing\)\)/,
  );
  assert.match(rule[1], /scroll-padding-bottom:\s*var\(--size-4-4\)/);
});

test("the phone status panel keeps its native drawer height and scrolls its content", () => {
  const rule = styles.match(/\.ebbinghaus-status-panel\s*\{([^}]*)\}/);

  assert.ok(rule, "missing status-panel rule");
  assert.match(rule[1], /overflow-y:\s*auto/);
  assert.doesNotMatch(rule[1], /height:/);
});
