// FILE: src/components/learn-hub/modes.ts
//
// The practice modes of the hub and which exercise kinds each one draws.
import type { ActivityKind } from "@/lib/platform/progress-model.ts";
import { CEFR_LEVELS, type CefrLevel, type ExerciseKind } from "@/lib/platform/content-model.ts";

export interface PracticeMode {
  id: "quiz" | "builder" | "sentences" | "matching" | "flashcards";
  title: string;
  blurb: string;
  kinds: ExerciseKind[];
  activity: ActivityKind;
  /** Exercises per round. */
  size: number;
}

export const PRACTICE_MODES: readonly PracticeMode[] = [
  { id: "quiz", title: "Quiz", blurb: "Quick questions on this level's grammar.", kinds: ["multiple_choice", "gap_fill"], activity: "quiz", size: 8 },
  { id: "builder", title: "Sentence builder", blurb: "Put the words in the right order.", kinds: ["sentence_building"], activity: "sentence_building", size: 6 },
  { id: "sentences", title: "Sentence practice", blurb: "Fix, rewrite and complete real sentences.", kinds: ["error_correction", "transformation", "gap_fill", "dictation"], activity: "lesson", size: 6 },
  { id: "matching", title: "Matching", blurb: "Pair up halves, forms and meanings.", kinds: ["matching"], activity: "matching", size: 4 },
  { id: "flashcards", title: "Flashcards", blurb: "Words come back just before you forget them.", kinds: ["flashcard"], activity: "flashcards", size: 20 },
];

export function modeById(id: string): PracticeMode | undefined {
  return PRACTICE_MODES.find((mode) => mode.id === id);
}

export function parseLevel(value: unknown): CefrLevel | null {
  return typeof value === "string" && (CEFR_LEVELS as readonly string[]).includes(value.toUpperCase())
    ? (value.toUpperCase() as CefrLevel)
    : null;
}
