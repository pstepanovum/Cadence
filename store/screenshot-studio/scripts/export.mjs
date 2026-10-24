// FILE: store/screenshot-studio/scripts/export.mjs
//
// Renders every slide at the exact pixel size App Store Connect wants and
// writes opaque RGB PNGs (no alpha channel) to store/screenshots/<device>/,
// plus the subscription review screenshot.
//
//   npm run export
//   npm run export -- --device iphone-6.5      one size (iphone-6.9, iphone-6.5, iap-review)
//   npm run export -- --slide 3                one slide (1-based)
//   npm run export -- --require-raw            refuse to export a slide without its capture
//   npm run export -- --out <dir>              somewhere other than store/screenshots/
//
// It starts the Vite dev server in-process, so the saved config, the fonts
// and the captures are served exactly as in the dashboard.
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";
import { createServer } from "vite";

import sizes from "../src/device-sizes.json" with { type: "json" };
import { copyAssets } from "./copy-assets.mjs";
import { writeOpaquePng } from "./png.mjs";
import { RAW_DIR, readPngSize } from "./raw-files.mjs";

const studioRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const storeRoot = resolve(studioRoot, "..");
const configPath = join(studioRoot, "config", "slides.config.json");
let outRoot = join(storeRoot, "screenshots");

const ALL = [...sizes.devices.map((d) => d.id), sizes.iapReview.id];

function parseArgs(argv) {
  const args = { devices: ALL, slide: null, requireRaw: false };
  for (let i = 0; i < argv.length; i += 1) {
    const next = argv[i + 1];
    if (argv[i] === "--device" && next) (args.devices = next.split(",")), (i += 1);
    else if (argv[i] === "--slide" && next) (args.slide = Number(next) - 1), (i += 1);
    else if (argv[i] === "--out" && next) (outRoot = resolve(process.cwd(), next)), (i += 1);
    else if (argv[i] === "--require-raw") args.requireRaw = true;
    else throw new Error(`Unknown argument "${argv[i]}".`);
  }
  const unknown = args.devices.filter((id) => !ALL.includes(id));
  if (unknown.length) throw new Error(`Unknown device ${unknown.join(", ")}. Known: ${ALL.join(", ")}`);
  return args;
}

async function captureState(slug) {
  const path = join(RAW_DIR, `${slug}.png`);
  const size = await readPngSize(path).catch(() => undefined);
  if (size === undefined) return { state: "missing", path };
  if (size === null) return { state: "wrong", path, why: "is not a PNG" };
  if (size.width !== sizes.capture.width || size.height !== sizes.capture.height) return { state: "wrong", path, why: `is ${size.width}x${size.height}, expected ${sizes.capture.width}x${sizes.capture.height}` };
  return { state: "ok", path };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await copyAssets({ quiet: true });
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const slides = config.slides ?? [];
  if (slides.length === 0) throw new Error(`${configPath} has no slides.`);
  if (slides.length > 10) throw new Error(`App Store Connect takes at most 10 screenshots per size; the config has ${slides.length}.`);
  const indexes = args.slide === null ? slides.map((_, i) => i) : [args.slide].filter((i) => slides[i]);

  const jobs = [];
  for (const device of sizes.devices.filter((d) => args.devices.includes(d.id))) {
    for (const index of indexes) {
      const slug = slides[index].slug;
      jobs.push({ ...device, slug, capture: await captureState(slug), url: `?render=1&device=${device.id}&slide=${index}`, file: join(outRoot, device.id, `${String(index + 1).padStart(2, "0")}-${slug}.png`) });
    }
  }
  if (args.devices.includes(sizes.iapReview.id) && args.slide === null) {
    const slug = config.iapReviewSlug || "plus";
    jobs.push({ ...sizes.iapReview, slug, capture: await captureState(slug), url: `?render=1&device=${sizes.iapReview.id}`, file: join(outRoot, sizes.iapReview.id, `${slug}.png`) });
  }

  const wrong = jobs.filter((j) => j.capture.state === "wrong");
  if (wrong.length) throw new Error(`Captures at the wrong size (recapture on the iPhone 16 Pro Max simulator; nothing is scaled or cropped):\n  ${[...new Set(wrong.map((j) => `${relative(storeRoot, j.capture.path)} ${j.capture.why}`))].join("\n  ")}`);
  const missing = [...new Set(jobs.filter((j) => j.capture.state === "missing").map((j) => relative(storeRoot, j.capture.path)))];
  if (missing.length && args.requireRaw) throw new Error(`--require-raw: no capture yet for\n  ${missing.join("\n  ")}`);

  const server = await createServer({ root: studioRoot, configFile: join(studioRoot, "vite.config.ts"), server: { port: 0, strictPort: false }, logLevel: "warn" });
  await server.listen();
  const base = server.resolvedUrls.local[0].replace(/\/$/, "");
  const browser = await chromium.launch();
  try {
    for (const job of jobs) {
      await mkdir(dirname(job.file), { recursive: true });
      const context = await browser.newContext({ viewport: { width: job.width / job.exportScale, height: job.height / job.exportScale }, deviceScaleFactor: job.exportScale, colorScheme: "light", reducedMotion: "reduce" });
      const page = await context.newPage();
      await page.goto(`${base}/${job.url}`, { waitUntil: "load" });
      await page.waitForSelector('html[data-ready="1"]', { timeout: 60_000 });
      await page.screenshot({ path: job.file, type: "png" });
      await context.close();
      await writeOpaquePng(job.file);
    }
  } finally {
    await browser.close();
    await server.close();
  }

  let bad = 0;
  console.log("");
  for (const job of jobs) {
    const size = await readPngSize(job.file);
    const ok = size && size.width === job.width && size.height === job.height && size.colorType === 2;
    if (!ok) bad += 1;
    const kb = ((await stat(job.file)).size / 1024).toFixed(0).padStart(5);
    console.log(`${ok ? "ok  " : "BAD "} ${size ? `${size.width}x${size.height}` : "not a PNG"} ${size?.colorType === 2 ? "RGB  " : "ALPHA"} ${kb} KB  ${relative(storeRoot, job.file)}${job.capture.state === "missing" ? "  (no capture yet)" : ""}`);
  }
  console.log(`\n${jobs.length} PNG(s) in ${relative(process.cwd(), outRoot) || "."}/`);
  if (bad) throw new Error(`${bad} screenshot(s) came out at the wrong size or with an alpha channel.`);
  if (missing.length) console.warn(`\nStill to capture:\n  ${missing.join("\n  ")}`);
}

main().catch((error) => {
  console.error(`\nexport failed: ${error.message}`);
  process.exit(1);
});
