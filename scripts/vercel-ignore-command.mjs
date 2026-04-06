import { spawnSync } from "node:child_process";

function runGit(args) {
  const result = spawnSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

const headSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || runGit(["rev-parse", "HEAD"]);
const baseSha =
  process.env.VERCEL_GIT_PREVIOUS_SHA?.trim() || runGit(["rev-parse", "HEAD^"]);

if (!headSha || !baseSha) {
  console.log("Cadence Vercel ignoreCommand: missing git history, continuing build.");
  process.exit(1);
}

const changedFiles = runGit([
  "diff",
  "--name-only",
  baseSha,
  headSha,
  "--",
  ".",
  ":(exclude)desktop/**",
]);

if (changedFiles === null) {
  console.log("Cadence Vercel ignoreCommand: diff failed, continuing build.");
  process.exit(1);
}

if (changedFiles.length === 0) {
  console.log(
    "Cadence Vercel ignoreCommand: only desktop/ changed, skipping the web deployment."
  );
  process.exit(0);
}

console.log("Cadence Vercel ignoreCommand: web changes detected, continuing build.");
process.exit(1);
