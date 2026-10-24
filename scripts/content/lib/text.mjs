// Small text helpers for the content pipeline: word splitting, slugs, the
// profanity check and the CEFR helpers. Our own list, kept short on purpose:
// it blocks the obvious words, and the generators are told to avoid the rest.

import { createHash } from "node:crypto";

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const levelIndex = (level) => LEVELS.indexOf(level);

export function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

/** Lowercase word tokens, apostrophes kept inside words ("don't"). */
export function wordsOf(text) {
  return (
    String(text)
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[a-z]+(?:'[a-z]+)*/g) ?? []
  );
}

const PROFANITY = [
  "fuck", "fucking", "fucked", "fucker", "motherfucker", "shit", "shitty", "bullshit", "bitch", "bitches",
  "bastard", "asshole", "arsehole", "dick", "dickhead", "cock", "cunt", "pussy", "twat", "wanker", "bollocks",
  "slut", "whore", "fag", "faggot", "nigger", "nigga", "retard", "retarded", "spic", "chink", "kike", "tranny",
  "dyke", "porn", "porno", "rape", "raped", "rapist", "cum", "horny", "blowjob", "dildo", "boobs", "tits",
  "piss", "pissed", "damn", "goddamn", "crap", "suicide", "nazi", "heroin", "cocaine", "masturbate",
];
const PROFANITY_SET = new Set(PROFANITY);

/** The offending words in a text, if any. */
export function profanityIn(text) {
  return wordsOf(text).filter((w) => PROFANITY_SET.has(w));
}

export function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

/** Stable key for "is this the same text?" across packs: case, spacing and final punctuation ignored. */
export function textKey(text) {
  return String(text)
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[.!?]+$/, "");
}

/**
 * Topics we keep out of example sentences (the words themselves may still be
 * taught, with a written example instead).
 */
const SENSITIVE = [
  "kill", "killed", "kills", "killing", "killer", "murder", "murdered", "murderer", "suicide", "overdose", "abortion",
  "gun", "guns", "shoot", "shot", "shooting", "bomb", "bombs", "terrorist", "terrorists", "war", "weapon", "weapons",
  "dead", "die", "died", "dies", "dying", "death", "corpse", "blood", "bleeding", "drunk", "beer", "wine", "whiskey",
  "vodka", "alcohol", "cigarette", "cigarettes", "smoke", "smoking", "drug", "drugs", "prison", "jail", "crime",
  "criminal", "steal", "stole", "stolen", "thief", "rob", "robbed", "police", "hate", "stupid", "idiot", "fat",
  "ugly", "god", "jesus", "church", "bible", "allah", "islam", "muslim", "christian", "jew", "jews", "jewish",
  "religion", "president", "trump", "obama", "hitler", "sex", "sexy", "naked", "kiss", "kissed", "girlfriend",
  "boyfriend", "divorce", "pregnant", "slave", "slaves", "racist", "beat", "hit", "hurt", "punch", "slap", "knife",
  "autopsy", "funeral", "cancer", "sick", "hospital",
];
const SENSITIVE_SET = new Set(SENSITIVE);

/** True when a sentence touches a topic we keep out of examples. */
export function isSensitive(text) {
  return wordsOf(text).some((w) => SENSITIVE_SET.has(w));
}
