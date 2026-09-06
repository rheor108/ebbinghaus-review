import assert from "node:assert/strict";
import test from "node:test";
import { ActiveMarkdownPathTracker } from "../src/active-markdown-path";

test("does not refresh when focus moves away from a note but the active note stays the same", () => {
  const tracker = new ActiveMarkdownPathTracker();
  tracker.synchronize("Study/Memory.md");

  assert.equal(tracker.shouldRefresh("Study/Memory.md"), false);
  assert.equal(tracker.shouldRefresh("Study/Memory.md"), false);
});

test("refreshes exactly once when the active note changes", () => {
  const tracker = new ActiveMarkdownPathTracker();
  tracker.synchronize("Study/Memory.md");

  assert.equal(tracker.shouldRefresh("Study/Spaced repetition.md"), true);
  assert.equal(tracker.shouldRefresh("Study/Spaced repetition.md"), false);
});

test("refreshes when entering or leaving Markdown context", () => {
  const tracker = new ActiveMarkdownPathTracker();

  assert.equal(tracker.shouldRefresh("Study/Memory.md"), true);
  assert.equal(tracker.shouldRefresh(null), true);
  assert.equal(tracker.shouldRefresh(null), false);
});
