// The blind check shared by the grammar check (check.mjs) and the placement
// bank (placement.mjs): a checker answers every item without the key, and a
// stronger model judges each disagreement. A wrong key or an ambiguous item is
// dropped, a second correct answer widens the key, a checker slip is kept.

import { CHECK_MODEL, generateJson } from "./gemini.mjs";
import { blindView, fromBlindAnswer, judgeView } from "./blind.mjs";
import { gradeExercise, normalizeAnswer, validateExercise } from "../../../src/lib/platform/content-model.ts";

export const JUDGE_MODEL = process.env.CONTENT_JUDGE_MODEL ?? "gemini-3.5-flash";

const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer" },
          choice: { type: "integer" },
          gaps: { type: "array", items: { type: "string" } },
          tokens: { type: "array", items: { type: "string" } },
          text: { type: "string" },
          mapping: { type: "array", items: { type: "integer" } },
        },
        required: ["n"],
      },
    },
  },
  required: ["answers"],
};

const ANSWER_SYSTEM = `You are an expert in English grammar taking a test. Answer every item.
- choose: give "choice", the 0-based index of the correct option.
- fill: give "gaps", one string per ___ gap, in order (only the missing words).
- order: give "tokens", every given token except words that do not belong, in the correct order.
- correct: give "text", the whole sentence with its one mistake corrected and nothing else changed.
- rewrite: give "text", the rewritten sentence following the instruction, keeping the meaning.
- match: give "mapping", for each left item (in order) the 0-based index of its right item.
Return one answer per item with its number n.`;

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: { n: { type: "integer" }, keyCorrect: { type: "boolean" }, otherCorrect: { type: "boolean" }, note: { type: "string" } },
        required: ["n", "keyCorrect", "otherCorrect", "note"],
      },
    },
  },
  required: ["verdicts"],
};

const JUDGE_SYSTEM = `You are a careful English grammar examiner reviewing test items written for learners.
For each item you get the task, the answer key and another answer.
- keyCorrect: true only if the key is a fully correct, natural answer to the task as written.
- otherCorrect: true only if the other answer is also a fully correct, natural answer to the same task (for choose and match items: whether that other choice is also defensible, which would make the item ambiguous).
Judge standard modern English (American or British both acceptable). Be strict about grammar and about following the instruction.
note: one short sentence.`;

async function answerBlind(exercises, label) {
  const items = exercises.map((e, i) => blindView(e, i + 1));
  const result = await generateJson({
    model: CHECK_MODEL,
    system: ANSWER_SYSTEM,
    prompt: `${label}\n\n${JSON.stringify(items, null, 1)}`,
    schema: ANSWER_SCHEMA,
  });
  const byN = new Map((result.answers ?? []).map((a) => [a.n, a]));
  return exercises.map((e, i) => fromBlindAnswer(e, byN.get(i + 1)));
}

async function judge(disputes) {
  if (disputes.length === 0) return [];
  const items = disputes.map((d, i) => ({ n: i + 1, ...judgeView(d.exercise, d.answer) }));
  const result = await generateJson({ model: JUDGE_MODEL, system: JUDGE_SYSTEM, prompt: JSON.stringify(items, null, 1), schema: JUDGE_SCHEMA });
  const byN = new Map((result.verdicts ?? []).map((v) => [v.n, v]));
  return disputes.map((_, i) => byN.get(i + 1));
}

/** Adds a second correct answer to the key, where the kind allows it. */
function widenKey(exercise, answer) {
  const e = structuredClone(exercise);
  switch (e.kind) {
    case "gap_fill":
      e.answers = e.answers.map((accepted, i) => {
        const given = answer.gaps?.[i];
        return given && !accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(given)) ? [...accepted, given] : accepted;
      });
      return e;
    case "error_correction":
    case "transformation":
      e.answers = [...e.answers, answer.text];
      return e;
    case "sentence_building":
      e.alternatives = [...(e.alternatives ?? []), answer.tokens];
      return e;
    default:
      return null;
  }
}

export async function checkSet(exercises, label) {
  const results = {};
  const fixedExercises = new Map();
  const answers = await answerBlind(exercises, label);
  const disputes = [];
  exercises.forEach((e, i) => {
    const answer = answers[i];
    if (!answer) {
      disputes.push({ exercise: e, answer: null });
      return;
    }
    const grade = gradeExercise(e, answer);
    if (grade.correct) results[e.id] = { status: "pass" };
    else disputes.push({ exercise: e, answer });
  });
  const verdicts = await judge(disputes.filter((d) => d.answer));
  let v = 0;
  for (const d of disputes) {
    if (!d.answer) {
      results[d.exercise.id] = { status: "drop", note: "The checker gave no usable answer." };
      continue;
    }
    const verdict = verdicts[v++];
    if (!verdict) {
      results[d.exercise.id] = { status: "drop", note: "No verdict." };
    } else if (!verdict.keyCorrect) {
      results[d.exercise.id] = { status: "drop", note: `Key judged wrong: ${verdict.note}` };
    } else if (!verdict.otherCorrect) {
      results[d.exercise.id] = { status: "pass", note: `Checker slip: ${verdict.note}` };
    } else {
      const widened = widenKey(d.exercise, d.answer);
      if (widened && validateExercise(widened).length === 0) {
        fixedExercises.set(d.exercise.id, widened);
        results[d.exercise.id] = { status: "fixed", note: `Second answer accepted: ${verdict.note}` };
      } else {
        results[d.exercise.id] = { status: "drop", note: `Ambiguous: ${verdict.note}` };
      }
    }
  }
  return { results, fixedExercises };
}
