// Mechanical repairs to generated drafts that only remove what is wrong (an
// alternative order with other tokens, an accepted answer identical to the
// faulty sentence, a distractor that is in the answer) or shorten an
// over-long summary. Anything still invalid afterwards is dropped by check.mjs.

import { TEXT_LIMITS, normalizeAnswer } from "../../../src/lib/platform/content-model.ts";

const tokenKey = (tokens) => tokens.map(normalizeAnswer).sort().join("\u0000");

export function repairExercise(exercise) {
  const e = structuredClone(exercise);
  if (e.kind === "sentence_building" && Array.isArray(e.answer)) {
    if (e.alternatives) {
      e.alternatives = e.alternatives.filter((alt) => Array.isArray(alt) && tokenKey(alt) === tokenKey(e.answer));
      if (e.alternatives.length === 0) delete e.alternatives;
    }
    if (e.distractors) {
      const inAnswer = new Set(e.answer.map(normalizeAnswer));
      e.distractors = e.distractors.filter((d) => !inAnswer.has(normalizeAnswer(d)));
      if (e.distractors.length === 0) delete e.distractors;
    }
  }
  if (e.kind === "error_correction" && Array.isArray(e.answers)) {
    e.answers = e.answers.filter((a) => normalizeAnswer(a) !== normalizeAnswer(e.sentence));
  }
  return e;
}

/** A summary cut at the last comma that fits, when the draft ran long. */
export function fitSummary(summary) {
  if (summary.length <= TEXT_LIMITS.summary) return summary;
  const cut = summary.lastIndexOf(", ", TEXT_LIMITS.summary - 2);
  return cut > 40 ? `${summary.slice(0, cut)}.` : `${summary.slice(0, TEXT_LIMITS.summary - 1).replace(/\s+\S*$/, "")}.`;
}
