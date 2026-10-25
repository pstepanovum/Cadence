// How an exercise is shown to the blind checker (no key) and to the judge
// (key and the other answer), and how the checker's reply becomes an
// ExerciseAnswer for gradeExercise. Shuffles are seeded by id, so stable.

import { sha256Hex } from "./text.mjs";

function seededOrder(items, seed) {
  return items
    .map((item, i) => ({ item, i, k: sha256Hex(`${seed}:${i}`) }))
    .sort((a, b) => (a.k < b.k ? -1 : 1));
}

/** A stable shuffle of exercises, so the checker does not see them grouped by kind. */
export function shuffleFor(exercises, seed) {
  return seededOrder(exercises, seed).map((x) => x.item);
}

function rightOrder(exercise) {
  return seededOrder(exercise.pairs.map((p) => p.right), exercise.id).map((x) => x.i);
}

function tokenOrder(exercise) {
  const all = [...exercise.answer, ...(exercise.distractors ?? [])];
  return seededOrder(all, exercise.id).map((x) => all[x.i]);
}

export function blindView(e, n) {
  switch (e.kind) {
    case "multiple_choice":
      return { n, task: "choose", ...(e.passage ? { passage: e.passage } : {}), question: e.question, options: e.options };
    case "gap_fill":
      return { n, task: "fill", text: e.text, ...(e.bank ? { bank: e.bank } : {}) };
    case "sentence_building":
      return { n, task: "order", tokens: tokenOrder(e) };
    case "error_correction":
      return { n, task: "correct", sentence: e.sentence };
    case "transformation":
      return { n, task: "rewrite", sentence: e.source, instruction: e.instruction };
    case "matching": {
      const order = rightOrder(e);
      return { n, task: "match", left: e.pairs.map((p) => p.left), right: order.map((i) => e.pairs[i].right) };
    }
    default:
      throw new Error(`No blind view for ${e.kind}`);
  }
}

/** The checker's reply as an ExerciseAnswer, or null when it is unusable. */
export function fromBlindAnswer(e, reply) {
  if (!reply) return null;
  switch (e.kind) {
    case "multiple_choice":
      return Number.isInteger(reply.choice) ? { kind: e.kind, choice: reply.choice } : null;
    case "gap_fill":
      return Array.isArray(reply.gaps) ? { kind: e.kind, gaps: reply.gaps } : null;
    case "sentence_building":
      return Array.isArray(reply.tokens) ? { kind: e.kind, tokens: reply.tokens } : null;
    case "error_correction":
    case "transformation":
      return typeof reply.text === "string" ? { kind: e.kind, text: reply.text } : null;
    case "matching": {
      if (!Array.isArray(reply.mapping)) return null;
      const order = rightOrder(e);
      // mapping[i] indexes the shuffled right column; the grader wants the original index.
      return { kind: e.kind, mapping: reply.mapping.map((j) => order[j] ?? -1) };
    }
    default:
      return null;
  }
}

/** The task with its key and the other answer, for the judge. */
export function judgeView(e, answer) {
  switch (e.kind) {
    case "multiple_choice":
      return { task: "choose", ...(e.passage ? { passage: e.passage } : {}), question: e.question, options: e.options, key: e.options[e.answer], other: e.options[answer.choice] ?? "(none)" };
    case "gap_fill":
      return { task: "fill the ___ gaps", text: e.text, key: e.answers.map((a) => a[0]), other: answer.gaps };
    case "sentence_building":
      return { task: "order these tokens into a sentence", tokens: tokenOrder(e), key: e.answer.join(" "), other: answer.tokens.join(" ") };
    case "error_correction":
      return { task: "correct the one mistake", sentence: e.sentence, key: e.answers[0], other: answer.text };
    case "transformation":
      return { task: "rewrite", sentence: e.source, instruction: e.instruction, key: e.answers[0], other: answer.text };
    case "matching":
      return {
        task: "match each left to its right",
        key: e.pairs.map((p) => `${p.left} ${p.right}`),
        other: e.pairs.map((p, i) => `${p.left} ${e.pairs[answer.mapping[i]]?.right ?? "?"}`),
      };
    default:
      return {};
  }
}
