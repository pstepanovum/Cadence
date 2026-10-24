#!/usr/bin/env node
// Vocabulary flashcards, chosen from word frequency in the Tatoeba sentences
// (never from a published word list) and written with Gemini in our own words.
//
//   node scripts/content/tatoeba.mjs freq     (first)
//   node scripts/content/vocab.mjs            -> content/vocab/<level>.json
//
// Pass 1 sorts the most frequent word forms into dictionary words with a part
// of speech and a CEFR estimate, dropping names, inflections and junk. Pass 2
// writes a short definition per chosen word and picks a Tatoeba sentence that
// shows that meaning (or writes one when none fits). Responses are cached.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { LEVELS, isSensitive, profanityIn, slugify, wordsOf } from "./lib/text.mjs";
import { FREQ_FILE, cleanSentences } from "./lib/tatoeba.mjs";

const CANDIDATE_FORMS = 30000;
const QUOTA = { A1: 350, A2: 650, B1: 760, B2: 760, C1: 560, C2: 320 };
const POS = ["noun", "verb", "adjective", "adverb", "preposition", "conjunction", "pronoun", "determiner", "phrasal verb", "interjection", "number"];

const CLASSIFY_SYSTEM = `You are a lexicographer preparing vocabulary for adult learners of English.
You receive English word forms found in example sentences, most frequent first.
For each form return its dictionary headword and decide whether it belongs on a learner's flashcard.
Rules:
- keep=false for personal names, place names, brand names, abbreviations, interjections that are just sounds, non-English words, typos, and any offensive or sexual word.
- keep=false when the form is an inflection (plural, past tense, -ing, comparative) of another headword; give that headword as lemma.
- keep=true only for the headword itself (lemma equal to the form).
- level: your estimate of the CEFR level (A1, A2, B1, B2, C1, C2) at which a learner usually meets this word, judged from how common and how abstract it is.
- pos: the word's most common part of speech.
Return one object per input form, in the same order.`;

const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          form: { type: "string" },
          lemma: { type: "string" },
          keep: { type: "boolean" },
          pos: { type: "string", enum: POS },
          level: { type: "string", enum: LEVELS },
        },
        required: ["form", "lemma", "keep", "pos", "level"],
      },
    },
  },
  required: ["items"],
};

const CARD_SYSTEM = `You write flashcards for adult learners of English, in plain, friendly English.
For each word:
- definition: what the word means in its most common sense, at most 90 characters, written for a learner at the given CEFR level. Do not use the word itself or a form of it in the definition. No dictionary abbreviations.
- example: choose the candidate sentence (by its index) that shows that meaning most clearly and naturally. Use -1 when no candidate fits, and then write a new natural example sentence of 5 to 14 words that uses the word in that meaning.
- Never write anything offensive, political, religious, sexual or violent, and avoid alcohol, drugs, crime and illness in examples.
Return one object per input word, in the same order.`;

const CARD_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          definition: { type: "string" },
          candidate: { type: "integer" },
          example: { type: "string" },
        },
        required: ["word", "definition", "candidate"],
      },
    },
  },
  required: ["items"],
};

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

const freq = JSON.parse(readFileSync(FREQ_FILE, "utf8"));
const candidates = freq
  .filter((entry) => /^[a-z]{2,}$/.test(entry.form) && entry.capitalised < 0.4 && entry.count >= 3)
  .slice(0, CANDIDATE_FORMS);
const countOf = new Map(freq.map((entry) => [entry.form, entry.count]));

// Pass 1: classify.
const batches = chunk(candidates.map((c) => c.form), 200);
const classified = (
  await pool(batches, 6, async (forms, i) => {
    const result = await generateJson({
      system: CLASSIFY_SYSTEM,
      prompt: `Word forms:\n${forms.join("\n")}`,
      schema: CLASSIFY_SCHEMA,
    });
    process.stdout.write(`\rclassify ${i + 1}/${batches.length}`);
    return result.items;
  })
).flat();
console.log("");

// Group forms under their headwords; a headword is kept only when the model
// kept it as a form of its own.
const headwords = new Map();
for (const item of classified) {
  const lemma = String(item.lemma || "").toLowerCase().trim();
  if (!/^[a-z]+(?:[ -][a-z]+)?$/.test(lemma)) continue;
  const entry = headwords.get(lemma) ?? { word: lemma, forms: new Set(), keep: false, pos: null, level: null, count: 0 };
  entry.forms.add(item.form);
  entry.count += countOf.get(item.form) ?? 0;
  if (item.form === lemma) {
    entry.keep = item.keep;
    entry.pos = item.pos;
    entry.level = item.level;
  }
  headwords.set(lemma, entry);
}
/** Words we leave out of the deck although they are ordinary English. */
const SKIP_WORDS = new Set(["abortion", "autopsy", "burlesque", "overdose", "suicide", "porn", "slave", "rapist", "stoep"]);
const kept = [...headwords.values()].filter(
  (h) => h.keep && h.level && h.pos !== "interjection" && h.pos !== "number" && profanityIn(h.word).length === 0 && !SKIP_WORDS.has(h.word),
);

// Fill each level's quota with its most frequent words.
const chosen = [];
const chosenByLevel = {};
for (const level of LEVELS) {
  const atLevel = kept.filter((h) => h.level === level).sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  chosenByLevel[level] = atLevel.slice(0, QUOTA[level]);
  chosen.push(...chosenByLevel[level]);
  console.log(`${level}: ${Math.min(atLevel.length, QUOTA[level])} of ${atLevel.length} kept headwords`);
}

// Candidate example sentences from Tatoeba: 5-14 words, containing one of the word's forms.
const wanted = new Map();
for (const h of chosen) for (const form of h.forms) wanted.set(form, h.word);
const examples = new Map();
for (const s of cleanSentences()) {
  const words = wordsOf(s.text);
  if (words.length < 5 || words.length > 14 || isSensitive(s.text)) continue;
  for (const w of new Set(words)) {
    const lemma = wanted.get(w);
    if (!lemma) continue;
    const list = examples.get(lemma) ?? [];
    if (list.length < 40) list.push(s);
    examples.set(lemma, list);
  }
}
// Five per word, preferring short sentences, in a stable order.
for (const [lemma, list] of examples) {
  list.sort((a, b) => a.text.length - b.text.length || a.id - b.id);
  examples.set(lemma, list.filter((s, i) => i % Math.max(1, Math.floor(list.length / 5)) === 0).slice(0, 5));
}

// Pass 2: definitions and examples.
// Batched per level, so a change in one level's list leaves the others cached.
const cardBatches = LEVELS.flatMap((level) => chunk(chosenByLevel[level], 40));
const written = (
  await pool(cardBatches, 6, async (batch, i) => {
    const prompt = batch
      .map((h) => {
        const cands = (examples.get(h.word) ?? []).map((s, j) => `  [${j}] ${s.text}`).join("\n");
        return `word: ${h.word} (${h.pos}, ${h.level})\ncandidates:\n${cands || "  (none)"}`;
      })
      .join("\n\n");
    const result = await generateJson({ system: CARD_SYSTEM, prompt, schema: CARD_SCHEMA });
    process.stdout.write(`\rcards ${i + 1}/${cardBatches.length}`);
    return batch.map((h, j) => ({ h, out: result.items[j] }));
  })
).flat();
console.log("");

const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
let dropped = 0;
for (const { h, out } of written) {
  if (!out || out.word?.toLowerCase() !== h.word) {
    dropped += 1;
    continue;
  }
  const definition = String(out.definition ?? "").trim();
  const cands = examples.get(h.word) ?? [];
  let example = null;
  if (Number.isInteger(out.candidate) && out.candidate >= 0 && out.candidate < cands.length) {
    const s = cands[out.candidate];
    example = { text: s.text, source: { kind: "tatoeba", sentenceId: s.id, author: s.author } };
  } else if (out.example && out.example.trim()) {
    example = { text: out.example.trim(), source: { kind: "generated" } };
  }
  const definitionMentionsWord = wordsOf(definition).some((w) => h.forms.has(w) || w === h.word);
  if (!definition || definition.length > 120 || definitionMentionsWord || !example || profanityIn(definition + " " + example.text).length) {
    dropped += 1;
    continue;
  }
  byLevel[h.level].push({
    id: `ex.vocab.${slugify(h.word)}`,
    word: h.word,
    pos: h.pos,
    forms: [...h.forms].filter((f) => f !== h.word).sort(),
    definition,
    example,
  });
}

mkdirSync(join(CONTENT_DIR, "vocab"), { recursive: true });
const seenIds = new Set();
for (const level of LEVELS) {
  const cards = byLevel[level]
    .filter((c) => !seenIds.has(c.id) && seenIds.add(c.id))
    .sort((a, b) => a.word.localeCompare(b.word));
  writeFileSync(
    join(CONTENT_DIR, "vocab", `${level.toLowerCase()}.json`),
    `${JSON.stringify({ format: 1, level, source: "Tatoeba word frequency; definitions generated", cards }, null, 1)}\n`,
  );
  console.log(`${level}: ${cards.length} cards`);
}
console.log(`dropped ${dropped}; Gemini ${JSON.stringify(geminiStats())}`);
