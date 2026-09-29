/**
 * Increments the iOS build number in app.json. App Store Connect refuses a
 * second upload with a build number it has already seen for the version.
 */
import { readFileSync, writeFileSync } from "node:fs";

const config = JSON.parse(readFileSync("app.json", "utf8"));
const next = String(Number(config.expo.ios.buildNumber ?? "0") + 1);
config.expo.ios.buildNumber = next;
writeFileSync("app.json", `${JSON.stringify(config, null, 2)}\n`);
console.log(`iOS ${config.expo.version} (${next})`);
