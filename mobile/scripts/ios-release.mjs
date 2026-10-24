/**
 * Archives the iOS app (`archive`) or uploads the archive to App Store Connect
 * (`upload`). The Apple team and the App Store Connect API key come from the
 * environment, or from mobile/.env.release (see .env.release.example).
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

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
} else if (step === "upload") {
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
