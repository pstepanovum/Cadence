// FILE: src/lib/platform/placement.ts
//
// Placement scoring (docs/PLATFORM.md section 7): the written quiz gives a
// level from a staircase of questions tagged by CEFR level, and the spoken
// sample, once analysed, moves it by at most one level. Pure and
// deterministic, so the phone, the web and the server place a learner the
// same way; the questions themselves live with each app's quiz.
//
// Twin: mobile/src/platform/placement.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import { CEFR_LEVELS, compareCefr, type CefrLevel } from "./content-model.ts";

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
