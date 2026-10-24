#!/usr/bin/env node
// FILE: scripts/screenshots/capture.mjs
//
// Drives the iOS Simulator through the store screens with Maestro and saves
// each one with `simctl io screenshot` (native pixels, no scaling) into
// store/screenshots/raw/<slug>.png, where store/screenshot-studio frames them.
//
// Needs, already running: the Auth and Firestore emulators, a Cadence server
// on 127.0.0.1:3000 started against them, the demo data
// (stage-demo.mts), and the app installed from a build made with the e2e
// environment (mobile/.env.example: the demo- project, the Auth emulator,
// EXPO_PUBLIC_PURCHASES_STUB=1). Never a physical iPhone.
//
//   node scripts/screenshots/capture.mjs [--udid <simulator>] [--only mouth-map,flashcards]
//
// The default simulator is the booted iPhone 16 Pro Max (1320 x 2868, the
// 6.9" size). Light mode, status bar at 9:41 with full battery and signal.
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FLOWS = join(ROOT, "mobile/e2e/screenshots");
const RAW = join(ROOT, "store/screenshots/raw");
const args = process.argv.slice(2);
const flag = (name) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const only = flag("only")?.split(",");
const password = process.env.SCREENSHOT_DEMO_PASSWORD ?? "practise2026";
const ACCOUNTS = { free: "alex@demo.cadence.test", plus: "sam@demo.cadence.test" };

function bootedProMax() {
  const list = JSON.parse(execFileSync("xcrun", ["simctl", "list", "devices", "booted", "--json"], { encoding: "utf8" }));
  for (const devices of Object.values(list.devices)) {
    const match = devices.find((d) => d.name === "iPhone 16 Pro Max" && d.state === "Booted");
    if (match) return match.udid;
  }
  throw new Error('Boot the "iPhone 16 Pro Max" simulator first, or pass --udid.');
}

const udid = flag("udid") ?? bootedProMax();
mkdirSync(RAW, { recursive: true });
execFileSync("xcrun", ["simctl", "ui", udid, "appearance", "light"]);
execFileSync("xcrun", ["simctl", "status_bar", udid, "override", "--time", "9:41", "--batteryState", "charged", "--batteryLevel", "100", "--cellularMode", "active", "--cellularBars", "4", "--wifiBars", "3", "--dataNetwork", "wifi"]);

function flow(name, env = {}) {
  const extra = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  const run = spawnSync("maestro", ["--device", udid, "test", ...extra, join(FLOWS, `${name}.yaml`)], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  if (run.status !== 0) throw new Error(`flow ${name} failed:\n${(run.stdout + run.stderr).split("\n").slice(-15).join("\n")}`);
}

const wanted = (slug) => !only || only.includes(slug);
const results = [];
function shot(slug) {
  execFileSync("xcrun", ["simctl", "io", udid, "screenshot", "--type=png", join(RAW, `${slug}.png`)], { stdio: "ignore" });
  results.push(slug);
  console.log(`captured ${slug}`);
}

// Free account: the place step (own server) and the paywall at the end of setup.
if (wanted("own-server") || wanted("plus")) {
  flow("onboard-free");
  if (wanted("own-server")) shot("own-server");
  flow("free-to-paywall", { EMAIL: ACCOUNTS.free, PASSWORD: password });
  if (wanted("plus")) shot("plus");
}

// The staged Plus account: everything else.
const PLUS_SHOTS = ["streaks", "mouth-map", "sounds-to-fix", "grammar-builder", "flashcards", "coach"];
if (PLUS_SHOTS.some(wanted)) {
  flow("onboard-plus", { EMAIL: ACCOUNTS.plus, PASSWORD: password });
  for (const slug of PLUS_SHOTS) {
    if (!wanted(slug)) continue;
    flow(slug);
    shot(slug);
  }
}

console.log(`\n${results.length} capture(s) in store/screenshots/raw/. The widgets slide is captured by hand (store/README.md).`);
