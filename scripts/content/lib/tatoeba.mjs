// Tatoeba, read from the official export (CC BY 2.0 FR). Downloaded at build
// time into the gitignored cache; nothing from it is committed except the
// sentences we keep, each with its id and author for attribution.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE_DIR } from "./paths.mjs";
import { profanityIn, textKey, wordsOf } from "./text.mjs";

export const TATOEBA_DIR = join(CACHE_DIR, "tatoeba");
const SENTENCES_URL = "https://downloads.tatoeba.org/exports/per_language/eng/eng_sentences_detailed.tsv.bz2";
const USERS_URL = "https://downloads.tatoeba.org/exports/user_languages.tar.bz2";
export const TATOEBA_LICENSE = "CC BY 2.0 FR";

async function download(url, file) {
  if (existsSync(file)) return;
  mkdirSync(TATOEBA_DIR, { recursive: true });
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

export async function ensureExport() {
  await download(SENTENCES_URL, join(TATOEBA_DIR, "eng_sentences_detailed.tsv.bz2"));
  await download(USERS_URL, join(TATOEBA_DIR, "user_languages.tar.bz2"));
}

export const exportAvailable = () => existsSync(join(TATOEBA_DIR, "eng_sentences_detailed.tsv.bz2"));

/** Every English sentence: `Map<id, {id, text, author}>`. */
export function readSentences() {
  const raw = execFileSync("bzcat", [join(TATOEBA_DIR, "eng_sentences_detailed.tsv.bz2")], {
    maxBuffer: 1 << 30,
    encoding: "utf8",
  });
  const out = new Map();
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [id, lang, text, author] = line.split("\t");
    if (lang !== "eng") continue;
    out.set(Number(id), { id: Number(id), text, author: author === "\\N" ? null : author });
  }
  return out;
}

/** Usernames who list English as their native language (level 5). */
export function readNativeSpeakers() {
  const raw = execFileSync("tar", ["-xjOf", join(TATOEBA_DIR, "user_languages.tar.bz2"), "user_languages.csv"], {
    maxBuffer: 1 << 28,
    encoding: "utf8",
  });
  const out = new Set();
  for (const line of raw.split("\n")) {
    const [lang, skill, user] = line.split("\t");
    if (lang === "eng" && skill === "5" && user) out.add(user);
  }
  return out;
}

/**
 * A sentence worth showing a learner: written by a native speaker, 3 to 20
 * words, plain characters, a capital at the start and a full stop, question
 * or exclamation mark at the end, no profanity, no digits or brackets.
 */
export function isCleanSentence(sentence, natives) {
  const { text, author } = sentence;
  if (!author || !natives.has(author)) return false;
  if (text.length > 160) return false;
  if (!/^[A-Z"]/.test(text) || !/[.!?]"?$/.test(text)) return false;
  if (/[^A-Za-z ,.'’?!;:"-]/.test(text)) return false;
  if (/\s{2,}|--|\.\.|!!|\?\?/.test(text)) return false;
  if (/\b[A-Z]{2,}\b/.test(text.replace(/\bI\b/g, ""))) return false;
  const words = wordsOf(text);
  if (words.length < 3 || words.length > 20) return false;
  if (profanityIn(text).length > 0) return false;
  return true;
}

export const FREQ_FILE = join(TATOEBA_DIR, "word-freq.json");


/** Clean native sentences, one per distinct text. */
export function cleanSentences() {
  const natives = readNativeSpeakers();
  const all = readSentences();
  const seen = new Set();
  const out = [];
  for (const sentence of all.values()) {
    if (!isCleanSentence(sentence, natives)) continue;
    const key = textKey(sentence.text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sentence);
  }
  return out;
}

