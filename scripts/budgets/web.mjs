#!/usr/bin/env node
// FILE: scripts/budgets/web.mjs
//
// Web bundle budgets (docs/PLATFORM.md, "Optimization budgets"), checked
// against the last `pnpm build`:
//
//   - first-load JS per route: the landing page at most 150 KB, every other
//     page at most 250 KB;
//   - the mouth map chunk (every chunk holding the vocal-tract model) at most
//     25 KB.
//
// Sizes are gzip at level 9 (what gzip-size and Next's old build table
// report) of the chunks Next lists per route in
// .next/diagnostics/route-bundle-stats.json. Exit code 1 on any miss.
//
//   node scripts/budgets/web.mjs [--json]

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = new URL("../..", import.meta.url).pathname;
const STATS = join(ROOT, ".next/diagnostics/route-bundle-stats.json");
const CHUNKS = join(ROOT, ".next/static/chunks");

export const BUDGETS = {
  landingKb: 150,
  routeKb: 250,
  mouthMapChunkKb: 25,
};

// A string literal from src/lib/platform/vocal-tract (a FILL_IDS entry) that
// survives minification and appears in no other module.
const MOUTH_MAP_MARKER = "laryngealWall";

const cache = new Map();
function gzipKb(path) {
  if (!cache.has(path)) cache.set(path, gzipSync(readFileSync(path), { level: 9 }).length / 1024);
  return cache.get(path);
}

export function measure() {
  if (!existsSync(STATS)) {
    throw new Error("No build stats at .next/diagnostics/route-bundle-stats.json. Run `pnpm build` first.");
  }
  const stats = JSON.parse(readFileSync(STATS, "utf8"));
  const routes = stats
    .filter((r) => !r.route.startsWith("/_"))
    .map((r) => {
      const kb = r.firstLoadChunkPaths.reduce((sum, p) => sum + gzipKb(join(ROOT, p)), 0);
      const budget = r.route === "/" ? BUDGETS.landingKb : BUDGETS.routeKb;
      return { route: r.route, kb, budget, ok: kb <= budget };
    })
    .sort((a, b) => b.kb - a.kb);

  const mouthMap = readdirSync(CHUNKS)
    .filter((f) => f.endsWith(".js"))
    .filter((f) => readFileSync(join(CHUNKS, f), "utf8").includes(MOUTH_MAP_MARKER))
    .map((f) => {
      const rel = `.next/static/chunks/${f}`;
      const kb = gzipKb(join(CHUNKS, f));
      const firstLoad = stats.filter((r) => r.firstLoadChunkPaths.includes(rel)).map((r) => r.route);
      return { chunk: f, kb, budget: BUDGETS.mouthMapChunkKb, ok: kb <= BUDGETS.mouthMapChunkKb, firstLoad };
    });

  return { routes, mouthMap, ok: routes.every((r) => r.ok) && mouthMap.length > 0 && mouthMap.every((c) => c.ok) };
}

function main() {
  const result = measure();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("First-load JS per route (gzip):");
    for (const r of result.routes) {
      console.log(`  ${r.ok ? "ok  " : "OVER"} ${r.kb.toFixed(1).padStart(6)} KB / ${r.budget} KB  ${r.route}`);
    }
    console.log("Mouth map chunks (gzip):");
    if (result.mouthMap.length === 0) console.log("  MISSING: no chunk contains the vocal-tract model");
    for (const c of result.mouthMap) {
      const where = c.firstLoad.length > 0 ? c.firstLoad.join(", ") : "loaded on demand";
      console.log(`  ${c.ok ? "ok  " : "OVER"} ${c.kb.toFixed(1).padStart(6)} KB / ${c.budget} KB  ${c.chunk} (${where})`);
    }
    console.log(result.ok ? "Within budget." : "Over budget.");
  }
  process.exit(result.ok ? 0 : 1);
}

main();
