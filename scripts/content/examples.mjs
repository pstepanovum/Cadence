#!/usr/bin/env node
// Attaches real Tatoeba sentences (CC BY 2.0 FR) as extra examples to grammar
// points. Each generated grammar point carries a few search patterns; this
// finds matching native-speaker sentences at or just below the point's level,
// and Gemini keeps only the ones that clearly show the point (at most two).
//
//   node scripts/content/examples.mjs        (after generate.mjs and vocab.mjs)
//
// Writes `tatoebaExamples` into content/grammar/<level>/<slug>.json.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUTLINE } from "./data/grammar-outline.mjs";
import { CHECK_MODEL, generateJson, geminiStats } from "./lib/gemini.mjs";
import { estimateLevel, loadLexicon } from "./lib/lexicon.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { FREQ_FILE, cleanSentences, ensureExport } from "./lib/tatoeba.mjs";
import { LEVELS, isSensitive, levelIndex, sha256Hex, textKey, wordsOf } from "./lib/text.mjs";
import { loadGrammar } from "./lib/assemble.mjs";

const CANDIDATES = 8;
const KEEP = 2;

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: { type: "object", properties: { n: { type: "integer" }, keep: { type: "array", items: { type: "integer" } } }, required: ["n", "keep"] },
    },
  },
  required: ["items"],
};
const SYSTEM = `You choose example sentences for grammar lessons for learners of English.
For each grammar point you get candidate sentences. Keep at most ${KEEP} (by index) that clearly and correctly use that grammar point, sound natural, and make sense on their own.
Reject sentences that only look similar, that use a different structure, that need context, or that mention violence, politics, religion, alcohol, drugs or anything unpleasant.
Return an empty list when none is good.`;

await ensureExport();
const ranks = new Map(JSON.parse(readFileSync(FREQ_FILE, "utf8")).map((e, i) => [e.form, i]));
const lexicon = loadLexicon();
const pool = cleanSentences().filter((s) => {
  const n = wordsOf(s.text).length;
  return n >= 4 && n <= 14 && !isSensitive(s.text);
});
console.log(`${pool.length} candidate sentences`);

const used = new Set();
const work = [];
for (const level of LEVELS) {
  if (!OUTLINE[level]) continue;
  for (const file of loadGrammar(level)) {
    const generated = new Set(file.grammarPoint.examples.map((e) => textKey(e.text)));
    const regexes = (file.tatoebaPatterns ?? [])
      .map((src) => {
        try {
          return new RegExp(src, "i");
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const matches = [];
    if (regexes.length) {
      for (const s of pool) {
        if (!regexes.some((r) => r.test(s.text))) continue;
        if (generated.has(textKey(s.text))) continue;
        const est = levelIndex(estimateLevel(s.text, lexicon, ranks));
        if (est > levelIndex(level) || est < levelIndex(level) - 2) continue;
        matches.push(s);
        if (matches.length >= 400) break;
      }
    }
    const candidates = matches
      .sort((a, b) => (sha256Hex(`ex:${file.slug}:${a.id}`) < sha256Hex(`ex:${file.slug}:${b.id}`) ? -1 : 1))
      .filter((s) => !used.has(s.id))
      .slice(0, CANDIDATES);
    work.push({ level, file, candidates });
  }
}

for (let i = 0; i < work.length; i += 12) {
  const batch = work.slice(i, i + 12).filter((w) => w.candidates.length);
  if (batch.length) {
    const prompt = JSON.stringify(
      batch.map((w, n) => ({
        n: n + 1,
        level: w.level,
        grammarPoint: `${w.file.grammarPoint.title}: ${w.file.grammarPoint.summary}`,
        candidates: w.candidates.map((s, j) => `[${j}] ${s.text}`),
      })),
      null,
      1,
    );
    const result = await generateJson({ model: CHECK_MODEL, system: SYSTEM, prompt, schema: SCHEMA });
    const byN = new Map(result.items.map((it) => [it.n, it.keep]));
    batch.forEach((w, n) => {
      const keep = [...new Set(byN.get(n + 1) ?? [])].filter((j) => Number.isInteger(j) && w.candidates[j]).slice(0, KEEP);
      w.chosen = keep.map((j) => w.candidates[j]).filter((s) => !used.has(s.id));
      w.chosen.forEach((s) => used.add(s.id));
    });
  }
  process.stdout.write(`\r${Math.min(i + 12, work.length)}/${work.length}`);
}
console.log("");

let attached = 0;
for (const w of work) {
  const path = join(CONTENT_DIR, "grammar", w.level.toLowerCase(), `${w.file.slug}.json`);
  const file = JSON.parse(readFileSync(path, "utf8"));
  file.tatoebaExamples = (w.chosen ?? []).map((s) => ({ sentenceId: s.id, text: s.text, author: s.author }));
  attached += file.tatoebaExamples.length;
  writeFileSync(path, `${JSON.stringify(file, null, 1)}\n`);
}
console.log(`${attached} Tatoeba examples attached; Gemini ${JSON.stringify(geminiStats())}`);
