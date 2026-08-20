import assert from "node:assert/strict";
import test from "node:test";
import { pluginCommandName } from "../src/command-label";

test("localized command names keep the searchable plugin prefix", () => {
  assert.equal(
    pluginCommandName("Ebbinghaus Review", "Open the study dashboard"),
    "Ebbinghaus Review: Open the study dashboard",
  );
  assert.equal(
    pluginCommandName("Ebbinghaus Review", "학습 대시보드 열기"),
    "Ebbinghaus Review: 학습 대시보드 열기",
  );
});
