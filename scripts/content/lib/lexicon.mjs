// The vocabulary as a lookup: word form -> CEFR level, built from
// content/vocab/*.json (each card lists the forms it covers).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./paths.mjs";
import { LEVELS, levelIndex } from "./text.mjs";

export function loadLexicon() {
  const map = new Map();
  for (const level of LEVELS) {
    const file = join(CONTENT_DIR, "vocab", `${level.toLowerCase()}.json`);
    if (!existsSync(file)) continue;
    for (const card of JSON.parse(readFileSync(file, "utf8")).cards) {
      for (const form of [card.word, ...(card.forms ?? [])]) {
        const key = form.toLowerCase();
        const prev = map.get(key);
        if (!prev || levelIndex(level) < levelIndex(prev)) map.set(key, level);
      }
    }
  }
  return map;
}

export const levelForWord = (lexicon, word) => lexicon.get(word);

/** Frequency rank to a level, for words the vocabulary does not list. */
function levelForRank(rank) {
  if (rank < 800) return "A1";
  if (rank < 2000) return "A2";
  if (rank < 4000) return "B1";
  if (rank < 7500) return "B2";
  if (rank < 13000) return "C1";
  return "C2";
}

/**
 * A sentence's level estimate: its hardest word (names, capitalised inside the
 * sentence, are skipped), and longer sentences are at least B1 or B2.
 */
export function estimateLevel(text, lexicon, ranks) {
  const tokens = String(text).match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
  const words = tokens.filter((t, i) => i === 0 || t === "I" || !/^[A-Z]/.test(t)).map((t) => t.toLowerCase());
  const levels = words.map((w) => levelIndex(lexicon.get(w) ?? (ranks.has(w) ? levelForRank(ranks.get(w)) : "C2")));
  let index = Math.max(0, ...levels);
  if (tokens.length > 12) index = Math.max(index, 2);
  if (tokens.length > 16) index = Math.max(index, 3);
  return LEVELS[index];
}
