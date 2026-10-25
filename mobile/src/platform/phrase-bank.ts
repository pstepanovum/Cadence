// FILE: mobile/src/platform/phrase-bank.ts
//
// The phrase bank and the slang dictionary (docs/PLATFORM.md section 17):
// their records, validators, search, drills, quizzes and the mapping from a
// drill result to a spaced-review grade. Static content, free in every mode;
// review state is keyed by item id and scheduled by the one scheduler in
// srs.ts. Pure: no storage, no network, no React.
//
// Twin: src/lib/platform/phrase-bank.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import { CEFR_LEVELS, normalizeAnswer, type CefrLevel } from "./content-model.ts";
import { isDue, isNew, planSession, type CardState, type Grade } from "./srs.ts";

/** Where a phrase is used. Ids are permanent; titles may change. */
export const PHRASE_SITUATIONS = [
  { id: "meetings", title: "Meetings" },
  { id: "negotiation", title: "Negotiation" },
  { id: "small-talk", title: "Small talk" },
  { id: "disagreeing", title: "Disagreeing politely" },
  { id: "storytelling", title: "Storytelling" },
  { id: "academic", title: "Academic" },
  { id: "interviews", title: "Interviews" },
  { id: "travel", title: "Travel" },
  { id: "presenting", title: "Presenting" },
  { id: "feedback", title: "Giving feedback" },
  { id: "persuading", title: "Persuading" },
  { id: "explaining", title: "Explaining" },
  { id: "reacting", title: "Reacting and feelings" },
  { id: "problem-solving", title: "Problem solving" },
  { id: "socialising", title: "Socialising" },
  { id: "calls", title: "Calls and video calls" },
] as const;
export type PhraseSituation = (typeof PHRASE_SITUATIONS)[number]["id"];

/** The levels the bank covers, advanced first. */
export const PHRASE_LEVELS = ["B2", "C1", "C2"] as const satisfies readonly CefrLevel[];

export const PHRASE_KINDS = ["chunk", "collocation", "frame"] as const;
export type PhraseKind = (typeof PHRASE_KINDS)[number];

export interface Phrase {
  /** `phrase.<slug>`, permanent. */
  id: string;
  /** Dictionary form, e.g. "raise a concern". */
  text: string;
  kind: PhraseKind;
  /** The exact words as they appear in the example, e.g. "raised a concern". */
  form: string;
  level: CefrLevel;
  situations: PhraseSituation[];
  meaning: string;
  /** One natural sentence that contains `form` once. */
  example: string;
  /** The same idea said plainly without the phrase: the rephrase drill's prompt. */
  plain: string;
  /** Register, tone, who says it, or a trap. */
  note: string;
  /** Pre-generated audio of the example, relative to the pack (`audio/<hash>.m4a`). */
  audio?: string;
}

export const SLANG_FITS = ["texting", "friends", "work-casual", "avoid-at-work"] as const;
export type SlangFit = (typeof SLANG_FITS)[number];
export const SLANG_REGIONS = ["US", "UK", "global"] as const;
export type SlangRegion = (typeof SLANG_REGIONS)[number];
export const SLANG_REGISTERS = ["informal", "very-informal"] as const;
export type SlangRegister = (typeof SLANG_REGISTERS)[number];

export const SLANG_FIT_LABELS: Record<SlangFit, string> = {
  texting: "Texting",
  friends: "With friends",
  "work-casual": "Fine at work",
  "avoid-at-work": "Not at work",
};

export interface SlangQuizSource {
  /** contextQuiz: the question; replyQuiz: the message being answered. */
  prompt: string;
  options: string[];
  answer: number;
}

export interface SlangEntry {
  /** `slang.<slug>`, permanent. */
  id: string;
  term: string;
  partOfSpeech: string;
  meaning: string;
  register: SlangRegister;
  fits: SlangFit[];
  region: SlangRegion;
  category: string;
  /** Two or three natural sentences or messages. */
  examples: string[];
  /** Who says it and how it sounds. */
  usageNote: string;
  /** Still understood, but it sounds a few years old. */
  dated: boolean;
  datedNote?: string;
  popularSince: string;
  contextQuiz: SlangQuizSource;
  replyQuiz: SlangQuizSource;
  audio?: string;
}

/** `phrases.json` / the `phrases` field of a phrases pack's content.json. */
export interface PhraseBankData {
  format: 1;
  phrases: Phrase[];
}

export interface SlangData {
  format: 1;
  categories: { id: string; title: string }[];
  entries: SlangEntry[];
}

const PHRASE_ID = /^phrase\.[a-z0-9][a-z0-9-]{0,88}$/;
const SLANG_ID = /^slang\.[a-z0-9][a-z0-9-]{0,88}$/;

export const isPhraseId = (id: string) => PHRASE_ID.test(id);
export const isSlangId = (id: string) => SLANG_ID.test(id);

const situationIds = new Set<string>(PHRASE_SITUATIONS.map((s) => s.id));

function within(p: string[], where: string, text: unknown, min: number, max: number) {
  if (typeof text !== "string" || text.trim().length < min || text.length > max) p.push(`${where}: must be ${min} to ${max} characters`);
}

/** Problems with one phrase record; empty when it is fine. */
export function validatePhrase(phrase: Phrase): string[] {
  const p: string[] = [];
  const id = phrase.id || "(no id)";
  if (!isPhraseId(phrase.id)) p.push(`${id}: id must look like phrase.<slug>`);
  if (!(PHRASE_KINDS as readonly string[]).includes(phrase.kind)) p.push(`${id}: unknown kind ${phrase.kind}`);
  if (!(CEFR_LEVELS as readonly string[]).includes(phrase.level)) p.push(`${id}: unknown level ${phrase.level}`);
  if (!phrase.situations?.length || phrase.situations.some((s) => !situationIds.has(s))) p.push(`${id}: needs known situations`);
  within(p, `${id} text`, phrase.text, 3, 80);
  within(p, `${id} form`, phrase.form, 3, 90);
  within(p, `${id} meaning`, phrase.meaning, 6, 140);
  within(p, `${id} example`, phrase.example, 10, 220);
  within(p, `${id} plain`, phrase.plain, 6, 220);
  within(p, `${id} note`, phrase.note, 0, 170);
  if (typeof phrase.example === "string" && typeof phrase.form === "string" && !phrase.example.toLowerCase().includes(phrase.form.toLowerCase())) {
    p.push(`${id}: example does not contain "${phrase.form}"`);
  }
  if (phrase.text && phrase.text.trim().split(/\s+/).length < 2) p.push(`${id}: a phrase has at least two words`);
  return p;
}

/** Problems with one slang entry; empty when it is fine. */
export function validateSlang(entry: SlangEntry): string[] {
  const p: string[] = [];
  const id = entry.id || "(no id)";
  if (!isSlangId(entry.id)) p.push(`${id}: id must look like slang.<slug>`);
  within(p, `${id} term`, entry.term, 1, 40);
  within(p, `${id} meaning`, entry.meaning, 6, 140);
  within(p, `${id} usage note`, entry.usageNote, 6, 170);
  if (!(SLANG_REGISTERS as readonly string[]).includes(entry.register)) p.push(`${id}: unknown register`);
  if (!(SLANG_REGIONS as readonly string[]).includes(entry.region)) p.push(`${id}: unknown region`);
  if (!entry.fits?.length || entry.fits.some((f) => !(SLANG_FITS as readonly string[]).includes(f))) p.push(`${id}: needs known fits`);
  if (entry.fits?.includes("work-casual") && entry.fits.includes("avoid-at-work")) p.push(`${id}: cannot be both fine and not fine at work`);
  if (!Array.isArray(entry.examples) || entry.examples.length < 2 || entry.examples.length > 3) p.push(`${id}: needs two or three examples`);
  for (const [name, quiz, min, max] of [["context quiz", entry.contextQuiz, 4, 4], ["reply quiz", entry.replyQuiz, 3, 4]] as const) {
    const n = quiz?.options?.length ?? 0;
    if (!quiz || n < min || n > max || !Number.isInteger(quiz.answer) || quiz.answer < 0 || quiz.answer >= n) p.push(`${id}: ${name} needs ${min === max ? min : `${min} or ${max}`} options and an answer`);
    else if (new Set(quiz.options.map(normalizeAnswer)).size !== n) p.push(`${id}: ${name} repeats an option`);
  }
  if (typeof entry.dated !== "boolean") p.push(`${id}: dated must be true or false`);
  return p;
}

// Hashing and deterministic order ----------------------------------------

/** FNV-1a, 32 bits: stable across every runtime, for picking and shuffling. */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The items in an order fixed by `seed`: the same seed, the same order, on every device. */
export function seededOrder<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => hash32(`${seed}|${key(a)}`) - hash32(`${seed}|${key(b)}`) || (key(a) < key(b) ? -1 : 1));
}

// Search -------------------------------------------------------------------

export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PhraseQuery {
  query?: string;
  level?: CefrLevel;
  situation?: string;
  kind?: PhraseKind;
  limit?: number;
}

/** Phrases matching a query, best first: the phrase itself, then its meaning, example and note. */
export function searchPhrases(phrases: readonly Phrase[], q: PhraseQuery): Phrase[] {
  const limit = q.limit ?? 20;
  const terms = foldText(q.query ?? "").split(" ").filter((t) => t.length > 1);
  const scored: { phrase: Phrase; score: number }[] = [];
  for (const phrase of phrases) {
    if (q.level && phrase.level !== q.level) continue;
    if (q.situation && !phrase.situations.includes(q.situation as PhraseSituation)) continue;
    if (q.kind && phrase.kind !== q.kind) continue;
    if (terms.length === 0) {
      scored.push({ phrase, score: 0 });
      continue;
    }
    const head = foldText(phrase.text);
    const body = foldText(`${phrase.meaning} ${phrase.example} ${phrase.note}`);
    let score = 0;
    for (const term of terms) {
      if (head.split(" ").includes(term)) score += 4;
      else if (head.includes(term)) score += 3;
      else if (body.includes(term)) score += 1;
    }
    if (head === foldText(q.query ?? "")) score += 6;
    if (score > 0) scored.push({ phrase, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || PHRASE_LEVEL_ORDER(a.phrase.level) - PHRASE_LEVEL_ORDER(b.phrase.level) || (a.phrase.id < b.phrase.id ? -1 : 1))
    .slice(0, limit)
    .map((s) => s.phrase);
}

const PHRASE_LEVEL_ORDER = (level: CefrLevel) => CEFR_LEVELS.indexOf(level);

export interface SlangQuery {
  query?: string;
  fit?: SlangFit;
  region?: SlangRegion;
  category?: string;
  includeDated?: boolean;
  limit?: number;
}

export function searchSlang(entries: readonly SlangEntry[], q: SlangQuery): SlangEntry[] {
  const limit = q.limit ?? 20;
  const terms = foldText(q.query ?? "").split(" ").filter((t) => t.length > 0);
  const scored: { entry: SlangEntry; score: number }[] = [];
  for (const entry of entries) {
    if (!q.includeDated && q.includeDated !== undefined && entry.dated) continue;
    if (q.fit && !entry.fits.includes(q.fit)) continue;
    if (q.region && entry.region !== q.region && entry.region !== "global") continue;
    if (q.category && entry.category !== q.category) continue;
    if (terms.length === 0) {
      scored.push({ entry, score: 0 });
      continue;
    }
    const head = foldText(entry.term);
    const body = foldText(`${entry.meaning} ${entry.usageNote} ${entry.examples.join(" ")}`);
    let score = 0;
    for (const term of terms) {
      if (head === term) score += 8;
      else if (head.split(" ").includes(term)) score += 4;
      else if (head.includes(term)) score += 3;
      else if (body.includes(term)) score += 1;
    }
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || Number(a.entry.dated) - Number(b.entry.dated) || (a.entry.term < b.entry.term ? -1 : 1))
    .slice(0, limit)
    .map((s) => s.entry);
}

// Phrase drills ------------------------------------------------------------

export const PHRASE_DRILLS = ["listen_repeat", "shadowing", "gap_fill", "rephrase"] as const;
export type PhraseDrillKind = (typeof PHRASE_DRILLS)[number];

export const PHRASE_DRILL_TITLES: Record<PhraseDrillKind, string> = {
  listen_repeat: "Listen and repeat",
  shadowing: "Shadowing",
  gap_fill: "Gap fill",
  rephrase: "Rephrase",
};

export type PhraseDrill =
  | { kind: "listen_repeat"; itemId: string; instruction: string; say: string; reps: number }
  | { kind: "shadowing"; itemId: string; instruction: string; say: string }
  | { kind: "gap_fill"; itemId: string; instruction: string; text: string; hint: string; answers: string[] }
  | { kind: "rephrase"; itemId: string; instruction: string; plain: string; hint: string; target: string };

/** The example with the phrase blanked out as `___`. */
export function gapText(phrase: Phrase): string {
  const at = phrase.example.toLowerCase().indexOf(phrase.form.toLowerCase());
  if (at < 0) return phrase.example;
  return `${phrase.example.slice(0, at)}___${phrase.example.slice(at + phrase.form.length)}`;
}

/** First letters of each word, for a gap-fill hint ("r_ a c_"). */
export function initialsHint(text: string): string {
  return text
    .split(/\s+/)
    .map((word) => (word.length <= 1 ? word : `${word[0]}${"_".repeat(Math.min(6, word.replace(/[^a-z']/gi, "").length - 1))}`))
    .join(" ");
}

export function buildPhraseDrill(phrase: Phrase, kind: PhraseDrillKind): PhraseDrill {
  switch (kind) {
    case "listen_repeat":
      return { kind, itemId: phrase.id, instruction: "Listen, then say it three times. Match the rhythm, not just the words.", say: phrase.example, reps: 3 };
    case "shadowing":
      return { kind, itemId: phrase.id, instruction: "Play it and speak along with it, a fraction behind, until you can keep pace.", say: phrase.example };
    case "gap_fill":
      return { kind, itemId: phrase.id, instruction: "Complete the sentence with the phrase.", text: gapText(phrase), hint: `${phrase.meaning} (${initialsHint(phrase.form)})`, answers: [...new Set([phrase.form, phrase.text])] };
    case "rephrase":
      return { kind, itemId: phrase.id, instruction: `Say it again using "${phrase.text}".`, plain: phrase.plain, hint: phrase.meaning, target: phrase.example };
  }
}

/** A typed gap-fill answer: the form in the example or the dictionary form. */
export function gradeGapFill(phrase: Phrase, typed: string): boolean {
  const given = normalizeAnswer(typed);
  return given.length > 0 && (given === normalizeAnswer(phrase.form) || given === normalizeAnswer(phrase.text));
}

/**
 * A rephrase is right when it uses the phrase: its exact form, its dictionary
 * form, or (for a verb phrase) every word of it but the first with the first
 * in any form, so "raising a concern" counts for "raise a concern".
 */
export function gradeRephrase(phrase: Phrase, answer: string): boolean {
  const given = ` ${foldText(answer)} `;
  if (foldText(answer).length === 0) return false;
  for (const candidate of [phrase.form, phrase.text]) if (given.includes(` ${foldText(candidate)} `)) return true;
  const words = foldText(phrase.text).split(" ");
  if (words.length >= 3) {
    const tail = ` ${words.slice(1).join(" ")} `;
    const stem = words[0].slice(0, Math.max(3, words[0].length - 2));
    const at = given.indexOf(tail);
    if (at > 0) {
      const before = given.slice(0, at).trim().split(" ");
      if (before.length && before[before.length - 1].startsWith(stem)) return true;
    }
  }
  return false;
}

/** The drills a session runs for one phrase, in order: hear and say first, then recall. */
export function drillsForPhrase(phrase: Phrase, options: { recall?: boolean } = {}): PhraseDrill[] {
  const kinds: PhraseDrillKind[] = options.recall === false ? ["listen_repeat", "shadowing"] : ["listen_repeat", "gap_fill", "rephrase", "shadowing"];
  return kinds.map((kind) => buildPhraseDrill(phrase, kind));
}

// Slang quizzes ------------------------------------------------------------

export const SLANG_QUIZZES = ["meaning", "context", "reply"] as const;
export type SlangQuizKind = (typeof SLANG_QUIZZES)[number];

export interface SlangQuiz {
  kind: SlangQuizKind;
  itemId: string;
  question: string;
  options: string[];
  answer: number;
}

/**
 * One quiz question for an entry. Meaning distractors come from other entries
 * in `pool`, chosen and ordered by `seed`, so the same seed asks the same
 * question on every device; the stored quizzes keep their options but are
 * shuffled the same way.
 */
export function buildSlangQuiz(entry: SlangEntry, kind: SlangQuizKind, pool: readonly SlangEntry[], seed: string): SlangQuiz {
  let options: string[];
  let correct: string;
  let question: string;
  if (kind === "meaning") {
    correct = entry.meaning;
    const others = seededOrder(
      pool.filter((e) => e.id !== entry.id && normalizeAnswer(e.meaning) !== normalizeAnswer(entry.meaning)),
      `${seed}|${entry.id}`,
      (e) => e.id,
    ).slice(0, 3);
    options = [correct, ...others.map((e) => e.meaning)];
    question = `What does "${entry.term}" mean?`;
  } else {
    const source = kind === "context" ? entry.contextQuiz : entry.replyQuiz;
    correct = source.options[source.answer];
    options = [...source.options];
    question = kind === "context" ? source.prompt : `Reply to: "${source.prompt}"`;
  }
  const shuffled = seededOrder(options, `${seed}|${entry.id}|${kind}`, (o) => o);
  return { kind, itemId: entry.id, question, options: shuffled, answer: shuffled.indexOf(correct) };
}

// Spaced review --------------------------------------------------------------

/** A recall drill or quiz: right first time is good, right after a retry is hard, wrong is again. */
export function gradeFromAnswer(correct: boolean, tries = 1): Grade {
  if (!correct) return "again";
  return tries <= 1 ? "good" : "hard";
}

/** A spoken take scored 0 to 100 by the engine. */
export function gradeFromScore(score: number): Grade {
  if (score < 60) return "again";
  if (score < 75) return "hard";
  if (score < 92) return "good";
  return "easy";
}

/** The learner's own rating after listening back, for drills nothing can score. */
export function gradeFromSelf(rating: "again" | "close" | "nailed"): Grade {
  return rating === "again" ? "again" : rating === "close" ? "hard" : "good";
}

/**
 * Today's review: due items first, then new ones from `order` (the deck's own
 * order, usually `dailyNewOrder`). The same planner as flashcards.
 */
export function planItemReview(order: readonly string[], cards: Readonly<Record<string, CardState>>, now: Date, options: { newLimit?: number; reviewLimit?: number } = {}) {
  return planSession(order, cards, now, { newLimit: options.newLimit ?? 5, reviewLimit: options.reviewLimit ?? 15 });
}

/**
 * New items in an order that changes by day but is the same on every device
 * for that day, so a phone and the connector agree on "today's phrases".
 */
export function dailyNewOrder(ids: readonly string[], day: string): string[] {
  return seededOrder(ids, `daily|${day}`, (id) => id);
}

export function dueCount(ids: readonly string[], cards: Readonly<Record<string, CardState>>, now: Date): number {
  return ids.filter((id) => isDue(cards[id], now)).length;
}

export function startedCount(ids: readonly string[], cards: Readonly<Record<string, CardState>>): number {
  return ids.filter((id) => !isNew(cards[id])).length;
}

/** Ids from a list the learner or their assistant assigned, in a stable order and without repeats. */
export interface PracticeListItem {
  itemId: string;
  addedAt: number;
  /** Who added it: the learner on a device, or the connector. */
  source: "device" | "connector";
  note?: string;
}

export const PRACTICE_LIST_CAP = 200;

/** Adds items to the practice list, newest last, never twice, at most PRACTICE_LIST_CAP (oldest drop first). */
export function addToPracticeList(list: readonly PracticeListItem[], items: readonly PracticeListItem[]): PracticeListItem[] {
  const byId = new Map(list.map((item) => [item.itemId, item]));
  for (const item of items) if (!byId.has(item.itemId)) byId.set(item.itemId, item);
  const merged = [...byId.values()].sort((a, b) => a.addedAt - b.addedAt || (a.itemId < b.itemId ? -1 : 1));
  return merged.slice(Math.max(0, merged.length - PRACTICE_LIST_CAP));
}

export function removeFromPracticeList(list: readonly PracticeListItem[], itemIds: readonly string[]): PracticeListItem[] {
  const drop = new Set(itemIds);
  return list.filter((item) => !drop.has(item.itemId));
}

/** What kind of item an id names, from its prefix. */
export function itemKind(id: string): "phrase" | "slang" | "fossil" | "other" {
  if (id.startsWith("phrase.")) return "phrase";
  if (id.startsWith("slang.")) return "slang";
  if (id.startsWith("fossil.")) return "fossil";
  return "other";
}
