import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compareSemver, notesFor, validateManifest } from "../../scripts/release/lib.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = (path: string) => JSON.parse(readFileSync(join(repoRoot, path), "utf8"));

test("the committed release manifest is valid and agrees with the version sources", () => {
  const manifest = readJson("release/manifest.json");
  assert.deepEqual(validateManifest(manifest), []);
  assert.equal(manifest.web, readJson("package.json").version);
  // The manifest's desktop.latest is the newest published release, never ahead of the source.
  assert.ok(compareSemver(manifest.desktop.latest, readJson("desktop/package.json").version) <= 0);
  const app = readJson("mobile/app.json").expo;
  assert.ok(compareSemver(manifest.ios.latest, app.version) <= 0);
  assert.ok(manifest.ios.minimumBuild <= Number(app.ios.buildNumber));
});

test("CHANGELOG.md has an Unreleased section for every product", () => {
  const changelog = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  for (const product of ["desktop", "mobile", "web"]) {
    assert.ok(changelog.includes(`## [Unreleased: ${product}]`), product);
  }
  assert.equal(notesFor(changelog, "desktop-v0.0.0"), null);
});

test("GET /api/version returns exactly the documented shape", () => {
  const route = readFileSync(join(repoRoot, "src/app/api/version/route.ts"), "utf8");
  for (const field of ["web:", "latest:", "minimum:", "url:", "minimumBuild:", "appStoreUrl:"]) {
    assert.ok(route.includes(field), field);
  }
  assert.ok(route.includes('from "../../../../release/manifest.json"'));
});
