// The grammar generator's prompt, response schema and the step that turns a
// draft into Cadence's content model (src/lib/platform/content-model.ts).

import { sha256Hex } from "./text.mjs";
import { fitSummary, repairExercise } from "./repair.mjs";

export const EXERCISE_PROMPTS = {
  multiple_choice: "Choose the best answer.",
  gap_fill: "Complete the sentence.",
  sentence_building: "Put the words in the right order.",
  error_correction: "Find the mistake and write the sentence correctly.",
  transformation: "Rewrite the sentence.",
  matching: "Match the beginnings and endings.",
};

export const GRAMMAR_SYSTEM = `You write grammar lessons for adult learners of English for an app called Cadence.
Write everything yourself, in clear, modern, neutral English (General American spelling), friendly and concise.
Never copy from textbooks, dictionaries or published course material, and never mention them.
Keep every sentence natural and plausible; vary names, places and topics (work, travel, family, food, hobbies, science, cities, everyday life).
Avoid anything offensive, political, religious, sexual, violent or about real living people or brands.
Every exercise must have exactly one correct answer unless you list all acceptable answers.
Exercises must test the grammar point itself, at the stated CEFR level.

Formats:
- explanation: 2 to 4 short paragraphs separated by a blank line, at most 1200 characters in total, plain text with *emphasis* only.
- patterns: 2 to 5 short form patterns, e.g. "have/has + been + verb-ing".
- examples: 5 sentences, each with a short note on what the form does there.
- commonErrors: 3 typical learner mistakes, each with the corrected sentence and a one-line note.
- multipleChoice (4): a sentence with one ___ gap or a short question, 3 or 4 options, answer is the index of the only correct option.
- gapFill (3): one sentence with one or two ___ gaps; answers lists every acceptable answer for each gap (include contracted and full forms where both work).
- sentenceBuilding (2): a correct sentence of 5 to 12 words split into tokens (one word per token, the final punctuation joined to the last word); alternatives lists any other correct orders of the same tokens; distractors are 1 or 2 wrong words that are not in the sentence.
- errorCorrection (2): a sentence with exactly one grammar mistake about this point; answers lists every acceptable corrected sentence.
- transformation (2): a source sentence, an instruction (e.g. "Use the word 'since'." or "Rewrite in the passive."), and every acceptable rewritten sentence.
- matching (1): 4 pairs; left is the start of a sentence and right its end; every left matches exactly one right.
- tatoebaPatterns: 1 to 3 JavaScript regular expressions (no slashes or flags, case-insensitive) that find example sentences using this grammar point in a large corpus of simple English sentences. Make them specific so they rarely match other structures.`;

const STR = { type: "string" };
const STR_LIST = { type: "array", items: STR };

export const GRAMMAR_SCHEMA = {
  type: "object",
  properties: {
    summary: STR,
    explanation: STR,
    patterns: STR_LIST,
    examples: { type: "array", items: { type: "object", properties: { text: STR, note: STR }, required: ["text", "note"] } },
    commonErrors: {
      type: "array",
      items: { type: "object", properties: { wrong: STR, right: STR, note: STR }, required: ["wrong", "right", "note"] },
    },
    multipleChoice: {
      type: "array",
      items: {
        type: "object",
        properties: { question: STR, options: STR_LIST, answer: { type: "integer" }, explanation: STR },
        required: ["question", "options", "answer", "explanation"],
      },
    },
    gapFill: {
      type: "array",
      items: {
        type: "object",
        properties: { text: STR, answers: { type: "array", items: STR_LIST }, explanation: STR },
        required: ["text", "answers", "explanation"],
      },
    },
    sentenceBuilding: {
      type: "array",
      items: {
        type: "object",
        properties: { tokens: STR_LIST, alternatives: { type: "array", items: STR_LIST }, distractors: STR_LIST, explanation: STR },
        required: ["tokens", "explanation"],
      },
    },
    errorCorrection: {
      type: "array",
      items: { type: "object", properties: { sentence: STR, answers: STR_LIST, explanation: STR }, required: ["sentence", "answers", "explanation"] },
    },
    transformation: {
      type: "array",
      items: {
        type: "object",
        properties: { source: STR, instruction: STR, answers: STR_LIST, explanation: STR },
        required: ["source", "instruction", "answers", "explanation"],
      },
    },
    matching: {
      type: "array",
      items: {
        type: "object",
        properties: { pairs: { type: "array", items: { type: "object", properties: { left: STR, right: STR }, required: ["left", "right"] } } },
        required: ["pairs"],
      },
    },
    tatoebaPatterns: STR_LIST,
  },
  required: [
    "summary",
    "explanation",
    "patterns",
    "examples",
    "commonErrors",
    "multipleChoice",
    "gapFill",
    "sentenceBuilding",
    "errorCorrection",
    "transformation",
    "matching",
    "tatoebaPatterns",
  ],
};

export function grammarPrompt(job) {
  return [
    `CEFR level: ${job.level}`,
    `Topic: ${job.topicTitle}`,
    `Grammar point: ${job.title}`,
    `Scope: ${job.brief}`,
    job.siblings.length ? `Other points at this level in the same topic (do not teach them here): ${job.siblings.join("; ")}` : "",
    `summary: one line under 150 characters saying what this point is for.`,
    `Use vocabulary a ${job.level} learner knows.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The draft as content-model records, with permanent ids. */
export function toContent(job, draft) {
  const base = `ex.${job.level.toLowerCase()}.${job.slug}`;
  const gpId = `gp.${job.slug}`;
  const exercises = [];
  const add = (kind, fields) => {
    const n = String(exercises.length + 1).padStart(2, "0");
    exercises.push(repairExercise({ id: `${base}.${n}`, kind, level: job.level, grammarPointIds: [gpId], prompt: EXERCISE_PROMPTS[kind], ...fields }));
  };
  for (const e of draft.multipleChoice ?? []) add("multiple_choice", { question: e.question, options: e.options, answer: e.answer, explanation: e.explanation });
  for (const e of draft.gapFill ?? []) add("gap_fill", { text: e.text, answers: e.answers, explanation: e.explanation });
  for (const e of draft.sentenceBuilding ?? []) {
    add("sentence_building", {
      answer: e.tokens,
      ...(e.alternatives?.length ? { alternatives: e.alternatives } : {}),
      ...(e.distractors?.length ? { distractors: e.distractors } : {}),
      explanation: e.explanation,
    });
  }
  for (const e of draft.errorCorrection ?? []) add("error_correction", { sentence: e.sentence, answers: e.answers, explanation: e.explanation });
  for (const e of draft.transformation ?? []) {
    add("transformation", { source: e.source, instruction: e.instruction, answers: e.answers, explanation: e.explanation });
  }
  for (const e of draft.matching ?? []) add("matching", { pairs: e.pairs });

  const grammarPoint = {
    id: gpId,
    level: job.level,
    topicId: job.topicId,
    title: job.title,
    summary: fitSummary(draft.summary),
    explanation: draft.explanation,
    patterns: draft.patterns,
    examples: (draft.examples ?? []).map((e) => ({ text: e.text, note: e.note, source: { kind: "generated" } })),
    commonErrors: draft.commonErrors,
    related: [],
  };
  const draftHash = sha256Hex(JSON.stringify(draft)).slice(0, 16);
  return { format: 1, level: job.level, slug: job.slug, draftHash, grammarPoint, exercises, tatoebaPatterns: draft.tatoebaPatterns ?? [] };
}
