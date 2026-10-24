// Question builders and scoring for the round-based games. Pure; tested in
// mobile/tests/quiz.test.ts.

import type { PairGroup } from "@/data/minimal-pairs";
import type { VocabWord } from "@/data/vocabulary";
import { pickOne, sample, shuffle, type Rng } from "./random.ts";

// --- Scoring -----------------------------------------------------------------

export const BASE_POINTS = 10;
export const MAX_COMBO_BONUS = 10;

/** Points for a correct answer given how many were right in a row before it. */
export function pointsFor(streakBefore: number): number {
  return BASE_POINTS + Math.min(streakBefore, 5) * 2;
}

export function accuracy(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 100);
}

export interface RoundTally {
  correct: number;
  answered: number;
  score: number;
  streak: number;
  bestStreak: number;
}

export const EMPTY_TALLY: RoundTally = { correct: 0, answered: 0, score: 0, streak: 0, bestStreak: 0 };

export function tallyAnswer(tally: RoundTally, correct: boolean): RoundTally {
  if (!correct) {
    return { ...tally, answered: tally.answered + 1, streak: 0 };
  }
  const streak = tally.streak + 1;
  return {
    correct: tally.correct + 1,
    answered: tally.answered + 1,
    score: tally.score + pointsFor(tally.streak),
    streak,
    bestStreak: Math.max(tally.bestStreak, streak),
  };
}

/** Round headline, matching the tone of the lesson summaries. */
export function roundVerdict(percent: number): { title: string; passed: boolean } {
  if (percent >= 90) return { title: "Flawless!", passed: true };
  if (percent >= 70) return { title: "Great work!", passed: true };
  if (percent >= 50) return { title: "Getting there", passed: false };
  return { title: "Keep practising", passed: false };
}

// --- Meaning match -------------------------------------------------------------

export type MeaningDirection = "pick-word" | "pick-definition";

export interface MeaningQuestion {
  id: string;
  direction: MeaningDirection;
  answer: VocabWord;
  /** Four candidates including the answer, already shuffled. */
  options: VocabWord[];
}

/**
 * Distractors come from the same level and, where possible, the same part of
 * speech, so "pick the noun" is never a giveaway.
 */
export function distractorsFor(answer: VocabWord, pool: readonly VocabWord[], count: number, rng: Rng): VocabWord[] {
  const others = pool.filter((word) => word.id !== answer.id);
  const samePos = others.filter((word) => word.pos === answer.pos);
  const chosen = sample(samePos, count, rng);
  if (chosen.length < count) {
    const remaining = others.filter((word) => !chosen.includes(word));
    chosen.push(...sample(remaining, count - chosen.length, rng));
  }
  return chosen;
}

export function buildMeaningQuestions(
  pool: readonly VocabWord[],
  count: number,
  rng: Rng,
  options: { optionCount?: number } = {},
): MeaningQuestion[] {
  const optionCount = options.optionCount ?? 4;
  if (pool.length < 2) return [];
  const answers = sample(pool, Math.min(count, pool.length), rng);
  return answers.map((answer, index) => {
    const distractors = distractorsFor(answer, pool, Math.min(optionCount, pool.length) - 1, rng);
    return {
      id: `${answer.id}:${index}`,
      direction: index % 2 === 0 ? "pick-word" : "pick-definition",
      answer,
      options: shuffle([answer, ...distractors], rng),
    };
  });
}

// --- Sound match -----------------------------------------------------------------

export interface SoundRound {
  id: string;
  groupKey: string;
  groupLabel: string;
  pair: readonly [string, string];
  /** The word that will be played. */
  target: string;
}

export function buildSoundRounds(groups: readonly PairGroup[], count: number, rng: Rng): SoundRound[] {
  const all = groups.flatMap((group) =>
    group.pairs.map((pair) => ({ groupKey: group.key, groupLabel: group.label, pair })),
  );
  if (all.length === 0) return [];
  return sample(all, Math.min(count, all.length), rng).map((entry, index) => ({
    id: `${entry.groupKey}:${entry.pair[0]}:${index}`,
    groupKey: entry.groupKey,
    groupLabel: entry.groupLabel,
    pair: entry.pair,
    target: pickOne(entry.pair, rng),
  }));
}
