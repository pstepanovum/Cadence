// FILE: src/lib/platform/placement.ts
//
// Placement scoring (docs/PLATFORM.md section 7): the adaptive written test
// over the placement bank (which item next, when to stop, the level and how
// sure it is), the older fixed staircase, and the spoken sample, which moves
// the written level by at most one. Pure and deterministic for a given random
// source, so the phone, the web and the server place a learner the same way.
// The items themselves are the `placement` content pack.
//
// Twin: mobile/src/platform/placement.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import { CEFR_LEVELS, compareCefr, type CefrLevel, type Exercise } from "./content-model.ts";

/** One placement question: its exercise id and the level it tests. */
export interface PlacementItem {
  id: string;
  level: CefrLevel;
}

/** Per-item scores from the shared grader, 0 to 1, keyed by item id. */
export type PlacementScores = Readonly<Record<string, number>>;

export type PlacementConfidence = "low" | "medium" | "high";

export interface PlacementEstimate {
  level: CefrLevel;
  confidence: PlacementConfidence;
  strengths: string[];
  focus: string[];
  /** False when no spoken sample was analysed and the written estimate stands alone. */
  spokenUsed: boolean;
}

/** A level is reached when at least half its questions are fully right. */
const PASS_SHARE = 0.5;

function levelResults(items: readonly PlacementItem[], scores: PlacementScores) {
  return CEFR_LEVELS.map((level) => {
    const asked = items.filter((item) => item.level === level);
    const right = asked.filter((item) => (scores[item.id] ?? 0) >= 1).length;
    return { level, asked: asked.length, passed: asked.length > 0 && right / asked.length >= PASS_SHARE };
  }).filter((result) => result.asked > 0);
}

/**
 * The written estimate: climb the levels the quiz asks about and keep the
 * highest one reached, stopping once two levels in a row are missed. Below
 * the first level asked, the estimate is that first level.
 */
export function writtenLevel(items: readonly PlacementItem[], scores: PlacementScores): CefrLevel {
  const results = levelResults(items, scores);
  let reached: CefrLevel = results[0]?.level ?? "A1";
  let misses = 0;
  for (const result of results) {
    if (result.passed) {
      reached = result.level;
      misses = 0;
    } else {
      misses += 1;
      if (misses >= 2) break;
    }
  }
  return reached;
}

/** The written score, 0 to 100. */
export function writtenScore(items: readonly PlacementItem[], scores: PlacementScores): number {
  if (items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + Math.max(0, Math.min(1, scores[item.id] ?? 0)), 0);
  return Math.round((total / items.length) * 100);
}

/**
 * How sure the written estimate is, from the shape of the staircase: high when
 * the levels are passed and then missed (at most one change), medium with two
 * changes, low when passes and misses keep alternating.
 */
export function writtenConfidence(items: readonly PlacementItem[], scores: PlacementScores): PlacementConfidence {
  const results = levelResults(items, scores);
  let changes = 0;
  for (let i = 1; i < results.length; i += 1) if (results[i].passed !== results[i - 1].passed) changes += 1;
  return changes <= 1 ? "high" : changes === 2 ? "medium" : "low";
}

/** The spoken level moves the written one by at most one step, either way. */
export function combineLevels(written: CefrLevel, spoken: CefrLevel | null): CefrLevel {
  if (!spoken) return written;
  const index = CEFR_LEVELS.indexOf(written);
  const step = Math.sign(compareCefr(spoken, written));
  return CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, Math.max(0, index + step))];
}

/** The written-only estimate, for when no AI is reachable ("says so": spokenUsed false). */
export function writtenEstimate(items: readonly PlacementItem[], scores: PlacementScores): PlacementEstimate {
  return { level: writtenLevel(items, scores), confidence: writtenConfidence(items, scores), strengths: [], focus: [], spokenUsed: false };
}

// ---------------------------------------------------------------------------
// The adaptive test
// ---------------------------------------------------------------------------
//
// A one-parameter-plus-guessing item model on a single ability scale: a level
// is the interval [i, i + 1) where i is its index (A1 = 0 ... C2 = 5), and an
// item of level i has difficulty i, so a learner at the bottom of a level gets
// half its items right and one in the middle about seven in ten. Typed items
// have no guessing floor; a multiple-choice item's floor is one in the number
// of options. The estimate is the posterior mean over a fine grid, starting
// from a broad prior centred between B1 and B2, so the first item is B2.

/** The kinds of placement item; the type is the fourth part of the id (ex.placement.<level>.<type>.<nn>). */
export const PLACEMENT_TYPES = ["grammar", "gap", "error", "transform", "order", "collocation", "reading"] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number];

/** Which per-skill estimate each type feeds; reading counts toward the overall level only. */
export const PLACEMENT_TYPE_SKILL: Readonly<Record<PlacementType, "grammar" | "vocabulary" | "reading">> = {
  grammar: "grammar",
  gap: "grammar",
  error: "grammar",
  transform: "grammar",
  order: "grammar",
  collocation: "vocabulary",
  reading: "reading",
};

export interface BankItem {
  id: string;
  level: CefrLevel;
  type: PlacementType;
  /** The chance of a right answer by guessing alone. */
  guess: number;
}

export interface AdaptiveResponse {
  id: string;
  level: CefrLevel;
  type: PlacementType;
  guess: number;
  /** From the shared grader, 0 to 1; anything below 1 counts as wrong. */
  score: number;
}

export const ADAPTIVE = {
  minItems: 12,
  maxItems: 24,
  /** Stop once this much of the estimate lies inside one level. */
  stopMass: 0.8,
  priorMean: 2.5,
  priorSd: 1.6,
  slope: 1.7,
} as const;

const ID_RE = /^ex\.placement\.(a1|a2|b1|b2|c1|c2)\.([a-z]+)\.\d+$/;

/** The placement pack's exercises as bank items (anything else is ignored). */
export function bankFromExercises(exercises: readonly Exercise[]): BankItem[] {
  const out: BankItem[] = [];
  for (const exercise of exercises) {
    const match = ID_RE.exec(exercise.id);
    if (!match || !(PLACEMENT_TYPES as readonly string[]).includes(match[2])) continue;
    const guess = exercise.kind === "multiple_choice" ? 1 / Math.max(2, exercise.options.length) : 0;
    out.push({ id: exercise.id, level: exercise.level, type: match[2] as PlacementType, guess });
  }
  return out;
}

const GRID: number[] = Array.from({ length: 161 }, (_, i) => -1 + i * 0.05);

function pCorrect(theta: number, difficulty: number, guess: number): number {
  return guess + (1 - guess) / (1 + Math.exp(-ADAPTIVE.slope * (theta - difficulty)));
}

export interface AbilityEstimate {
  /** Posterior mean on the level scale (A1 = 0 ... C2 = 5, each level one unit wide). */
  theta: number;
  sd: number;
  level: CefrLevel;
  /** How much of the estimate lies inside that level, 0 to 1. */
  probability: number;
  confidence: PlacementConfidence;
}

/** The ability estimate from the answers so far. */
export function estimateAbility(responses: readonly Pick<AdaptiveResponse, "level" | "guess" | "score">[]): AbilityEstimate {
  const logs = GRID.map((theta) => -((theta - ADAPTIVE.priorMean) ** 2) / (2 * ADAPTIVE.priorSd ** 2));
  for (const response of responses) {
    const difficulty = CEFR_LEVELS.indexOf(response.level);
    const right = response.score >= 1;
    GRID.forEach((theta, i) => {
      const p = pCorrect(theta, difficulty, response.guess);
      logs[i] += Math.log(right ? p : 1 - p);
    });
  }
  const top = Math.max(...logs);
  const weights = logs.map((l) => Math.exp(l - top));
  const total = weights.reduce((a, b) => a + b, 0);
  const mean = GRID.reduce((sum, theta, i) => sum + theta * weights[i], 0) / total;
  const sd = Math.sqrt(GRID.reduce((sum, theta, i) => sum + (theta - mean) ** 2 * weights[i], 0) / total);
  const index = Math.min(CEFR_LEVELS.length - 1, Math.max(0, Math.floor(mean)));
  // The ends of the scale are open: everything below A2 is A1, everything above C1 is C2.
  const lo = index === 0 ? -Infinity : index;
  const hi = index === CEFR_LEVELS.length - 1 ? Infinity : index + 1;
  const inside = GRID.reduce((sum, theta, i) => sum + (theta >= lo && theta < hi ? weights[i] : 0), 0) / total;
  const confidence: PlacementConfidence = inside >= ADAPTIVE.stopMass ? "high" : inside >= 0.6 ? "medium" : "low";
  return { theta: Math.round(mean * 100) / 100, sd: Math.round(sd * 100) / 100, level: CEFR_LEVELS[index], probability: Math.round(inside * 100) / 100, confidence };
}

/** True once the test has asked enough and is sure enough, or has run out of questions. */
export function placementDone(responses: readonly AdaptiveResponse[]): boolean {
  if (responses.length >= ADAPTIVE.maxItems) return true;
  if (responses.length < ADAPTIVE.minItems) return false;
  return estimateAbility(responses).probability >= ADAPTIVE.stopMass;
}

/**
 * The next item: at the level closest to the current estimate, of a type not
 * used in the last two answers where possible, never one already asked in
 * this test, and one the learner has not seen in an earlier test while any
 * such item is left. `random` returns [0, 1) (Math.random in the apps, a
 * seeded source in tests).
 */
export function nextPlacementItem(
  bank: readonly BankItem[],
  responses: readonly AdaptiveResponse[],
  seenBefore: ReadonlySet<string>,
  random: () => number,
): BankItem | null {
  const asked = new Set(responses.map((r) => r.id));
  const left = bank.filter((item) => !asked.has(item.id));
  if (left.length === 0) return null;
  const theta = estimateAbility(responses).theta;
  const target = Math.min(CEFR_LEVELS.length - 1, Math.max(0, Math.round(theta)));
  const recent = new Set(responses.slice(-2).map((r) => r.type));
  // Nearest level that still has items; ties go to the harder level.
  const levels = [...new Set(left.map((item) => CEFR_LEVELS.indexOf(item.level)))].sort(
    (a, b) => Math.abs(a - target) - Math.abs(b - target) || b - a,
  );
  const atLevel = left.filter((item) => CEFR_LEVELS.indexOf(item.level) === levels[0]);
  const fresh = atLevel.filter((item) => !seenBefore.has(item.id));
  const pool = fresh.length > 0 ? fresh : atLevel;
  const varied = pool.filter((item) => !recent.has(item.type));
  const choices = varied.length > 0 ? varied : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

export interface AdaptiveResult extends PlacementEstimate {
  theta: number;
  probability: number;
  /** Share of answers fully right, 0 to 100. */
  score: number;
  asked: number;
  /** Per-skill levels where the test asked enough of that skill (four items or more). */
  skills: Partial<Record<"grammar" | "vocabulary", CefrLevel>>;
}

const SKILL_MIN_ITEMS = 4;

/** The finished test: the level, how sure, the per-skill levels and the score. */
export function adaptiveResult(responses: readonly AdaptiveResponse[]): AdaptiveResult {
  const overall = estimateAbility(responses);
  const skills: AdaptiveResult["skills"] = {};
  for (const skill of ["grammar", "vocabulary"] as const) {
    const own = responses.filter((r) => PLACEMENT_TYPE_SKILL[r.type] === skill);
    if (own.length >= SKILL_MIN_ITEMS) skills[skill] = estimateAbility(own).level;
  }
  const right = responses.filter((r) => r.score >= 1).length;
  const byLevel = CEFR_LEVELS.map((level) => {
    const own = responses.filter((r) => r.level === level);
    return { level, asked: own.length, right: own.filter((r) => r.score >= 1).length };
  }).filter((x) => x.asked > 0);
  const strengths = byLevel.filter((x) => x.right / x.asked >= 0.75 && compareCefr(x.level, overall.level) >= 0).map((x) => x.level);
  const focus = byLevel.filter((x) => x.right / x.asked < 0.5 && compareCefr(x.level, overall.level) <= 0).map((x) => x.level);
  return {
    level: overall.level,
    confidence: overall.confidence,
    strengths,
    focus,
    spokenUsed: false,
    theta: overall.theta,
    probability: overall.probability,
    score: responses.length ? Math.round((right / responses.length) * 100) : 0,
    asked: responses.length,
    skills,
  };
}

// ---------------------------------------------------------------------------
// Items seen in earlier tests
// ---------------------------------------------------------------------------
//
// Kept as one compact string so it fits on the device and on the account:
// per "<level>.<type>" group, a bitset of item numbers in base64url, e.g.
// "c1.error:BwA;b2.gap:gA". Ids are permanent, so the encoding is stable as
// the bank grows.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
/** Longest encoded value accepted from storage or a request. */
export const SEEN_MAX_LENGTH = 4000;

function bitsToB64(bits: boolean[]): string {
  let out = "";
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j += 1) if (bits[i + j]) v |= 1 << j;
    out += B64[v];
  }
  return out.replace(/A+$/, "");
}

function b64ToBits(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const v = B64.indexOf(text[i]);
    if (v < 0) return [];
    for (let j = 0; j < 6; j += 1) if (v & (1 << j)) out.push(i * 6 + j);
  }
  return out;
}

const SEEN_ID_RE = /^ex\.placement\.([a-z0-9]+)\.([a-z]+)\.(\d+)$/;

/** The seen item ids as the compact string. */
export function encodeSeen(ids: Iterable<string>): string {
  const groups = new Map<string, boolean[]>();
  for (const id of ids) {
    const match = SEEN_ID_RE.exec(id);
    if (!match) continue;
    const n = Number(match[3]);
    if (!(n >= 1 && n <= 999)) continue;
    const key = `${match[1]}.${match[2]}`;
    const bits = groups.get(key) ?? [];
    bits[n - 1] = true;
    groups.set(key, bits);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bits]) => `${key}:${bitsToB64(Array.from({ length: bits.length }, (_, i) => bits[i] === true))}`)
    .join(";");
}

/** The compact string back to ids; anything malformed is skipped. */
export function decodeSeen(code: unknown): string[] {
  if (typeof code !== "string" || code.length > SEEN_MAX_LENGTH) return [];
  const out: string[] = [];
  for (const part of code.split(";")) {
    const match = /^([a-z0-9]+)\.([a-z]+):([A-Za-z0-9_-]*)$/.exec(part);
    if (!match) continue;
    for (const bit of b64ToBits(match[3])) out.push(`ex.placement.${match[1]}.${match[2]}.${String(bit + 1).padStart(2, "0")}`);
  }
  return out;
}

/** Both copies of the seen set together (the device and the account). */
export function mergeSeen(a: unknown, b: unknown): string {
  return encodeSeen(new Set([...decodeSeen(a), ...decodeSeen(b)]));
}
