#!/usr/bin/env node
// Writes the content packs to public/packs (docs/PLATFORM.md 3.3):
//
//   public/packs/index.json
//   public/packs/<packId>/v<version>/manifest.json
//   public/packs/<packId>/v<version>/content.json (+ sentences.json, scenarios.json, articulation.json)
//   public/packs/<packId>/v<version>/audio/<hash>.m4a   when audio.mjs has made it
//
// A pack's version goes up only when one of its files changed; an unchanged
// pack keeps its version and directory. Run validate.mjs first; build refuses
// to write packs with problems.
//
//   node scripts/content/build.mjs [--check]   (--check: fail if public/packs is stale)

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR, PACKS_DIR } from "./lib/paths.mjs";
import { assemblePacks } from "./lib/assemble.mjs";
import { packProblems } from "./lib/validators.mjs";
import { CONTENT_MODEL_VERSION, PACK_FORMAT_VERSION } from "../../src/lib/platform/content-model.ts";

const check = process.argv.includes("--check");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const AUDIO_CACHE = join(CACHE_DIR, "audio");

const packs = assemblePacks();
const problems = packs.flatMap((pack) => packProblems(pack));
if (problems.length) {
  console.error(`${problems.length} problems; run node scripts/content/validate.mjs for the list.`);
  process.exit(1);
}

const indexFile = join(PACKS_DIR, "index.json");
const previous = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, "utf8")) : { packs: [] };
const index = { format: PACK_FORMAT_VERSION, packs: [] };
let stale = false;

function audioRefs(content) {
  const out = new Set();
  for (const e of content.exercises ?? []) {
    for (const a of [e.audio, ...(Array.isArray(e.audio) ? e.audio : [])].flat()) if (typeof a === "string") out.add(a);
  }
  return out;
}

for (const pack of packs) {
  const bodies = Object.fromEntries(Object.entries(pack.files).map(([name, json]) => [name, JSON.stringify(json)]));
  const audio = [...audioRefs(pack.files["content.json"])].filter((p) => existsSync(join(AUDIO_CACHE, p.slice("audio/".length)))).sort();
  const entries = [
    ...Object.entries(bodies).map(([path, body]) => ({ path, sha256: sha(body), bytes: Buffer.byteLength(body) })),
    ...audio.map((path) => {
      const data = readFileSync(join(AUDIO_CACHE, path.slice("audio/".length)));
      return { path, sha256: sha(data), bytes: data.length };
    }),
  ].sort((a, b) => a.path.localeCompare(b.path));

  const prev = previous.packs.find((p) => p.id === pack.id);
  let version = prev?.version ?? 0;
  let generatedAt = new Date().toISOString();
  if (prev) {
    const prevManifest = JSON.parse(readFileSync(join(PACKS_DIR, prev.manifest), "utf8"));
    const same = JSON.stringify(prevManifest.files) === JSON.stringify(entries) && prevManifest.contentModel === CONTENT_MODEL_VERSION;
    if (same) generatedAt = prevManifest.generatedAt;
    else version += 1;
  } else {
    version = 1;
  }
  if (version !== (prev?.version ?? 0)) stale = true;

  const dir = join(PACKS_DIR, pack.id, `v${version}`);
  const manifest = {
    format: PACK_FORMAT_VERSION,
    contentModel: CONTENT_MODEL_VERSION,
    id: pack.id,
    version,
    title: pack.title,
    ...(pack.level ? { level: pack.level } : {}),
    generatedAt,
    files: entries,
  };
  if (!check) {
    mkdirSync(join(dir, "audio"), { recursive: true });
    for (const [name, body] of Object.entries(bodies)) writeFileSync(join(dir, name), body);
    for (const path of audio) copyFileSync(join(AUDIO_CACHE, path.slice("audio/".length)), join(dir, path));
    writeFileSync(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`);
  }
  const bytes = entries.reduce((n, e) => n + e.bytes, 0);
  index.packs.push({ id: pack.id, version, ...(pack.level ? { level: pack.level } : {}), manifest: `${pack.id}/v${version}/manifest.json`, bytes });
  const missingAudio = audioRefs(pack.files["content.json"]).size - audio.length;
  console.log(`${pack.id} v${version}: ${(bytes / 1024).toFixed(0)} KB${missingAudio ? `, ${missingAudio} audio files not generated yet` : ""}`);
}

if (check) {
  if (stale) {
    console.error("public/packs is out of date; run node scripts/content/build.mjs");
    process.exit(1);
  }
  console.log("public/packs is up to date.");
} else {
  writeFileSync(indexFile, `${JSON.stringify(index, null, 1)}\n`);
}
