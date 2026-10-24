// FILE: src/lib/server/packs.ts
//
// The content packs as the server reads them: public/packs/index.json and each
// pack's content.json, from disk, once per instance (packs are immutable per
// version, and a deploy brings new ones). Used by the MCP grammar lookup and
// quizzes and by spoken grammar feedback for its candidate list. Packs the
// server cannot read (`canReadPack`) are skipped, never half-read. With no
// packs built yet everything here is simply empty.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  canReadPack,
  type CefrLevel,
  type Exercise,
  type GrammarPoint,
  type PackContent,
  type PackIndex,
  type PackManifest,
  type Topic,
} from "../platform/content-model";
import type { CoachScenario } from "./engines/prompts";

export interface ContentLibrary {
  grammarPoints: Map<string, GrammarPoint>;
  exercises: Map<string, Exercise>;
  topics: Map<string, Topic>;
  scenarios: Map<string, CoachScenario & { level?: CefrLevel }>;
}

let cached: Promise<ContentLibrary> | null = null;

export function packsDir(): string {
  return process.env.CADENCE_PACKS_DIR?.trim() || join(process.cwd(), "public", "packs");
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function load(dir: string): Promise<ContentLibrary> {
  const library: ContentLibrary = { grammarPoints: new Map(), exercises: new Map(), topics: new Map(), scenarios: new Map() };
  const index = await readJson<PackIndex>(join(dir, "index.json"));
  for (const entry of index?.packs ?? []) {
    if (!/^[a-z0-9-]+$/.test(entry.id) || !Number.isInteger(entry.version)) continue;
    const root = join(dir, entry.id, `v${entry.version}`);
    const manifest = await readJson<PackManifest>(join(root, "manifest.json"));
    if (!manifest || !canReadPack(manifest)) continue;
    for (const file of manifest.files.filter((f) => f.path.endsWith(".json") && !f.path.includes(".."))) {
      const content = await readJson<PackContent & { scenarios?: (CoachScenario & { level?: CefrLevel })[] }>(join(root, file.path));
      if (!content) continue;
      for (const gp of content.grammarPoints ?? []) library.grammarPoints.set(gp.id, gp);
      for (const ex of content.exercises ?? []) library.exercises.set(ex.id, ex);
      for (const topic of content.topics ?? []) library.topics.set(topic.id, topic);
      for (const scenario of content.scenarios ?? []) library.scenarios.set(scenario.id, scenario);
    }
  }
  return library;
}

export function contentLibrary(): Promise<ContentLibrary> {
  if (!cached) {
    cached = load(packsDir()).catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** For tests: forget the cached packs so the next read loads another directory. */
export function resetContentLibrary(): void {
  cached = null;
}

function fold(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Grammar points matching a free-text query, best first. */
export function searchGrammar(library: ContentLibrary, query: string, level?: CefrLevel, limit = 5): GrammarPoint[] {
  const terms = fold(query).split(" ").filter((term) => term.length > 1);
  if (terms.length === 0) return [];
  const scored: { gp: GrammarPoint; score: number }[] = [];
  for (const gp of library.grammarPoints.values()) {
    if (level && gp.level !== level) continue;
    const title = fold(gp.title);
    const body = fold([gp.id.replace(/[.-]/g, " "), gp.summary, ...gp.patterns].join(" "));
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 3;
      else if (body.includes(term)) score += 1;
    }
    if (fold(query) === title) score += 5;
    if (score > 0) scored.push({ gp, score });
  }
  return scored.sort((a, b) => b.score - a.score || a.gp.id.localeCompare(b.gp.id)).slice(0, limit).map((s) => s.gp);
}

/** Grammar points at or around a level, for spoken grammar feedback's candidate list. */
export function grammarCandidates(library: ContentLibrary, level: CefrLevel, limit = 60) {
  const order = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const index = order.indexOf(level);
  const near = new Set(order.slice(Math.max(0, index - 1), index + 2));
  return [...library.grammarPoints.values()]
    .filter((gp) => near.has(gp.level))
    .slice(0, limit)
    .map((gp) => ({ id: gp.id, title: gp.title }));
}
