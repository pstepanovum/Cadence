/**
 * Archives the iOS app (`archive`) or uploads the archive to App Store Connect
 * (`upload`). The Apple team and the App Store Connect API key come from the
 * environment, or from mobile/.env.release (see .env.release.example).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

import { bundleProblems, releaseEnvProblems } from "../src/lib/firebase-env.ts";

if (existsSync(".env.release")) process.loadEnvFile(".env.release");

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`${name} is not set. Copy .env.release.example to .env.release and fill it in.`);
    process.exit(1);
  }
  return value;
}

function run(command, args) {
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch (error) {
    process.exit(error.status ?? 1);
  }
}

/**
 * The environment Expo bundles a release build with: the shell, then the
 * .env files in Expo's order of precedence (the shell wins).
 */
function bundlingEnv() {
  const files = [".env", ".env.production", ".env.local", ".env.production.local"];
  const fromFiles = {};
  for (const file of files) if (existsSync(file)) Object.assign(fromFiles, parseEnv(readFileSync(file, "utf8")));
  return { ...fromFiles, ...process.env };
}

/**
 * A store build must never carry the e2e values (the Auth emulator, a demo-
 * project, the purchase stub, a LAN API). Refuse before archiving.
 */
function refuseTestEnv() {
  const problems = releaseEnvProblems(bundlingEnv());
  if (problems.length === 0) return;
  console.error("This environment is for simulator tests, not for TestFlight or the App Store:");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("Remove those values from mobile/.env (or the shell) and archive again.");
  process.exit(1);
}

/** Checks the archived bundle itself, since Metro can reuse an older build's inlined values. */
function checkArchivedBundle() {
  const apps = "build/Cadence.xcarchive/Products/Applications";
  const app = existsSync(apps) ? readdirSync(apps).find((name) => name.endsWith(".app")) : null;
  const bundle = app ? join(apps, app, "main.jsbundle") : null;
  if (!bundle || !existsSync(bundle)) {
    console.error("No main.jsbundle in the archive; cannot check it for test values.");
    process.exit(1);
  }
  const problems = bundleProblems(readFileSync(bundle, "latin1"), { projectId: bundlingEnv().EXPO_PUBLIC_FIREBASE_PROJECT_ID });
  if (problems.length === 0) return;
  console.error("The archived app was built with test values and must not be uploaded:");
  for (const problem of problems) console.error(`  - ${problem}`);
  rmSync("build/Cadence.xcarchive", { recursive: true, force: true });
  process.exit(1);
}

const step = process.argv[2];
const auth = [
  "-allowProvisioningUpdates",
  "-authenticationKeyPath",
  required("ASC_KEY_PATH").replace(/^~(?=\/)/, homedir()),
  "-authenticationKeyID",
  required("ASC_KEY_ID"),
  "-authenticationKeyIssuerID",
  required("ASC_ISSUER_ID"),
];

if (step === "archive") {
  const team = required("APPLE_TEAM_ID");
  refuseTestEnv();
  // Expo inlines EXPO_PUBLIC_* values when Metro transforms a file, and the
  // transform cache outlives builds: an e2e build's emulator address can come
  // back in a store build. Start from an empty cache.
  rmSync(join(tmpdir(), "metro-cache"), { recursive: true, force: true });
  run("npx", ["expo", "prebuild", "-p", "ios", "--clean"]);
  run("xcodebuild", [
    "-workspace", "ios/Cadence.xcworkspace",
    "-scheme", "Cadence",
    "-configuration", "Release",
    "-destination", "generic/platform=iOS",
    "-archivePath", "build/Cadence.xcarchive",
    `DEVELOPMENT_TEAM=${team}`,
    "CODE_SIGN_STYLE=Automatic",
    ...auth,
    "archive",
  ]);
  checkArchivedBundle();
} else if (step === "upload") {
  refuseTestEnv();
  checkArchivedBundle();
  run("xcodebuild", [
    "-exportArchive",
    "-archivePath", "build/Cadence.xcarchive",
    "-exportOptionsPlist", "ExportOptions.plist",
    "-exportPath", "build/upload",
    ...auth,
  ]);
} else {
  console.error("Usage: node scripts/ios-release.mjs archive|upload");
  process.exit(1);
}
