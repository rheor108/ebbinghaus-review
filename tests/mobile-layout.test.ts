import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");

test("phone plugin views end above Obsidian's floating navigation", () => {
  const rule = styles.match(
    /body\.is-phone\.is-floating-nav[^{]+\{([^}]*)\}/,
  );

  assert.ok(rule, "missing shared floating-navigation rule for plugin views");
  assert.match(rule[0], /\.view-content\.ebbinghaus-dashboard/);
  assert.match(rule[0], /\.view-content\.ebbinghaus-status-panel/);
  assert.match(
    rule[1],
    /height:\s*calc\(100% - var\(--view-top-spacing\) - var\(--view-bottom-spacing\)\)/,
  );
  assert.match(rule[1], /scroll-padding-bottom:\s*var\(--size-4-4\)/);
});
