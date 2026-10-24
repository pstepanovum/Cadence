// Letter-level helpers for the spelling and scramble games. Pure; tested in
// mobile/tests/text.test.ts.

import { shuffle, type Rng } from "./random.ts";

/** Lower-case, trimmed, single-spaced, letters/apostrophes/hyphens only. */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z' -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}

export interface SpellingCheck {
  correct: boolean;
  /** Edit distance between what was typed and the target. */
  distance: number;
  /** One letter off on a word long enough for that to be a slip. */
  close: boolean;
}

export function checkSpelling(answer: string, target: string): SpellingCheck {
  const typed = normalizeAnswer(answer);
  const expected = normalizeAnswer(target);
  const distance = levenshtein(typed, expected);
  return {
    correct: distance === 0 && typed.length > 0,
    distance,
    close: distance === 1 && expected.length >= 4,
  };
}

export type LetterStatus = "match" | "wrong" | "missing";

/**
 * Per-letter verdict over the *target*, so a wrong answer can be shown as the
 * right spelling with the slipped letters marked. Positional — good enough for
 * the "one letter off" cases the game cares about.
 */
export function letterDiff(answer: string, target: string): { letter: string; status: LetterStatus }[] {
  const typed = normalizeAnswer(answer);
  const expected = normalizeAnswer(target);
  return Array.from(expected).map((letter, index) => {
    const got = typed[index];
    if (got === undefined) return { letter, status: "missing" };
    return { letter, status: got === letter ? "match" : "wrong" };
  });
}

/**
 * "e _ _ a n d" with the first `revealed` letters shown. Spaces and hyphens
 * are always shown so the shape of a phrase is never a mystery.
 */
export function hintMask(target: string, revealed: number): string {
  let shown = 0;
  return Array.from(target)
    .map((char) => {
      if (char === " " || char === "-" || char === "'") return char;
      if (shown < revealed) {
        shown += 1;
        return char;
      }
      return "_";
    })
    .join(" ");
}

export function letterCount(target: string): number {
  return Array.from(target).filter((char) => /[a-z]/i.test(char)).length;
}

export interface ScrambleTile {
  /** Stable key for React; the index in the scrambled order. */
  id: number;
  letter: string;
}

/**
 * The letters of `word` in a different order. Never returns the word itself
 * for anything longer than one letter, so the puzzle is always a puzzle.
 */
export function scrambleWord(word: string, rng: Rng = Math.random): ScrambleTile[] {
  const letters = Array.from(word.toLowerCase());
  if (letters.length < 2) return letters.map((letter, id) => ({ id, letter }));

  let order = letters;
  for (let attempt = 0; attempt < 12; attempt++) {
    order = shuffle(letters, rng);
    if (order.join("") !== letters.join("")) break;
  }
  if (order.join("") === letters.join("")) order = letters.slice().reverse();

  return order.map((letter, id) => ({ id, letter }));
}

/** Words the scramble game can use: letters only, long enough to be a puzzle. */
export function isScrambleable(word: string): boolean {
  return /^[a-z]{4,12}$/i.test(word);
}
