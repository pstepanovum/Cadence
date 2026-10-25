// The placement bank's plan: which kinds of item each level gets, how many,
// and what they test. Our own selection and wording. The grammar focus per
// level comes from the grammar outline, so the bank tests what the packs
// teach. Item ids are ex.placement.<level>.<type>.<nn> and permanent.

import { OUTLINE } from "./grammar-outline.mjs";

/**
 * The item types. `kind` is the exercise kind it is stored as, `skill` which
 * per-skill estimate it feeds, `target` how many must pass the blind check
 * per level, `draft` how many are drafted per batch (two batches per level).
 */
export const PLACEMENT_TYPES = {
  grammar: { kind: "multiple_choice", skill: "grammar", target: 12, draft: 8, title: "Grammar in context" },
  gap: { kind: "gap_fill", skill: "grammar", target: 9, draft: 6, title: "Gap fill" },
  error: { kind: "multiple_choice", skill: "grammar", target: 9, draft: 6, title: "Error spotting" },
  transform: { kind: "transformation", skill: "grammar", target: 8, draft: 6, title: "Sentence transformation" },
  order: { kind: "sentence_building", skill: "grammar", target: 8, draft: 6, title: "Word order" },
  collocation: { kind: "multiple_choice", skill: "vocabulary", target: 9, draft: 7, title: "Collocation and word choice" },
  reading: { kind: "multiple_choice", skill: "vocabulary", target: 9, draft: 7, title: "Reading in context" },
};

export const PLACEMENT_PROMPTS = {
  grammar: "Choose the best answer.",
  gap: "Type the missing word or words.",
  error: "Which part of the sentence is wrong?",
  transform: "Rewrite the sentence so it means the same.",
  order: "Put the words in the right order.",
  collocation: "Choose the word that fits best.",
  reading: "Read, then choose the best answer.",
};

/** Themes, split across the two batches so the bank does not repeat itself. */
export const THEMES = [
  ["work and careers", "science and research", "cities and architecture", "food and cooking", "the arts", "sport and fitness", "technology", "nature and the environment"],
  ["money and business", "education and learning", "travel and transport", "psychology and wellbeing", "languages and linguistics", "media and journalism", "urban planning", "family and relationships"],
];

/** What vocabulary and reading items probe at each level. */
const VOCABULARY_FOCUS = {
  A1: "everyday words, make/do/have/take with simple nouns, basic prepositions after verbs",
  A2: "common verb + noun and adjective + noun pairs (catch a bus, heavy rain), phrasal verbs like get up and look for",
  B1: "collocations for work and study (make progress, take part, pay attention), dependent prepositions, common phrasal verbs",
  B2: "stronger collocations (raise awareness, a narrow escape, draw a conclusion), word formation, linking words, academic verbs",
  C1: "precise academic and idiomatic collocations (pose a threat, a vested interest, run counter to, heavily reliant), hedged and formal word choice",
  C2: "subtle and idiomatic collocations (a foregone conclusion, to all intents and purposes, bear the brunt), register, connotation and near-synonyms",
};

const READING_FOCUS = {
  A1: "one or two short sentences about everyday life; a literal question about a fact in them",
  A2: "a short message or note; a question about the main fact, time, place or reason",
  B1: "two or three sentences of an email or article; a question about the main idea or a reason",
  B2: "a short paragraph from an article or report; a question about the writer's point, a reference word, or a reason",
  C1: "a dense paragraph from an academic or opinion text; a question about implication, attitude, hedged claims or what a phrase refers to",
  C2: "a nuanced paragraph with irony, understatement or a qualified claim; a question about tone, inference or what the writer stops short of saying",
};

/** Extra hard structures each level must cover, on top of its outline. */
const EXTRA_FOCUS = {
  B2: ["mixed conditionals", "participle clauses", "reported speech with reporting verbs", "modal perfects"],
  C1: ["inversion after negative adverbials", "cleft sentences", "inverted conditionals", "the subjunctive", "nominalisation", "hedging", "advanced passives and causatives"],
  C2: ["inversion with so and such", "mixed and inverted conditionals", "the mandative subjunctive and lest", "dense nominal style", "hedging and stance", "register shifts", "ellipsis and substitution", "idiomatic collocation"],
};

export function grammarFocus(level) {
  return [...OUTLINE[level].map((row) => row[2]), ...(EXTRA_FOCUS[level] ?? [])];
}

export function vocabularyFocus(level) {
  return VOCABULARY_FOCUS[level];
}

export function readingFocus(level) {
  return READING_FOCUS[level];
}

export const placementTypeIds = () => Object.keys(PLACEMENT_TYPES);
