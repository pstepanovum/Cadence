#!/usr/bin/env node
// Copies the shared platform modules from src/lib/platform/ to
// mobile/src/platform/, swapping only the header comment (the FILE line and the
// Twin line), so the two copies stay byte-identical below the header.
// tests/platform/drift.test.ts fails if they drift.
//
//   node scripts/platform/sync-mobile.mjs          write the mobile copies
//   node scripts/platform/sync-mobile.mjs --check  exit 1 if any copy is stale
//
// Edit the src/lib/platform/ copy, then run this. The body is everything from
// the first "/**" on; the header above it must not contain "/**".
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER = join(root, "src/lib/platform");
const MOBILE = join(root, "mobile/src/platform");
const check = process.argv.includes("--check");

function listTs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((path) => path.endsWith(".ts"))
    .sort();
}

function mobileVersion(source, rel) {
  const start = source.indexOf("/**");
  if (start === -1) throw new Error(`src/lib/platform/${rel} has no /** body marker`);
  const header = source
    .slice(0, start)
    .replaceAll("mobile/src/platform/", "\u0000")
    .replaceAll("src/lib/platform/", "mobile/src/platform/")
    .replaceAll("\u0000", "src/lib/platform/");
  return header + source.slice(start);
}

let stale = 0;
for (const rel of listTs(SERVER)) {
  const target = join(MOBILE, rel);
  const wanted = mobileVersion(readFileSync(join(SERVER, rel), "utf8"), rel);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  if (current === wanted) continue;
  stale += 1;
  if (check) {
    console.error(`stale: ${relative(root, target)}`);
  } else {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, wanted);
    console.log(`wrote ${relative(root, target)}`);
  }
}

const orphans = listTs(MOBILE).filter((rel) => !existsSync(join(SERVER, rel)));
for (const rel of orphans) console.error(`no server copy: mobile/src/platform/${rel}`);

if ((check && stale > 0) || orphans.length > 0) process.exit(1);
