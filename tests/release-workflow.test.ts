import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (path: string): Record<string, unknown> =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as Record<string, unknown>;

test("keeps release metadata versions aligned", () => {
  const manifest = readJson("manifest.json");
  const packageJson = readJson("package.json");
  const packageLock = readJson("package-lock.json");
  const versions = readJson("versions.json");

  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(versions[String(manifest.version)], manifest.minAppVersion);
});

test("attests and verifies assets before publishing an immutable release", () => {
  const workflow = readFileSync(
    resolve(root, ".github/workflows/attest-release-assets.yml"),
    "utf8",
  );
  const attestIndex = workflow.indexOf("- name: Attest release assets");
  const verifyIndex = workflow.indexOf("- name: Verify release asset attestations");
  const publishIndex = workflow.indexOf("- name: Publish GitHub release");

  assert.match(workflow, /contents: write/);
  assert.match(workflow, /GITHUB_REF_NAME.*DEFAULT_BRANCH/);
  assert.ok(attestIndex >= 0);
  assert.ok(verifyIndex > attestIndex);
  assert.ok(publishIndex > verifyIndex);
  assert.match(
    workflow,
    /gh release create "\$VERSION" main\.js manifest\.json styles\.css/,
  );
});
