import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const bumpScript = join(repoRoot, "scripts/release/bump.mjs");

const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "cadence-bump-"));
  mkdirSync(join(dir, "desktop"));
  mkdirSync(join(dir, "mobile"));
  mkdirSync(join(dir, "release"));
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  writeFileSync(join(dir, "package.json"), json({ name: "cadence", version: "0.1.0" }));
  writeFileSync(join(dir, "desktop/package.json"), json({ name: "cadence-desktop", version: "0.1.26" }));
  writeFileSync(join(dir, "mobile/app.json"), json({ expo: { version: "1.0.0", ios: { buildNumber: "2" } } }));
  writeFileSync(join(dir, "release/manifest.json"), readFileSync(join(repoRoot, "release/manifest.json")));
  writeFileSync(
    join(dir, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased: desktop]\n\n### Added\n\n- Updates.\n\n## [Unreleased: mobile]\n\n## [Unreleased: web]\n",
  );
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" });
  git("init", "--quiet", "-b", "main");
  git("add", ".");
  git("commit", "--quiet", "-m", "init");
  return dir;
}

function bump(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [bumpScript, ...args, "--root", dir, "--date", "2026-10-24"], {
    env,
    encoding: "utf8",
  });
}

test("desktop bump commits, tags and leaves a clean tree", () => {
  const dir = fixture();
  try {
    const result = bump(dir, "desktop", "patch");
    assert.equal(result.status, 0, result.stderr);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
    assert.equal(git("tag", "--list"), "desktop-v0.1.27");
    assert.equal(git("log", "-1", "--format=%s"), "Release desktop 0.1.27");
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(JSON.parse(readFileSync(join(dir, "desktop/package.json"), "utf8")).version, "0.1.27");
    assert.match(readFileSync(join(dir, "CHANGELOG.md"), "utf8"), /## \[desktop-v0\.1\.27\] - 2026-10-24\n\n### Added\n\n- Updates\./);
    assert.match(result.stdout, /git push origin main desktop-v0\.1\.27/);

    // The same tag cannot be made twice, and an empty section is refused.
    const again = bump(dir, "desktop", "0.1.27");
    assert.notEqual(again.status, 0);
    const empty = bump(dir, "desktop", "patch");
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /no entries/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bump refuses to run with uncommitted changes", () => {
  const dir = fixture();
  try {
    writeFileSync(join(dir, "stray.txt"), "x");
    const result = bump(dir, "desktop", "patch");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /uncommitted changes/);
    assert.equal(JSON.parse(readFileSync(join(dir, "desktop/package.json"), "utf8")).version, "0.1.26");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("dry run changes nothing; TestFlight build bump commits without a tag", () => {
  const dir = fixture();
  try {
    const dry = bump(dir, "desktop", "minor", "--dry-run");
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /\[dry run\] Release desktop 0\.2\.0/);
    assert.equal(JSON.parse(readFileSync(join(dir, "desktop/package.json"), "utf8")).version, "0.1.26");

    const build = bump(dir, "mobile", "build");
    assert.equal(build.status, 0, build.stderr);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, env, encoding: "utf8" }).trim();
    assert.equal(git("tag", "--list"), "");
    const app = JSON.parse(readFileSync(join(dir, "mobile/app.json"), "utf8"));
    assert.deepEqual(app.expo, { version: "1.0.0", ios: { buildNumber: "3" } });

    assert.equal(bump(dir, "web", "build").status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
