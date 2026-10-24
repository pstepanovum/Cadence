import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bumpSemver,
  compareSemver,
  notesFor,
  planBump,
  releaseChangelog,
  updateManifest,
  validateManifest,
} from "../../scripts/release/lib.mjs";

const CHANGELOG = `# Changelog

Intro.

## [Unreleased: desktop]

### Added

- Auto updates.

## [Unreleased: mobile]

## [Unreleased: web]

### Fixed

- A web fix.

## [desktop-v0.1.26] - 2026-04-10

### Fixed

- Older fix.

[desktop-v0.1.26]: https://github.com/pstepanovum/Cadence/releases/tag/desktop-v0.1.26
`;

const MANIFEST = {
  web: "0.1.0",
  desktop: {
    latest: "0.1.26",
    minimum: "0.1.0",
    url: "https://github.com/pstepanovum/Cadence/releases/tag/desktop-v0.1.26",
  },
  ios: { latest: "1.0.0", minimumBuild: 1, appStoreUrl: null },
};

const FILES = {
  changelog: CHANGELOG,
  manifest: MANIFEST,
  desktopPackage: { name: "cadence-desktop", version: "0.1.26" },
  rootPackage: { name: "cadence", version: "0.1.0" },
  appJson: { expo: { version: "1.0.0", ios: { buildNumber: "2" } } },
};

test("bumpSemver handles every level and refuses to go backwards", () => {
  assert.equal(bumpSemver("0.1.26", "patch"), "0.1.27");
  assert.equal(bumpSemver("0.1.26", "minor"), "0.2.0");
  assert.equal(bumpSemver("0.1.26", "major"), "1.0.0");
  assert.equal(bumpSemver("0.1.26", "0.3.0"), "0.3.0");
  assert.throws(() => bumpSemver("0.1.26", "0.1.26"), /not above/);
  assert.throws(() => bumpSemver("0.1.26", "0.1.9"), /not above/);
  assert.throws(() => bumpSemver("0.1", "patch"), /Not a semantic version/);
  assert.throws(() => bumpSemver("0.1.26", "1.0.0-beta"), /Not a semantic version/);
});

test("compareSemver compares numerically, not as text", () => {
  assert.equal(compareSemver("0.1.10", "0.1.9"), 1);
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("0.9.0", "1.0.0"), -1);
});

test("releaseChangelog moves only that product's entries above the newest release", () => {
  const out = releaseChangelog(CHANGELOG, { product: "desktop", version: "0.1.27", date: "2026-10-24" });
  const unreleasedDesktop = out.indexOf("## [Unreleased: desktop]");
  const release = out.indexOf("## [desktop-v0.1.27] - 2026-10-24");
  const older = out.indexOf("## [desktop-v0.1.26]");
  assert.ok(unreleasedDesktop >= 0 && release > out.indexOf("## [Unreleased: web]") && release < older);
  assert.equal(notesFor(out, "desktop-v0.1.27"), "### Added\n\n- Auto updates.");
  // The desktop Unreleased section is now empty; the web one is untouched.
  assert.match(out, /## \[Unreleased: desktop\]\n\n## \[Unreleased: mobile\]/);
  assert.match(out, /## \[Unreleased: web\]\n\n### Fixed\n\n- A web fix\./);
  assert.match(out, /\[desktop-v0\.1\.27\]: https:\/\/github\.com\/pstepanovum\/Cadence\/releases\/tag\/desktop-v0\.1\.27\n\[desktop-v0\.1\.26\]/);
  assert.ok(out.endsWith("\n") && !out.endsWith("\n\n"));
});

test("releaseChangelog refuses an empty section unless allowed, and duplicates always", () => {
  assert.throws(
    () => releaseChangelog(CHANGELOG, { product: "mobile", version: "1.0.1", date: "2026-10-24" }),
    /no entries/,
  );
  const out = releaseChangelog(CHANGELOG, { product: "mobile", version: "1.0.1", date: "2026-10-24", allowEmpty: true });
  assert.equal(notesFor(out, "mobile-v1.0.1"), "### Changed\n\n- Maintenance release.");
  assert.throws(
    () => releaseChangelog(CHANGELOG, { product: "desktop", version: "0.1.26", date: "2026-10-24" }),
    /already has a section/,
  );
  assert.throws(
    () => releaseChangelog("# Changelog\n", { product: "desktop", version: "0.1.27", date: "2026-10-24" }),
    /no "## \[Unreleased: desktop\]"/,
  );
});

test("notesFor returns null for a tag with no section", () => {
  assert.equal(notesFor(CHANGELOG, "desktop-v9.9.9"), null);
  assert.equal(notesFor(CHANGELOG, "desktop-v0.1.26"), "### Fixed\n\n- Older fix.");
});

test("validateManifest catches every bad field", () => {
  assert.deepEqual(validateManifest(MANIFEST), []);
  const bad = validateManifest({
    web: "1",
    desktop: { latest: "0.1.0", minimum: "0.2.0", url: "https://example.com/" },
    ios: { latest: "x", minimumBuild: 0, appStoreUrl: "http://apps.apple.com/" },
  });
  assert.equal(bad.length, 6);
});

test("updateManifest points the desktop url at the new tag and keeps the input intact", () => {
  const next = updateManifest(MANIFEST, { desktopLatest: "0.1.27", desktopMinimum: "0.1.20" });
  assert.equal(next.desktop.url, "https://github.com/pstepanovum/Cadence/releases/tag/desktop-v0.1.27");
  assert.equal(next.desktop.minimum, "0.1.20");
  assert.equal(MANIFEST.desktop.latest, "0.1.26");
  assert.throws(() => updateManifest(MANIFEST, { desktopMinimum: "0.2.0" }), /invalid/);
});

test("planBump desktop writes the package, manifest and changelog and tags desktop-v", () => {
  const plan = planBump({ product: "desktop", action: "patch", files: FILES, date: "2026-10-24", options: { minimum: true } });
  assert.equal(plan.tag, "desktop-v0.1.27");
  assert.deepEqual(Object.keys(plan.writes).sort(), ["CHANGELOG.md", "desktop/package.json", "release/manifest.json"]);
  const manifest = JSON.parse(plan.writes["release/manifest.json"]);
  assert.equal(manifest.desktop.latest, "0.1.27");
  assert.equal(manifest.desktop.minimum, "0.1.27");
  assert.equal(JSON.parse(plan.writes["desktop/package.json"]).version, "0.1.27");
});

test("planBump mobile build changes only the build number and never tags", () => {
  const plan = planBump({ product: "mobile", action: "build", files: FILES, date: "2026-10-24" });
  assert.equal(plan.tag, null);
  assert.deepEqual(Object.keys(plan.writes), ["mobile/app.json"]);
  const app = JSON.parse(plan.writes["mobile/app.json"]);
  assert.equal(app.expo.version, "1.0.0");
  assert.equal(app.expo.ios.buildNumber, "3");
});

test("planBump mobile release bumps the marketing version and the build, tags mobile-v", () => {
  const files = { ...FILES, changelog: CHANGELOG.replace("## [Unreleased: mobile]\n", "## [Unreleased: mobile]\n\n- New lessons.\n") };
  const plan = planBump({ product: "mobile", action: "minor", files, date: "2026-10-24" });
  assert.equal(plan.tag, "mobile-v1.1.0");
  const app = JSON.parse(plan.writes["mobile/app.json"]);
  assert.equal(app.expo.version, "1.1.0");
  assert.equal(app.expo.ios.buildNumber, "3");
  // The App Store has not released it yet, so the manifest waits for "live".
  assert.equal(plan.writes["release/manifest.json"], undefined);
});

test("planBump mobile live updates the manifest only", () => {
  const files = { ...FILES, appJson: { expo: { version: "1.1.0", ios: { buildNumber: "3" } } } };
  const plan = planBump({
    product: "mobile",
    action: "live",
    files,
    date: "2026-10-24",
    options: { minimumBuild: 3, appStoreUrl: "https://apps.apple.com/app/id123" },
  });
  assert.deepEqual(Object.keys(plan.writes), ["release/manifest.json"]);
  const manifest = JSON.parse(plan.writes["release/manifest.json"]);
  assert.deepEqual(manifest.ios, { latest: "1.1.0", minimumBuild: 3, appStoreUrl: "https://apps.apple.com/app/id123" });
});

test("planBump web bumps the root package and the manifest's web version", () => {
  const plan = planBump({ product: "web", action: "patch", files: FILES, date: "2026-10-24" });
  assert.equal(plan.tag, "web-v0.1.1");
  assert.equal(JSON.parse(plan.writes["package.json"]).version, "0.1.1");
  assert.equal(JSON.parse(plan.writes["release/manifest.json"]).web, "0.1.1");
});
