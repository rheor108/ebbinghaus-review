import assert from "node:assert/strict";
import test from "node:test";
import type { Command } from "obsidian";
import { reregisterCommand } from "../src/localized-command";

test("re-registers a localized command so Obsidian reapplies the plugin prefix", () => {
  const removed: string[] = [];
  const added: Command[] = [];
  const registered = {
    id: "ebbinghaus-review:open-study-dashboard",
    name: "Note Review Reminder: 학습 대시보드 열기",
  } as Command;
  const definition = {
    id: "open-study-dashboard",
    callback: () => undefined,
  } satisfies Omit<Command, "name">;

  const refreshed = reregisterCommand(
    registered,
    definition,
    "Open the study dashboard",
    (commandId) => removed.push(commandId),
    (command) => {
      added.push(command);
      return {
        ...command,
        id: `ebbinghaus-review:${command.id}`,
        name: `Note Review Reminder: ${command.name}`,
      };
    },
  );

  assert.deepEqual(removed, ["ebbinghaus-review:open-study-dashboard"]);
  assert.equal(added[0]?.id, "open-study-dashboard");
  assert.equal(added[0]?.name, "Open the study dashboard");
  assert.equal(refreshed.id, "ebbinghaus-review:open-study-dashboard");
  assert.equal(refreshed.name, "Note Review Reminder: Open the study dashboard");
});
