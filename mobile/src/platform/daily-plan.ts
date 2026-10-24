// FILE: mobile/src/platform/daily-plan.ts
//
// Today's plan (docs/PLATFORM.md section 7): 10 to 15 minutes picked from
// what is due and what is weak. Due flashcards first (at most 5 minutes),
// then one or two weak sounds, one weak grammar point, then shadowing or a
// coach scenario when AI is available, topped up with a lesson at the
// learner's level. The same function runs on the device with local data
// (free) and with synced data (Plus). Pure and deterministic: the same input
// in any order gives the same plan.
//
// Twin: src/lib/platform/daily-plan.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import type { CefrLevel } from "./content-model.ts";

/** What the planner knows about the learner today. */
export interface PlanInput {
  /** Local calendar day, YYYY-MM-DD. */
  today: string;
  /** Cards due today or earlier. */
  dueCards: readonly { cardId: string; due: string }[];
  /** Sound mastery: a moving average of phoneme scores, 0 to 100. */
  sounds: readonly { soundId: string; ema: number; attempts: number }[];
  /** How common each sound is in English, 0 to 1; unknown sounds count 0.5. */
  soundFrequency?: Readonly<Record<string, number>>;
  /** Grammar accuracy, 0 to 100, from exercises answered. */
  grammar: readonly { grammarPointId: string; accuracy: number; attempts: number }[];
  level: CefrLevel | null;
  /** A paired Cadence or cloud AI is available for shadowing or the coach. */
  aiAvailable: boolean;
}

export type PlanItem =
  | { kind: "flashcards"; cardIds: string[]; minutes: number }
  | { kind: "sound"; soundId: string; minutes: number }
  | { kind: "grammar"; grammarPointId: string; minutes: number }
  | { kind: "shadowing"; soundId: string | null; minutes: number }
  | { kind: "coach"; minutes: number }
  | { kind: "lesson"; level: CefrLevel; minutes: number };

export interface DailyPlan {
  day: string;
  items: PlanItem[];
  minutes: number;
}

export const PLAN_MIN_MINUTES = 10;
export const PLAN_MAX_MINUTES = 15;

const CARD_SECONDS = 20;
const CARDS_MAX_MINUTES = 5;
const SOUND_MINUTES = 3;
const GRAMMAR_MINUTES = 3;
const SHADOWING_MINUTES = 3;
const COACH_MINUTES = 4;
/** Below this a sound or grammar point counts as weak. */
const WEAK_BELOW = 80;

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Worst first: low score on a common sound matters most. Ties by id. */
export function weakSounds(input: Pick<PlanInput, "sounds" | "soundFrequency">) {
  return input.sounds
    .filter((s) => s.attempts > 0 && s.ema < WEAK_BELOW)
    .map((s) => ({ soundId: s.soundId, weight: (100 - s.ema) * (input.soundFrequency?.[s.soundId] ?? 0.5) }))
    .sort((a, b) => b.weight - a.weight || byText(a.soundId, b.soundId));
}

export function weakGrammar(input: Pick<PlanInput, "grammar">) {
  return input.grammar
    .filter((g) => g.attempts > 0 && g.accuracy < WEAK_BELOW)
    .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts || byText(a.grammarPointId, b.grammarPointId));
}

export function buildDailyPlan(input: PlanInput): DailyPlan {
  const items: PlanItem[] = [];
  const total = () => items.reduce((sum, item) => sum + item.minutes, 0);

  // Due cards, most overdue first, at most five minutes of them.
  const cards = input.dueCards
    .filter((card) => card.due <= input.today)
    .sort((a, b) => byText(a.due, b.due) || byText(a.cardId, b.cardId))
    .slice(0, Math.floor((CARDS_MAX_MINUTES * 60) / CARD_SECONDS));
  if (cards.length) items.push({ kind: "flashcards", cardIds: cards.map((c) => c.cardId), minutes: Math.max(1, Math.ceil((cards.length * CARD_SECONDS) / 60)) });

  // One or two sounds: the second only while it leaves room for grammar.
  const sounds = weakSounds(input);
  for (const sound of sounds.slice(0, 2)) {
    if (items.some((item) => item.kind === "sound") && total() + SOUND_MINUTES + GRAMMAR_MINUTES > PLAN_MAX_MINUTES - SHADOWING_MINUTES) break;
    items.push({ kind: "sound", soundId: sound.soundId, minutes: SOUND_MINUTES });
  }

  const grammar = weakGrammar(input)[0];
  if (grammar) items.push({ kind: "grammar", grammarPointId: grammar.grammarPointId, minutes: GRAMMAR_MINUTES });

  if (input.aiAvailable) {
    const ai: PlanItem = sounds.length ? { kind: "shadowing", soundId: sounds[0].soundId, minutes: SHADOWING_MINUTES } : { kind: "coach", minutes: COACH_MINUTES };
    if (total() + ai.minutes <= PLAN_MAX_MINUTES) items.push(ai);
  }

  // Short of ten minutes: new material at the learner's level fills the rest.
  if (total() < PLAN_MIN_MINUTES) {
    items.push({ kind: "lesson", level: input.level ?? "A2", minutes: Math.min(PLAN_MAX_MINUTES - total(), Math.max(PLAN_MIN_MINUTES - total(), 4)) });
  }

  return { day: input.today, items, minutes: total() };
}
