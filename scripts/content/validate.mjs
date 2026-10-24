#!/usr/bin/env node
// node scripts/content/validate.mjs
// Assembles every pack from content/ and checks it: the shared model's
// validator, answer keys, duplicates, CEFR coverage, profanity, length limits,
// Tatoeba attribution against the export (when downloaded), the size budget,
// the articulation targets, and that public/packs matches the sources.

import { coverageProblems, fitProblems, loadTargets } from "./lib/articulation-check.mjs";
import { assemblePacks } from "./lib/assemble.mjs";
import { exportAvailable, readSentences } from "./lib/tatoeba.mjs";
import { corpusProblems, packProblems, tatoebaProblems } from "./lib/validators.mjs";

const packs = assemblePacks();
const problems = [...packs.flatMap(packProblems), ...corpusProblems(packs)];
const { targets, references } = loadTargets();
problems.push(...coverageProblems(targets), ...fitProblems(targets, references));

if (exportAvailable()) problems.push(...tatoebaProblems(packs, readSentences()));
else console.warn("Tatoeba export not downloaded; skipping the attribution check (run tatoeba.mjs freq to fetch it).");

for (const pack of packs) {
  const c = pack.files["content.json"];
  const kinds = {};
  for (const e of c.exercises) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  console.log(
    `${pack.id.padEnd(8)} ${String(c.grammarPoints.length).padStart(3)} grammar points, ${String(c.lessons.length).padStart(3)} lessons, ${String(c.exercises.length).padStart(4)} exercises ${JSON.stringify(kinds)}${pack.files["sentences.json"] ? `, ${pack.files["sentences.json"].sentences.length} sentences` : ""}`,
  );
}
if (problems.length) {
  console.error(`\n${problems.length} problems:\n  ${problems.slice(0, 200).join("\n  ")}`);
  process.exit(1);
}
console.log("\nNo problems.");
