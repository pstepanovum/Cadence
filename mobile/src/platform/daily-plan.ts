// FILE: mobile/src/platform/daily-plan.ts
//
// Today's plan (docs/PLATFORM.md section 7): 10 to 15 minutes picked from
// what is due and what is weak. Due flashcards first (at most 5 minutes),
// then the plateau track's drills or re-test for a learner on it (section 18),
// phrases and slang due for review (at most 3 minutes), then one or two weak
// sounds, one weak grammar point, then shadowing or a
// coach scenario when AI is available, topped up with a lesson at the
// learner's level. The learner's goals (goals.ts) reorder it: grammar
// before sounds for grammar and exam goals, the coach before shadowing for
// conversation goals, a longer phrase review for sounding natural. The same function runs on the device with local data
// (free) and with synced data (Plus). Pure and deterministic: the same input
// in any order gives the same plan.
//
// Twin: src/lib/platform/daily-plan.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

import type { CefrLevel } from "./content-model.ts";
import { goalEmphasis, type LearningGoal } from "./goals.ts";
import { DEFAULT_LEVEL } from "./levels.ts";

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
  /** The learner's current level (levels.ts: their grammar level, else overall); null means not set, so B2. */
  level: CefrLevel | null;
  /** A paired Cadence or cloud AI is available for shadowing or the coach. */
  aiAvailable: boolean;
  /** The plateau track (fossilization.ts), when the learner is on it: drill steps left today and whether a re-test is due. */
  plateau?: { steps: number; retestDue: boolean } | null;
  /** Phrase-bank and slang items due for review, plus anything assigned to the practice list. */
  dueItems?: readonly { itemId: string; due: string }[];
  /** What the learner said they are working towards; none keeps the default order. */
  goals?: readonly LearningGoal[];
}

export type PlanItem =
  | { kind: "flashcards"; cardIds: string[]; minutes: number }
  | { kind: "sound"; soundId: string; minutes: number }
  | { kind: "grammar"; grammarPointId: string; minutes: number }
  | { kind: "shadowing"; soundId: string | null; minutes: number }
  | { kind: "coach"; minutes: number }
  | { kind: "lesson"; level: CefrLevel; minutes: number }
  | { kind: "plateau"; retest: boolean; minutes: number }
  | { kind: "phrases"; itemIds: string[]; minutes: number };

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
const PLATEAU_MINUTES = 4;
const RETEST_MINUTES = 5;
const ITEM_SECONDS = 30;
const ITEMS_MAX_MINUTES = 3;
/** The phrase review's ceiling for a learner who wants to sound natural. */
const ITEMS_MAX_MINUTES_PHRASES = 5;
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
  const emphasis = goalEmphasis(input.goals ?? []);
  const itemsMax = emphasis.phrases ? ITEMS_MAX_MINUTES_PHRASES : ITEMS_MAX_MINUTES;

  // Due cards, most overdue first, at most five minutes of them.
  const cards = input.dueCards
    .filter((card) => card.due <= input.today)
    .sort((a, b) => byText(a.due, b.due) || byText(a.cardId, b.cardId))
    .slice(0, Math.floor((CARDS_MAX_MINUTES * 60) / CARD_SECONDS));
  if (cards.length) items.push({ kind: "flashcards", cardIds: cards.map((c) => c.cardId), minutes: Math.max(1, Math.ceil((cards.length * CARD_SECONDS) / 60)) });

  // The plateau track comes next for a learner on it: a re-test on its day, else today's drills.
  if (input.plateau && (input.plateau.retestDue || input.plateau.steps > 0)) {
    items.push({ kind: "plateau", retest: input.plateau.retestDue, minutes: input.plateau.retestDue ? RETEST_MINUTES : PLATEAU_MINUTES });
  }

  // Phrases and slang due for review, most overdue first, at most three minutes (five to sound natural).
  const due = (input.dueItems ?? [])
    .filter((item) => item.due <= input.today)
    .sort((a, b) => byText(a.due, b.due) || byText(a.itemId, b.itemId))
    .slice(0, Math.floor((itemsMax * 60) / ITEM_SECONDS));
  if (due.length && total() + 1 <= PLAN_MAX_MINUTES) {
    const minutes = Math.min(PLAN_MAX_MINUTES - total(), Math.max(1, Math.ceil((due.length * ITEM_SECONDS) / 60)));
    items.push({ kind: "phrases", itemIds: due.slice(0, Math.floor((minutes * 60) / ITEM_SECONDS)).map((item) => item.itemId), minutes });
  }

  // Grammar and exam goals (without a sound goal) take the grammar point before the sounds.
  const grammar = weakGrammar(input)[0];
  const grammarFirst = emphasis.grammar && !emphasis.sounds;
  const addGrammar = () => {
    if (grammar && total() + GRAMMAR_MINUTES <= PLAN_MAX_MINUTES) items.push({ kind: "grammar", grammarPointId: grammar.grammarPointId, minutes: GRAMMAR_MINUTES });
  };
  if (grammarFirst) addGrammar();

  // One or two sounds: the second only while it leaves room for grammar.
  const sounds = weakSounds(input);
  for (const sound of sounds.slice(0, 2)) {
    if (items.some((item) => item.kind === "sound") && total() + SOUND_MINUTES + GRAMMAR_MINUTES > PLAN_MAX_MINUTES - SHADOWING_MINUTES) break;
    if (total() + SOUND_MINUTES > PLAN_MAX_MINUTES) break;
    items.push({ kind: "sound", soundId: sound.soundId, minutes: SOUND_MINUTES });
  }

  if (!grammarFirst) addGrammar();

  // Conversation goals (without a sound goal) talk with the coach rather than shadow.
  if (input.aiAvailable) {
    const shadow = sounds.length > 0 && !(emphasis.conversation && !emphasis.sounds);
    const ai: PlanItem = shadow ? { kind: "shadowing", soundId: sounds[0].soundId, minutes: SHADOWING_MINUTES } : { kind: "coach", minutes: COACH_MINUTES };
    if (total() + ai.minutes <= PLAN_MAX_MINUTES) items.push(ai);
  }

  // Short of ten minutes: new material at the learner's level fills the rest.
  if (total() < PLAN_MIN_MINUTES) {
    items.push({ kind: "lesson", level: input.level ?? DEFAULT_LEVEL, minutes: Math.min(PLAN_MAX_MINUTES - total(), Math.max(PLAN_MIN_MINUTES - total(), 4)) });
  }

  return { day: input.today, items, minutes: total() };
}
