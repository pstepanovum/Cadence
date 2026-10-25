#!/usr/bin/env node
// Copies the content the iOS app ships with into the mobile package.
//
//   node scripts/sync-content.mjs           write mobile/assets/packs and the generated modules
//   node scripts/sync-content.mjs --check   fail if they are out of date
//
// Sources, in the repo root (docs/PLATFORM.md, sections 3.3 and 13.2):
//   public/packs/index.json and public/packs/<id>/v<n>/   the built packs
//   content/articulation/*.json                            the mouth-map targets
//
// The bundled packs are `sounds`, `placement` (the placement test's bank,
// needed offline in setup), `core-a1` to `core-b2`, and the advanced packs
// (`phrases-b2` to `phrases-c2`, `slang`, `fossilization`: docs/PLATFORM.md
// sections 17 and 18), which have no level and are read only by the advanced
// screens; core C1 and C2 are downloaded on demand. Pack files are copied as `.cpack` so Metro treats them
// as assets (read from disk when a level is opened) rather than parsing them
// into the JS bundle at launch.
//
// Until the content pipeline has built packs, the small samples in
// src/content/fixtures/ stand in, and the generated module says so.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const mobile = resolve(here, "..");
const repo = resolve(mobile, "..");
const check = process.argv.includes("--check");

const BUNDLED = ["sounds", "placement", "core-a1", "core-a2", "core-b1", "core-b2", "slang", "fossilization"];
/** Every part of the phrase bank (phrases-b2, phrases-c1, phrases-c1-2, ...). */
const isBundled = (id) => BUNDLED.includes(id) || /^phrases-[a-z0-9-]+$/.test(id);
const PACKS_SRC = join(repo, "public/packs");
const FIXTURE_PACKS = join(mobile, "src/content/fixtures/packs");
const ARTICULATION_SRC = join(repo, "content/articulation");
const FIXTURE_ARTICULATION = join(mobile, "src/content/fixtures/articulation");
const ASSETS_OUT = join(mobile, "assets/packs");
const MODULE_OUT = join(mobile, "src/content/bundled.generated.ts");
const ARTICULATION_OUT = join(mobile, "src/content/articulation.generated.json");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

/** Every pack to bundle: {id, version, level, title, dir, manifest}. */
function collectPacks() {
  const indexPath = join(PACKS_SRC, "index.json");
  if (existsSync(indexPath)) {
    const index = readJson(indexPath);
    const packs = [];
    for (const entry of index.packs) {
      if (!isBundled(entry.id)) continue;
      const manifestPath = join(PACKS_SRC, entry.manifest.replace(/^\/?packs\//, ""));
      const manifest = readJson(manifestPath);
      packs.push({ id: entry.id, version: manifest.version, level: manifest.level, title: manifest.title, dir: dirname(manifestPath), manifest });
    }
    return { source: "packs", packs };
  }

  // Fixtures: one content.json per pack, with the manifest worked out here.
  const packs = [];
  for (const id of readdirSync(FIXTURE_PACKS).sort()) {
    const versions = readdirSync(join(FIXTURE_PACKS, id)).filter((name) => /^v\d+$/.test(name));
    const latest = versions.map((name) => Number(name.slice(1))).sort((a, b) => b - a)[0];
    const dir = join(FIXTURE_PACKS, id, `v${latest}`);
    const content = readFileSync(join(dir, "content.json"));
    const level = id.startsWith("core-") ? id.slice(5).toUpperCase() : undefined;
    const manifest = {
      format: 1,
      contentModel: 1,
      id,
      version: latest,
      title: `${level ?? id} sample`,
      ...(level ? { level } : {}),
      generatedAt: "2026-10-24T00:00:00.000Z",
      files: [{ path: "content.json", sha256: sha256(content), bytes: content.length }],
    };
    packs.push({ id, version: latest, level, title: manifest.title, dir, manifest });
  }
  return { source: "fixture", packs };
}

function collectArticulation() {
  const dir = existsSync(ARTICULATION_SRC) ? ARTICULATION_SRC : FIXTURE_ARTICULATION;
  const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
  const targets = [];
  for (const name of files) {
    const body = readJson(join(dir, name));
    // Other files there (the traced references and their fits) are pipeline input.
    if (!Array.isArray(body.targets)) continue;
    if (body.format !== 1) throw new Error(`${name}: expected format 1`);
    targets.push(...body.targets);
  }
  targets.sort((a, b) => (a.soundId + a.variant).localeCompare(b.soundId + b.variant));
  return { source: dir === ARTICULATION_SRC ? "content" : "fixture", targets };
}

/** The files to write, as {path: Buffer}. */
function plan() {
  const out = new Map();
  const { source, packs } = collectPacks();
  const entries = [];
  for (const pack of packs) {
    const base = join(ASSETS_OUT, pack.id);
    out.set(join(base, "manifest.cpack"), Buffer.from(JSON.stringify(pack.manifest)));
    const audio = [];
    for (const file of pack.manifest.files) {
      const from = join(pack.dir, file.path);
      if (file.path === "content.json") {
        out.set(join(base, "content.cpack"), readFileSync(from));
      } else if (file.path.startsWith("audio/") && existsSync(from)) {
        out.set(join(base, file.path), readFileSync(from));
        audio.push(file.path);
      }
    }
    entries.push({ pack, audio });
  }

  const req = (path) => `require(${JSON.stringify("../../" + relative(mobile, path))})`;
  const lines = [
    "// GENERATED by mobile/scripts/sync-content.mjs. Do not edit; run `npm run content:sync`.",
    "//",
    "// The content packs bundled with the app. Each `content` and `manifest` is an",
    "// asset module (a .cpack file), read from disk when a level is first opened.",
    "/* eslint-disable @typescript-eslint/no-require-imports */",
    "",
    "export interface BundledPack {",
    "  id: string;",
    "  version: number;",
    "  level?: string;",
    "  title: string;",
    "  bytes: number;",
    "  content: number;",
    "  audio: Record<string, number>;",
    "}",
    "",
    `/** "fixture" until the content pipeline has built packs into public/packs. */`,
    `export const BUNDLED_SOURCE: "packs" | "fixture" = ${JSON.stringify(source)};`,
    "",
    "export const BUNDLED_PACKS: BundledPack[] = [",
  ];
  for (const { pack, audio } of entries) {
    const bytes = pack.manifest.files.reduce((sum, file) => sum + file.bytes, 0);
    lines.push("  {");
    lines.push(`    id: ${JSON.stringify(pack.id)},`);
    lines.push(`    version: ${pack.version},`);
    if (pack.level) lines.push(`    level: ${JSON.stringify(pack.level)},`);
    lines.push(`    title: ${JSON.stringify(pack.title)},`);
    lines.push(`    bytes: ${bytes},`);
    lines.push(`    content: ${req(join(ASSETS_OUT, pack.id, "content.cpack"))},`);
    lines.push("    audio: {");
    for (const path of audio) lines.push(`      ${JSON.stringify(path)}: ${req(join(ASSETS_OUT, pack.id, path))},`);
    lines.push("    },");
    lines.push("  },");
  }
  lines.push("];", "");
  out.set(MODULE_OUT, Buffer.from(lines.join("\n")));

  const articulation = collectArticulation();
  out.set(ARTICULATION_OUT, Buffer.from(JSON.stringify({ format: 1, source: articulation.source, targets: articulation.targets }) + "\n"));
  return { out, source, articulationSource: articulation.source, packs };
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

const { out, source, articulationSource, packs } = plan();
const stale = [];
for (const [path, buffer] of out) {
  if (!existsSync(path) || !readFileSync(path).equals(buffer)) stale.push(path);
}
const extra = listFiles(ASSETS_OUT).filter((path) => !out.has(path));

if (check) {
  if (stale.length || extra.length) {
    console.error("Bundled content is out of date. Run `npm run content:sync`.");
    for (const path of [...stale, ...extra]) console.error(`  ${relative(mobile, path)}`);
    process.exit(1);
  }
  console.log("Bundled content is up to date.");
} else {
  for (const path of extra) rmSync(path);
  for (const [path, buffer] of out) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, buffer);
  }
  console.log(`Packs (${source}): ${packs.map((p) => `${p.id} v${p.version}`).join(", ") || "none"}`);
  console.log(`Articulation targets: ${articulationSource}`);
}

