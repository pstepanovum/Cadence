// FILE: src/lib/mcp/advanced-content.ts
//
// The phrase bank, slang and plateau packs as the server reads them
// (docs/PLATFORM.md sections 17 and 18), for the connector's teacher tools:
// read from public/packs once per instance, like the core packs in
// ../server/packs.ts. Each item's audio link is set only when the pack
// actually holds its pre-generated file, so a client is never handed a link
// that 404s.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { canReadPack, type PackIndex, type PackManifest } from "../platform/content-model";
import type { FossilError, FossilizationData } from "../platform/fossilization";
import type { Phrase, PhraseBankData, SlangData, SlangEntry } from "../platform/phrase-bank";
import { packsDir } from "../server/packs";

export interface AdvancedLibrary {
  phrases: Phrase[];
  phraseById: Map<string, Phrase>;
  slang: SlangEntry[];
  slangById: Map<string, SlangEntry>;
  slangCategories: { id: string; title: string }[];
  errors: FossilError[];
  errorById: Map<string, FossilError>;
  /** `phrase.x` / `slang.y` to the public path of its audio file, when there is one. */
  audio: Map<string, string>;
}

let cached: Promise<AdvancedLibrary> | null = null;

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(/* turbopackIgnore: true */ path, "utf8")) as T;
  } catch {
    return null;
  }
}

type AdvancedContent = { phrases?: PhraseBankData; slang?: SlangData; fossilization?: FossilizationData };

async function load(dir: string): Promise<AdvancedLibrary> {
  const library: AdvancedLibrary = { phrases: [], phraseById: new Map(), slang: [], slangById: new Map(), slangCategories: [], errors: [], errorById: new Map(), audio: new Map() };
  const index = await readJson<PackIndex>(join(/* turbopackIgnore: true */ dir, "index.json"));
  for (const entry of index?.packs ?? []) {
    if (!/^(phrases-[a-z0-9-]+|slang|fossilization)$/.test(entry.id) || !Number.isInteger(entry.version)) continue;
    const root = join(/* turbopackIgnore: true */ dir, entry.id, `v${entry.version}`);
    const manifest = await readJson<PackManifest>(join(/* turbopackIgnore: true */ root, "manifest.json"));
    if (!manifest || !canReadPack(manifest)) continue;
    const audioFiles = new Set(manifest.files.filter((f) => f.path.startsWith("audio/")).map((f) => f.path));
    const content = await readJson<AdvancedContent>(join(/* turbopackIgnore: true */ root, "content.json"));
    if (!content) continue;
    const audioUrl = (path: string | undefined) => (path && audioFiles.has(path) ? `/packs/${entry.id}/v${entry.version}/${path}` : null);
    for (const phrase of content.phrases?.phrases ?? []) {
      library.phrases.push(phrase);
      library.phraseById.set(phrase.id, phrase);
      const url = audioUrl(phrase.audio);
      if (url) library.audio.set(phrase.id, url);
    }
    for (const item of content.slang?.entries ?? []) {
      library.slang.push(item);
      library.slangById.set(item.id, item);
      const url = audioUrl(item.audio);
      if (url) library.audio.set(item.id, url);
    }
    if (content.slang?.categories) library.slangCategories = content.slang.categories;
    for (const error of content.fossilization?.errors ?? []) {
      library.errors.push(error);
      library.errorById.set(error.id, error);
    }
  }
  return library;
}

export function advancedLibrary(): Promise<AdvancedLibrary> {
  if (!cached) {
    cached = load(packsDir()).catch((error) => {
      cached = null;
      throw error;
    });
  }
  return cached;
}

/** For tests: forget the cached packs. */
export function resetAdvancedLibrary(): void {
  cached = null;
}

/** The text a drill step id stands for: a phrase, a slang entry, or a plateau step (`fossil.x#d3`). */
export function stepText(library: AdvancedLibrary, itemId: string): { say: string; meaning: string; tip: string } | null {
  const phrase = library.phraseById.get(itemId);
  if (phrase) return { say: phrase.example, meaning: `${phrase.text}: ${phrase.meaning}`, tip: phrase.note };
  const entry = library.slangById.get(itemId);
  if (entry) return { say: entry.examples[0], meaning: `${entry.term}: ${entry.meaning}`, tip: entry.usageNote };
  const [errorId, step] = itemId.split("#");
  const error = library.errorById.get(errorId);
  if (!error || !step) return null;
  const n = Number(step.replace(/^[a-z]+/, ""));
  const kind = step.replace(/\d+$/, "");
  if (kind === "c" && error.contrasts[n]) return { say: error.contrasts[n].right, meaning: error.title, tip: `Not "${error.contrasts[n].wrong}". ${error.contrasts[n].note}` };
  if (kind === "d" && error.drills[n]) return { say: error.drills[n], meaning: error.title, tip: error.listenFor };
  if (kind === "p" && error.pairs[n]) return { say: `${error.pairs[n][0]}, ${error.pairs[n][1]}`, meaning: error.title, tip: "Say the pair slowly, then quickly, keeping the two words different." };
  if (kind === "s" && error.stress[n]) return { say: error.stress[n].text, meaning: error.title, tip: `Stress: ${error.stress[n].marked}. ${error.stress[n].note}` };
  return null;
}
