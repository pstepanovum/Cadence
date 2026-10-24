#!/usr/bin/env node
// Grammar points, lessons and exercises per level, drafted with Gemini from the
// fixed outline in data/grammar-outline.mjs, in our own words.
//
//   node scripts/content/generate.mjs [--level B1] [--only gp-slug]
//
// Writes content/grammar/<level>/<slug>.json, one file per grammar point,
// including the blind check (check.mjs) results once that has run. Responses
// are cached by prompt, so a rerun only calls the API for what changed.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { OUTLINE, TOPICS } from "./data/grammar-outline.mjs";
import { generateJson, geminiStats, pool } from "./lib/gemini.mjs";
import { CONTENT_DIR } from "./lib/paths.mjs";
import { GRAMMAR_SCHEMA, GRAMMAR_SYSTEM, grammarPrompt, toContent } from "./lib/grammar-gen.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const onlyLevel = flag("--level");
const onlySlug = flag("--only");

const topicTitle = new Map(TOPICS.map((t) => [t.id, t.title]));
const jobs = [];
for (const [level, list] of Object.entries(OUTLINE)) {
  if (onlyLevel && onlyLevel !== level) continue;
  for (const [slug, topic, title, brief] of list) {
    if (onlySlug && onlySlug !== slug) continue;
    const siblings = list.filter((other) => other[1] === topic && other[0] !== slug).map((other) => other[2]);
    jobs.push({ level, slug, topicId: `topic.${topic}`, title, brief, siblings, topicTitle: topicTitle.get(`topic.${topic}`) });
  }
}

const results = await pool(jobs, 6, async (job, i) => {
  const dir = join(CONTENT_DIR, "grammar", job.level.toLowerCase());
  const file = join(dir, `${job.slug}.json`);
  const prompt = grammarPrompt(job);
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  const draft = await generateJson({ system: GRAMMAR_SYSTEM, prompt, schema: GRAMMAR_SCHEMA });
  const content = toContent(job, draft);
  // Keep the blind-check verdicts when the draft did not change.
  const keepCheck = previous && previous.draftHash === content.draftHash ? previous.check : undefined;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify({ ...content, check: keepCheck }, null, 1)}\n`);
  process.stdout.write(`\r${i + 1}/${jobs.length} ${job.level} ${job.slug}`.padEnd(70));
  return file;
});
console.log(`\n${results.length} grammar points written; Gemini ${JSON.stringify(geminiStats())}`);
