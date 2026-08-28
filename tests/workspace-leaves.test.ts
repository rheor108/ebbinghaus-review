import assert from "node:assert/strict";
import test from "node:test";
import { keepSingleWorkspaceLeaf } from "../src/workspace-leaves";

interface FakeLeaf {
  id: string;
  detached: boolean;
  detach(): void;
}

function leaf(id: string): FakeLeaf {
  return {
    id,
    detached: false,
    detach() {
      this.detached = true;
    },
  };
}

test("keeps the active status leaf and detaches every duplicate", () => {
  const first = leaf("first");
  const active = leaf("active");
  const third = leaf("third");

  const kept = keepSingleWorkspaceLeaf([first, active, third], active);

  assert.equal(kept, active);
  assert.equal(active.detached, false);
  assert.equal(first.detached, true);
  assert.equal(third.detached, true);
});

test("keeps the first status leaf when the preferred leaf is unavailable", () => {
  const first = leaf("first");
  const second = leaf("second");
  const unrelated = leaf("unrelated");

  const kept = keepSingleWorkspaceLeaf([first, second], unrelated);

  assert.equal(kept, first);
  assert.equal(first.detached, false);
  assert.equal(second.detached, true);
});

test("returns undefined when no status leaf exists", () => {
  assert.equal(keepSingleWorkspaceLeaf([]), undefined);
});
