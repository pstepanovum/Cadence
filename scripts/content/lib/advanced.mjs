// The advanced packs (docs/PLATFORM.md sections 17 and 18), assembled from
// what phrases.mjs, slang.mjs and fossilization.mjs wrote under content/:
//
//   phrases-b2, phrases-c1, phrases-c2   the phrase bank by level (`phrases` in content.json),
//                                        split as phrases-c1-2 and so on past PHRASES_PER_PACK
//   slang                                the slang dictionary (`slang` in content.json)
//   fossilization                        the plateau track's errors (`fossilization` in content.json)
//
// Each pack's content.json still carries the four standard lists (empty), so
// every reader that only knows the core packs reads it as an empty pack. None
// of these packs has a level, so nothing that looks a level up picks one.
// Only items that passed the blind check (and, for slang, the review) are kept.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.mjs";
import { EXCLUDED_TERMS } from "./slang-exclusions.mjs";
import { slugify, textKey } from "./text.mjs";
import { audioPath } from "./assemble.mjs";
import { SITUATIONS } from "../data/phrase-plan.mjs";
import { FOSSIL_ERRORS } from "../data/fossilization-plan.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const EMPTY = { topics: [], grammarPoints: [], lessons: [], exercises: [] };
const LEVEL_ORDER = ["B2", "C1", "C2"];
/** About 115 bytes of gzip a phrase, so 1,800 stay well under the 300 KB budget. */
export const PHRASES_PER_PACK = 1800;

/** Every phrase that passed, deduplicated across situations (the lowest level wins, situations merge), with permanent ids. */
export function loadPhrases() {
  const byKey = new Map();
  for (const level of LEVEL_ORDER) {
    const dir = join(CONTENT_DIR, "phrases", level.toLowerCase());
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
      const file = readJson(join(dir, name));
      for (const item of file.rounds.flatMap((r) => r.items)) {
        if (file.check?.results?.[textKey(item.text)]?.status !== "pass") continue;
        const key = textKey(item.text);
        const existing = byKey.get(key);
        if (existing) {
          if (!existing.situations.includes(file.situation)) existing.situations.push(file.situation);
          continue;
        }
        byKey.set(key, { ...item, level, situations: [file.situation] });
      }
    }
  }
  const order = new Map(SITUATIONS.map((s, i) => [s[0], i]));
  const used = new Set();
  const phrases = [];
  for (const item of [...byKey.values()].sort((a, b) => textKey(a.text).localeCompare(textKey(b.text)))) {
    let slug = slugify(item.text) || "phrase";
    for (let n = 2; used.has(slug); n += 1) slug = `${slugify(item.text)}-${n}`;
    used.add(slug);
    phrases.push({
      id: `phrase.${slug}`,
      text: item.text,
      kind: item.kind,
      form: item.form,
      level: item.level,
      situations: item.situations.sort((a, b) => order.get(a) - order.get(b)),
      meaning: item.meaning,
      example: item.example,
      plain: item.plain,
      note: item.note,
      audio: audioPath(item.example),
    });
  }
  return phrases;
}

export const SLANG_CATEGORY_TITLES = {
  reactions: "Reactions",
  feelings: "Feelings and moods",
  people: "People",
  quality: "Good and bad",
  agreement: "Agreement and emphasis",
  online: "Online and texting",
  work: "Casual at work",
  money: "Money and shopping",
  "going-out": "Going out and food",
  relationships: "Friends and dating",
  uk: "British informal",
  us: "American informal",
};

export function loadSlang() {
  const dir = join(CONTENT_DIR, "slang");
  if (!existsSync(dir)) return { categories: [], entries: [] };
  const seen = new Set();
  const used = new Set();
  const entries = [];
  const categories = [];
  for (const id of Object.keys(SLANG_CATEGORY_TITLES)) {
    const path = join(dir, `${id}.json`);
    if (!existsSync(path)) continue;
    const file = readJson(path);
    let count = 0;
    for (const e of file.items) {
      const verdict = file.check?.results?.[textKey(e.term)];
      if (verdict?.status !== "pass" || seen.has(textKey(e.term)) || EXCLUDED_TERMS.has(textKey(e.term))) continue;
      seen.add(textKey(e.term));
      let slug = slugify(e.term) || "term";
      for (let n = 2; used.has(slug); n += 1) slug = `${slugify(e.term)}-${n}`;
      used.add(slug);
      count += 1;
      entries.push({
        id: `slang.${slug}`,
        term: e.term,
        partOfSpeech: e.partOfSpeech,
        meaning: e.meaning,
        register: e.register,
        fits: e.fits,
        region: e.region,
        category: id,
        examples: e.examples,
        usageNote: e.usageNote,
        dated: Boolean(verdict.dated),
        ...(verdict.dated ? { datedNote: verdict.note } : {}),
        popularSince: e.popularSince,
        contextQuiz: { prompt: e.contextQuiz.question, options: e.contextQuiz.options, answer: e.contextQuiz.answer },
        replyQuiz: { prompt: e.replyQuiz.message, options: e.replyQuiz.options, answer: e.replyQuiz.answer },
        audio: audioPath(e.examples[0]),
      });
    }
    if (count) categories.push({ id, title: SLANG_CATEGORY_TITLES[id] });
  }
  return { categories, entries: entries.sort((a, b) => a.term.localeCompare(b.term)) };
}

export function loadFossilization() {
  const dir = join(CONTENT_DIR, "fossilization");
  if (!existsSync(dir)) return [];
  return FOSSIL_ERRORS.map(([slug]) => join(dir, `${slug}.json`))
    .filter(existsSync)
    .map((path) => {
      const { format, ...error } = readJson(path);
      void format;
      return error;
    });
}

export function advancedPacks() {
  const packs = [];
  const phrases = loadPhrases();
  for (const level of LEVEL_ORDER) {
    const own = phrases.filter((p) => p.level === level);
    // A level past PHRASES_PER_PACK is split into parts (phrases-c1, phrases-c1-2, ...), so each
    // content.json stays inside the size budget as the bank grows; ids stay with their phrase.
    for (let start = 0, part = 1; start < own.length; start += PHRASES_PER_PACK, part += 1) {
      const id = `phrases-${level.toLowerCase()}${part > 1 ? `-${part}` : ""}`;
      packs.push({ id, title: `Cadence phrases ${level}${part > 1 ? ` (${part})` : ""}`, files: { "content.json": { ...EMPTY, phrases: { format: 1, phrases: own.slice(start, start + PHRASES_PER_PACK) } } } });
    }
  }
  const slang = loadSlang();
  if (slang.entries.length) packs.push({ id: "slang", title: "Cadence slang", files: { "content.json": { ...EMPTY, slang: { format: 1, ...slang } } } });
  const errors = loadFossilization();
  if (errors.length) packs.push({ id: "fossilization", title: "Cadence plateau track", files: { "content.json": { ...EMPTY, fossilization: { format: 1, errors } } } });
  return packs;
}
