#!/usr/bin/env node
// node scripts/content/validate-articulation.mjs
// Every English sound has a valid target per accent variant, fitted targets
// stay within tolerance of their traced references, and the hand-tuned
// targets that need review are listed.

import { coverageProblems, fitProblems, loadTargets } from "./lib/articulation-check.mjs";

const { targets, references } = loadTargets();
const problems = [...coverageProblems(targets), ...fitProblems(targets, references)];
const review = targets.filter((t) => t.needsReview);
console.log(`${targets.length} targets, ${references.length} references.`);
console.log(`needsReview (${review.length}): ${review.map((t) => `${t.soundId}${t.variant === "both" ? "" : ` ${t.variant}`}`).join(", ")}`);
if (problems.length) {
  console.error(`${problems.length} problems:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
console.log("No problems.");
