/**
 * Increments the iOS build number for TestFlight. App Store Connect refuses a
 * second upload with a build number it has already seen for the version.
 *
 * The repository's version tool does the work, so the bump is committed and
 * the marketing version is left alone (it only changes for an App Store
 * submission: `node scripts/release/bump.mjs mobile patch` from the root).
 * Extra arguments, such as --dry-run or --no-git, are passed through.
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bump = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "release", "bump.mjs");
const result = spawnSync(process.execPath, [bump, "mobile", "build", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
