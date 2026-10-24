// FILE: mobile/src/platform/content-model.ts
//
// The content model every Cadence client shares: CEFR levels, topics, grammar
// points, lessons, the exercise kinds, content packs, plus the validator the
// content pipeline runs and the grader the apps run. Pure TypeScript with no
// Node, browser or React Native APIs, so web, desktop and mobile hold one
// identical copy. docs/PLATFORM.md is the written spec.
//
// Twin: src/lib/platform/content-model.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * Bumped when a field changes meaning or a required field is added. A pack
 * whose `contentModel` is newer than the app's is skipped, never half-read.
 */
export const CONTENT_MODEL_VERSION = 1;

/** Version of the pack container (manifest and file layout), separate from the model. */
export const PACK_FORMAT_VERSION = 1;

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export function isCefrLevel(value: unknown): value is CefrLevel {
  return typeof value === "string" && (CEFR_LEVELS as readonly string[]).includes(value);
}

/** Negative when `a` is below `b`. */
export function compareCefr(a: CefrLevel, b: CefrLevel): number {
  return CEFR_LEVELS.indexOf(a) - CEFR_LEVELS.indexOf(b);
}

/**
 * Ids are a type prefix and a lowercase slug: `gp.present-perfect-continuous`,
 * `lesson.b1.travel-plans`, `ex.b1.travel-plans.03`. They are permanent: progress
 * and SRS state are keyed by them, so content is fixed by editing, never by
 * renaming.
 */
export const ID_PREFIXES = ["topic", "gp", "lesson", "ex", "card", "sound", "scenario"] as const;
export type IdPrefix = (typeof ID_PREFIXES)[number];

const ID_PATTERN = /^(topic|gp|lesson|ex|card|sound|scenario)\.[a-z0-9]+(?:[-.][a-z0-9]+)*$/;
export const MAX_ID_LENGTH = 96;

export function isContentId(value: unknown, prefix?: IdPrefix): value is string {
  if (typeof value !== "string" || value.length > MAX_ID_LENGTH || !ID_PATTERN.test(value)) return false;
  return prefix ? value.startsWith(`${prefix}.`) : true;
}

/** Where a sentence came from. Tatoeba sentences keep their id for attribution. */
export type ExampleSource = { kind: "generated" } | { kind: "tatoeba"; sentenceId: number; author?: string };

export interface Example {
  text: string;
  /** A short gloss shown under the example, e.g. what the form does here. */
  note?: string;
  source: ExampleSource;
  /** Pack-relative path of pre-generated audio, e.g. `audio/3f2a….m4a`. */
  audio?: string;
}

export interface Topic {
  id: string;
  title: string;
  summary: string;
}

export interface CommonError {
  wrong: string;
  right: string;
  note: string;
}

export interface GrammarPoint {
  id: string;
  level: CefrLevel;
  topicId: string;
  title: string;
  /** One line, shown in lists and returned by the MCP lookup. */
  summary: string;
  /** Short paragraphs. Plain text with `*emphasis*` only. */
  explanation: string;
  /** Forms, e.g. `have/has + been + verb-ing`. */
  patterns: string[];
  examples: Example[];
  commonErrors: CommonError[];
  /** Other grammar point ids worth reading next. */
  related: string[];
}

export interface Lesson {
  id: string;
  level: CefrLevel;
  topicId: string;
  title: string;
  /** What the learner can do afterwards, one sentence. */
  goal: string;
  /** Expected time, used by the daily plan. */
  minutes: number;
  grammarPointIds: string[];
  /** Sounds practised, as `sound.<ipa-slug>` ids; pronunciation lessons only. */
  soundIds: string[];
  exerciseIds: string[];
}

export const EXERCISE_KINDS = [
  "multiple_choice",
  "matching",
  "gap_fill",
  "sentence_building",
  "error_correction",
  "transformation",
  "dictation",
  "minimal_pair",
  "flashcard",
] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

/** The token a gap-fill text uses for each gap. */
export const GAP = "___";

interface ExerciseBase {
  id: string;
  level: CefrLevel;
  grammarPointIds: string[];
  soundIds?: string[];
  /** The instruction, e.g. "Choose the best answer." */
  prompt: string;
  /** Shown after answering. */
  explanation?: string;
}

export interface MultipleChoiceExercise extends ExerciseBase {
  kind: "multiple_choice";
  question: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
}

export interface MatchingExercise extends ExerciseBase {
  kind: "matching";
  /** Correct pairs; the app shuffles the right column. */
  pairs: { left: string; right: string }[];
}

export interface GapFillExercise extends ExerciseBase {
  kind: "gap_fill";
  /** Text with one `___` per gap. */
  text: string;
  /** Accepted answers per gap, in gap order. */
  answers: string[][];
  /** Optional word bank shown instead of free typing. */
  bank?: string[];
}

export interface SentenceBuildingExercise extends ExerciseBase {
  kind: "sentence_building";
  /** The tokens in a correct order; the app shuffles them with any distractors. */
  answer: string[];
  /** Other correct orders of the same tokens. */
  alternatives?: string[][];
  distractors?: string[];
}

export interface ErrorCorrectionExercise extends ExerciseBase {
  kind: "error_correction";
  sentence: string;
  /** Accepted corrected sentences. */
  answers: string[];
}

export interface TransformationExercise extends ExerciseBase {
  kind: "transformation";
  source: string;
  /** e.g. "Rewrite in the passive." */
  instruction: string;
  answers: string[];
}

export interface DictationExercise extends ExerciseBase {
  kind: "dictation";
  text: string;
  /** Pack-relative path of the pre-generated audio. */
  audio: string;
}

export interface MinimalPairExercise extends ExerciseBase {
  kind: "minimal_pair";
  words: [string, string];
  /** The contrasting sounds, in the same order as `words`. */
  soundIds: [string, string];
  audio: [string, string];
}

export interface FlashcardExercise extends ExerciseBase {
  kind: "flashcard";
  front: string;
  back: string;
  example?: Example;
  audio?: string;
}

export type Exercise =
  | MultipleChoiceExercise
  | MatchingExercise
  | GapFillExercise
  | SentenceBuildingExercise
  | ErrorCorrectionExercise
  | TransformationExercise
  | DictationExercise
  | MinimalPairExercise
  | FlashcardExercise;

/** The body of one pack file. A pack may hold several; ids are unique across a pack. */
export interface PackContent {
  topics: Topic[];
  grammarPoints: GrammarPoint[];
  lessons: Lesson[];
  exercises: Exercise[];
}

export interface PackFileEntry {
  /** Relative to the pack root, e.g. `content.json` or `audio/3f2a….m4a`. */
  path: string;
  sha256: string;
  bytes: number;
}

/**
 * `manifest.json` at the root of every pack. `version` only goes up; an app
 * replaces a pack when the index lists a higher version with the same id.
 */
export interface PackManifest {
  format: number;
  contentModel: number;
  id: string;
  version: number;
  title: string;
  /** Absent for packs that span levels (e.g. the sounds library). */
  level?: CefrLevel;
  generatedAt: string;
  files: PackFileEntry[];
}

/** `packs/index.json`, served by the web and bundled with each app build. */
export interface PackIndex {
  format: number;
  packs: { id: string; version: number; level?: CefrLevel; manifest: string; bytes: number }[];
}

/** An app reads a pack only if it understands both its container and its model. */
export function canReadPack(manifest: Pick<PackManifest, "format" | "contentModel">): boolean {
  return manifest.format === PACK_FORMAT_VERSION && manifest.contentModel <= CONTENT_MODEL_VERSION;
}

/** Index entries the app should download: newer than what it holds, and readable. */
export function packsToUpdate(
  index: PackIndex,
  installed: Readonly<Record<string, number>>,
): PackIndex["packs"] {
  if (index.format !== PACK_FORMAT_VERSION) return [];
  return index.packs.filter((entry) => (installed[entry.id] ?? -1) < entry.version);
}

// ---------------------------------------------------------------------------
// Validation (content pipeline and tests)
// ---------------------------------------------------------------------------

export const TEXT_LIMITS = {
  title: 80,
  summary: 200,
  prompt: 200,
  sentence: 240,
  explanation: 2000,
  option: 120,
} as const;

function countGaps(text: string): number {
  return text.split(GAP).length - 1;
}

function checkText(problems: string[], where: string, value: unknown, max: number): void {
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`${where}: must be non-empty text`);
  } else if (value.length > max) {
    problems.push(`${where}: longer than ${max} characters`);
  }
}

/** Problems with one exercise on its own; empty when it is valid. */
export function validateExercise(exercise: Exercise): string[] {
  const p: string[] = [];
  const at = exercise.id || "(no id)";
  if (!isContentId(exercise.id, "ex")) p.push(`${at}: id must look like ex.<slug>`);
  if (!(EXERCISE_KINDS as readonly string[]).includes(exercise.kind)) p.push(`${at}: unknown kind ${exercise.kind}`);
  if (!isCefrLevel(exercise.level)) p.push(`${at}: level must be one of ${CEFR_LEVELS.join(", ")}`);
  checkText(p, `${at} prompt`, exercise.prompt, TEXT_LIMITS.prompt);
  if (!Array.isArray(exercise.grammarPointIds)) p.push(`${at}: grammarPointIds must be a list`);
  if (exercise.explanation !== undefined) checkText(p, `${at} explanation`, exercise.explanation, TEXT_LIMITS.explanation);

  switch (exercise.kind) {
    case "multiple_choice": {
      checkText(p, `${at} question`, exercise.question, TEXT_LIMITS.sentence);
      if (!Array.isArray(exercise.options) || exercise.options.length < 2 || exercise.options.length > 6) {
        p.push(`${at}: needs 2 to 6 options`);
        break;
      }
      exercise.options.forEach((option, i) => checkText(p, `${at} option ${i}`, option, TEXT_LIMITS.option));
      const normalized = exercise.options.map(normalizeAnswer);
      if (new Set(normalized).size !== normalized.length) p.push(`${at}: options repeat`);
      if (!Number.isInteger(exercise.answer) || exercise.answer < 0 || exercise.answer >= exercise.options.length) {
        p.push(`${at}: answer must index an option`);
      }
      break;
    }
    case "matching": {
      if (!Array.isArray(exercise.pairs) || exercise.pairs.length < 2 || exercise.pairs.length > 8) {
        p.push(`${at}: needs 2 to 8 pairs`);
        break;
      }
      const lefts = exercise.pairs.map((pair) => normalizeAnswer(pair.left));
      const rights = exercise.pairs.map((pair) => normalizeAnswer(pair.right));
      if (new Set(lefts).size !== lefts.length || new Set(rights).size !== rights.length) {
        p.push(`${at}: each side must be unique, or the match is ambiguous`);
      }
      break;
    }
    case "gap_fill": {
      checkText(p, `${at} text`, exercise.text, TEXT_LIMITS.sentence);
      const gaps = typeof exercise.text === "string" ? countGaps(exercise.text) : 0;
      if (gaps < 1) p.push(`${at}: text has no ${GAP} gap`);
      if (!Array.isArray(exercise.answers) || exercise.answers.length !== gaps) {
        p.push(`${at}: needs one answer list per gap (${gaps})`);
      } else if (exercise.answers.some((accepted) => !Array.isArray(accepted) || accepted.length === 0)) {
        p.push(`${at}: every gap needs at least one accepted answer`);
      }
      if (exercise.bank && Array.isArray(exercise.answers)) {
        const bank = new Set(exercise.bank.map(normalizeAnswer));
        if (exercise.answers.some((accepted) => !accepted.some((a) => bank.has(normalizeAnswer(a))))) {
          p.push(`${at}: the word bank is missing a correct answer`);
        }
      }
      break;
    }
    case "sentence_building": {
      if (!Array.isArray(exercise.answer) || exercise.answer.length < 3 || exercise.answer.length > 16) {
        p.push(`${at}: answer needs 3 to 16 tokens`);
        break;
      }
      const key = (tokens: string[]) => tokens.map(normalizeAnswer).sort().join("\u0000");
      for (const alternative of exercise.alternatives ?? []) {
        if (key(alternative) !== key(exercise.answer)) p.push(`${at}: an alternative uses different tokens`);
      }
      const answerTokens = new Set(exercise.answer.map(normalizeAnswer));
      if ((exercise.distractors ?? []).some((d) => answerTokens.has(normalizeAnswer(d)))) {
        p.push(`${at}: a distractor is also in the answer`);
      }
      break;
    }
    case "error_correction": {
      checkText(p, `${at} sentence`, exercise.sentence, TEXT_LIMITS.sentence);
      if (!Array.isArray(exercise.answers) || exercise.answers.length === 0) p.push(`${at}: needs an accepted answer`);
      else if (exercise.answers.some((a) => normalizeAnswer(a) === normalizeAnswer(exercise.sentence))) {
        p.push(`${at}: an accepted answer is the same as the wrong sentence`);
      }
      break;
    }
    case "transformation": {
      checkText(p, `${at} source`, exercise.source, TEXT_LIMITS.sentence);
      checkText(p, `${at} instruction`, exercise.instruction, TEXT_LIMITS.prompt);
      if (!Array.isArray(exercise.answers) || exercise.answers.length === 0) p.push(`${at}: needs an accepted answer`);
      break;
    }
    case "dictation": {
      checkText(p, `${at} text`, exercise.text, TEXT_LIMITS.sentence);
      checkText(p, `${at} audio`, exercise.audio, 200);
      break;
    }
    case "minimal_pair": {
      if (!Array.isArray(exercise.words) || exercise.words.length !== 2) p.push(`${at}: needs exactly two words`);
      else if (normalizeAnswer(exercise.words[0]) === normalizeAnswer(exercise.words[1])) p.push(`${at}: the words are the same`);
      if (!Array.isArray(exercise.soundIds) || exercise.soundIds.length !== 2 || !exercise.soundIds.every((id) => isContentId(id, "sound"))) {
        p.push(`${at}: needs two sound ids`);
      }
      if (!Array.isArray(exercise.audio) || exercise.audio.length !== 2) p.push(`${at}: needs audio for both words`);
      break;
    }
    case "flashcard": {
      checkText(p, `${at} front`, exercise.front, TEXT_LIMITS.sentence);
      checkText(p, `${at} back`, exercise.back, TEXT_LIMITS.sentence);
      break;
    }
  }
  return p;
}

/** Problems across a whole pack: ids, references, and every exercise. */
export function validatePackContent(pack: PackContent): string[] {
  const p: string[] = [];
  const seen = new Set<string>();
  const claim = (id: string, prefix: IdPrefix) => {
    if (!isContentId(id, prefix)) p.push(`${id || "(no id)"}: id must look like ${prefix}.<slug>`);
    if (seen.has(id)) p.push(`${id}: duplicate id`);
    seen.add(id);
  };

  pack.topics.forEach((topic) => {
    claim(topic.id, "topic");
    checkText(p, `${topic.id} title`, topic.title, TEXT_LIMITS.title);
  });
  const topicIds = new Set(pack.topics.map((t) => t.id));
  const grammarIds = new Set(pack.grammarPoints.map((g) => g.id));
  const exerciseIds = new Set(pack.exercises.map((e) => e.id));

  for (const gp of pack.grammarPoints) {
    claim(gp.id, "gp");
    if (!isCefrLevel(gp.level)) p.push(`${gp.id}: bad level`);
    if (!topicIds.has(gp.topicId)) p.push(`${gp.id}: unknown topic ${gp.topicId}`);
    checkText(p, `${gp.id} title`, gp.title, TEXT_LIMITS.title);
    checkText(p, `${gp.id} summary`, gp.summary, TEXT_LIMITS.summary);
    checkText(p, `${gp.id} explanation`, gp.explanation, TEXT_LIMITS.explanation);
    if (gp.examples.length < 2) p.push(`${gp.id}: needs at least two examples`);
    gp.examples.forEach((ex, i) => checkText(p, `${gp.id} example ${i}`, ex.text, TEXT_LIMITS.sentence));
    // Related points may live in another pack, so only the id shape is checked here.
    gp.related.forEach((id) => {
      if (!isContentId(id, "gp")) p.push(`${gp.id}: related ${id} is not a grammar point id`);
    });
  }

  for (const lesson of pack.lessons) {
    claim(lesson.id, "lesson");
    if (!isCefrLevel(lesson.level)) p.push(`${lesson.id}: bad level`);
    if (!topicIds.has(lesson.topicId)) p.push(`${lesson.id}: unknown topic ${lesson.topicId}`);
    checkText(p, `${lesson.id} title`, lesson.title, TEXT_LIMITS.title);
    if (!(lesson.minutes > 0 && lesson.minutes <= 30)) p.push(`${lesson.id}: minutes must be 1 to 30`);
    if (lesson.exerciseIds.length === 0) p.push(`${lesson.id}: has no exercises`);
    lesson.grammarPointIds.forEach((id) => {
      if (!grammarIds.has(id)) p.push(`${lesson.id}: unknown grammar point ${id}`);
    });
    lesson.exerciseIds.forEach((id) => {
      if (!exerciseIds.has(id)) p.push(`${lesson.id}: unknown exercise ${id}`);
    });
  }

  for (const exercise of pack.exercises) {
    claim(exercise.id, "ex");
    p.push(...validateExercise(exercise).filter((problem) => !problem.endsWith("id must look like ex.<slug>")));
    exercise.grammarPointIds.forEach((id) => {
      if (!grammarIds.has(id)) p.push(`${exercise.id}: unknown grammar point ${id}`);
    });
  }
  return p;
}

// ---------------------------------------------------------------------------
// Grading (apps, MCP quiz tool)
// ---------------------------------------------------------------------------

/**
 * How typed answers are compared: Unicode-normalised, case-folded, curly quotes
 * and dashes straightened, whitespace collapsed, final punctuation dropped.
 * Contractions are not expanded; accepted answers list both forms.
 */
export function normalizeAnswer(text: string): string {
  return String(text)
    .normalize("NFKC")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*[.!?]+$/, "")
    .trim();
}

export type ExerciseAnswer =
  | { kind: "multiple_choice"; choice: number }
  | { kind: "matching"; mapping: number[] }
  | { kind: "gap_fill"; gaps: string[] }
  | { kind: "sentence_building"; tokens: string[] }
  | { kind: "error_correction"; text: string }
  | { kind: "transformation"; text: string }
  | { kind: "dictation"; text: string }
  | { kind: "minimal_pair"; played: 0 | 1; choice: 0 | 1 }
  | { kind: "flashcard"; grade: "again" | "hard" | "good" | "easy" };

export interface GradeResult {
  correct: boolean;
  /** 0 to 1; partial credit for matching, gap fill and dictation. */
  score: number;
  /** Per part, where the kind has parts (pairs, gaps). */
  parts?: boolean[];
}

/** A dictation counts as correct at this word accuracy or above. */
export const DICTATION_PASS = 0.9;

function words(text: string): string[] {
  return normalizeAnswer(text)
    .replace(/[.,!?;:"()[\]{}\-]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Word-level accuracy, 1 - edit distance / reference length, floored at 0. */
export function wordAccuracy(reference: string, attempt: string): number {
  const ref = words(reference);
  const hyp = words(attempt);
  if (ref.length === 0) return hyp.length === 0 ? 1 : 0;
  let prev = Array.from({ length: hyp.length + 1 }, (_, j) => j);
  for (let i = 1; i <= ref.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= hyp.length; j += 1) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return Math.max(0, 1 - prev[hyp.length] / ref.length);
}

const matchesAny = (accepted: readonly string[], given: string) =>
  accepted.some((a) => normalizeAnswer(a) === normalizeAnswer(given));

export function gradeExercise(exercise: Exercise, answer: ExerciseAnswer): GradeResult {
  if (answer.kind !== exercise.kind) throw new Error(`Answer for ${answer.kind} given to a ${exercise.kind} exercise.`);
  const whole = (correct: boolean): GradeResult => ({ correct, score: correct ? 1 : 0 });

  switch (exercise.kind) {
    case "multiple_choice":
      return whole((answer as { choice: number }).choice === exercise.answer);
    case "matching": {
      const mapping = (answer as { mapping: number[] }).mapping;
      const parts = exercise.pairs.map((_, i) => mapping[i] === i);
      const score = parts.filter(Boolean).length / parts.length;
      return { correct: score === 1, score, parts };
    }
    case "gap_fill": {
      const gaps = (answer as { gaps: string[] }).gaps;
      const parts = exercise.answers.map((accepted, i) => matchesAny(accepted, gaps[i] ?? ""));
      const score = parts.filter(Boolean).length / parts.length;
      return { correct: score === 1, score, parts };
    }
    case "sentence_building": {
      const given = normalizeAnswer((answer as { tokens: string[] }).tokens.join(" "));
      const orders = [exercise.answer, ...(exercise.alternatives ?? [])];
      return whole(orders.some((order) => normalizeAnswer(order.join(" ")) === given));
    }
    case "error_correction":
    case "transformation":
      return whole(matchesAny(exercise.answers, (answer as { text: string }).text));
    case "dictation": {
      const score = wordAccuracy(exercise.text, (answer as { text: string }).text);
      return { correct: score >= DICTATION_PASS, score };
    }
    case "minimal_pair": {
      const { played, choice } = answer as { played: 0 | 1; choice: 0 | 1 };
      return whole(played === choice);
    }
    case "flashcard": {
      // Self-graded: "again" is a miss, anything else a recall.
      return whole((answer as { grade: string }).grade !== "again");
    }
  }
}
