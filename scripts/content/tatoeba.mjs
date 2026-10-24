#!/usr/bin/env node
// Tatoeba import (CC BY 2.0 FR). Two steps:
//
//   node scripts/content/tatoeba.mjs freq        word counts over clean native
//                                                sentences, for choosing vocabulary
//   node scripts/content/tatoeba.mjs sentences   the curated sentences per level,
//                                                written to content/sentences/
//
// The export is downloaded into scripts/content/.cache/tatoeba (gitignored).
// Each kept sentence keeps its Tatoeba id and author for attribution.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { LEVELS, isSensitive, sha256Hex, wordsOf } from "./lib/text.mjs";
import { FREQ_FILE, TATOEBA_LICENSE, cleanSentences, ensureExport } from "./lib/tatoeba.mjs";
import { estimateLevel, loadLexicon } from "./lib/lexicon.mjs";

/** Per level, how many sentences the packs carry. */
const SENTENCES_PER_LEVEL = { A1: 600, A2: 1200, B1: 1200, B2: 1200, C1: 1200, C2: 900 };

function freq() {
  const sentences = cleanSentences();
  const counts = new Map();
  const capitalised = new Map();
  for (const { text } of sentences) {
    const raw = text.match(/[A-Za-z]+(?:'[A-Za-z]+)*/g) ?? [];
    raw.forEach((token, i) => {
      const form = token.toLowerCase();
      counts.set(form, (counts.get(form) ?? 0) + 1);
      if (i > 0 && /^[A-Z]/.test(token) && token !== "I") capitalised.set(form, (capitalised.get(form) ?? 0) + 1);
    });
  }
  const list = [...counts.entries()]
    .map(([form, count]) => ({ form, count, capitalised: (capitalised.get(form) ?? 0) / count }))
    .sort((a, b) => b.count - a.count || a.form.localeCompare(b.form));
  writeFileSync(FREQ_FILE, JSON.stringify(list));
  console.log(`${sentences.length} clean native sentences, ${list.length} word forms -> ${FREQ_FILE}`);
}

function sentences() {
  if (!existsSync(FREQ_FILE)) throw new Error("Run the freq step first.");
  const ranks = new Map(JSON.parse(readFileSync(FREQ_FILE, "utf8")).map((entry, i) => [entry.form, i]));
  const lexicon = loadLexicon();
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
  for (const sentence of cleanSentences()) {
    if (isSensitive(sentence.text)) continue;
    byLevel[estimateLevel(sentence.text, lexicon, ranks)].push(sentence);
  }
  mkdirSync(join(CONTENT_DIR, "sentences"), { recursive: true });
  for (const level of LEVELS) {
    // A stable spread over the whole pool: order by a hash of the id, cap each
    // author's share so one prolific contributor does not set the voice, and
    // avoid many sentences that open the same way.
    const pool = byLevel[level]
      .map((s) => ({ ...s, order: sha256Hex(`cadence:${s.id}`) }))
      .sort((a, b) => (a.order < b.order ? -1 : 1));
    const want = SENTENCES_PER_LEVEL[level];
    const perAuthor = new Map();
    const openings = new Map();
    const kept = [];
    for (const s of pool) {
      if (kept.length >= want) break;
      const opening = wordsOf(s.text).slice(0, 3).join(" ");
      if ((openings.get(opening) ?? 0) >= 3) continue;
      if ((perAuthor.get(s.author) ?? 0) >= Math.ceil(want * 0.35)) continue;
      openings.set(opening, (openings.get(opening) ?? 0) + 1);
      perAuthor.set(s.author, (perAuthor.get(s.author) ?? 0) + 1);
      kept.push({ sentenceId: s.id, text: s.text, author: s.author, level });
    }
    kept.sort((a, b) => a.sentenceId - b.sentenceId);
    writeFileSync(
      join(CONTENT_DIR, "sentences", `${level.toLowerCase()}.json`),
      `${JSON.stringify({ format: 1, source: "tatoeba", license: TATOEBA_LICENSE, level, sentences: kept }, null, 1)}\n`,
    );
    console.log(`${level}: ${kept.length} of ${byLevel[level].length} candidates`);
  }
}

const step = process.argv[2];
await ensureExport();
if (step === "freq") freq();
else if (step === "sentences") sentences();
else {
  console.error("Usage: node scripts/content/tatoeba.mjs freq|sentences");
  process.exit(1);
}
