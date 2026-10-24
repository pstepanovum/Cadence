// Pure helpers over a loaded content pack: what the Learn hub lists, what a
// practice set contains, and the grammar search. No device APIs, so it is
// unit tested in Node (tests/catalog.test.ts).
import {
  CEFR_LEVELS,
  normalizeAnswer,
  type CefrLevel,
  type Exercise,
  type ExerciseKind,
  type FlashcardExercise,
  type GrammarPoint,
  type Lesson,
  type PackContent,
} from "../platform/content-model.ts";

export const EMPTY_PACK: PackContent = { topics: [], grammarPoints: [], lessons: [], exercises: [] };

/** `core-b1` for B1: one core pack per level. */
export function packIdForLevel(level: CefrLevel): string {
  return `core-${level.toLowerCase()}`;
}

export function levelForPackId(id: string): CefrLevel | null {
  const level = id.startsWith("core-") ? id.slice(5).toUpperCase() : "";
  return (CEFR_LEVELS as readonly string[]).includes(level) ? (level as CefrLevel) : null;
}

/** The practice modes on the Learn hub, and the exercise kinds each draws on. */
export const PRACTICE_MODES = {
  quiz: { title: "Quiz", kinds: ["multiple_choice", "gap_fill", "error_correction"] },
  matching: { title: "Matching", kinds: ["matching"] },
  builder: { title: "Grammar builder", kinds: ["sentence_building"] },
  sentences: { title: "Sentence practice", kinds: ["transformation", "gap_fill", "dictation", "error_correction"] },
  flashcards: { title: "Flashcards", kinds: ["flashcard"] },
} as const satisfies Record<string, { title: string; kinds: readonly ExerciseKind[] }>;

export type PracticeMode = keyof typeof PRACTICE_MODES;

export function isPracticeMode(value: unknown): value is PracticeMode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRACTICE_MODES, value);
}

export const SET_SIZE: Record<PracticeMode, number> = { quiz: 10, matching: 4, builder: 8, sentences: 8, flashcards: 20 };

export function exerciseIndex(pack: PackContent): Map<string, Exercise> {
  return new Map(pack.exercises.map((exercise) => [exercise.id, exercise]));
}

export function lessonExercises(pack: PackContent, lessonId: string): Exercise[] {
  const lesson = pack.lessons.find((item) => item.id === lessonId);
  if (!lesson) return [];
  const index = exerciseIndex(pack);
  return lesson.exerciseIds.map((id) => index.get(id)).filter((e): e is Exercise => Boolean(e));
}

export function findLesson(pack: PackContent, lessonId: string): Lesson | undefined {
  return pack.lessons.find((item) => item.id === lessonId);
}

export function findGrammarPoint(pack: PackContent, id: string): GrammarPoint | undefined {
  return pack.grammarPoints.find((item) => item.id === id);
}

export function flashcards(pack: PackContent): FlashcardExercise[] {
  return pack.exercises.filter((e): e is FlashcardExercise => e.kind === "flashcard");
}

/** How many exercises of a mode a pack has, for the hub's tiles. */
export function countForMode(pack: PackContent, mode: PracticeMode): number {
  const kinds = PRACTICE_MODES[mode].kinds as readonly ExerciseKind[];
  return pack.exercises.filter((e) => kinds.includes(e.kind)).length;
}

export interface GrammarAccuracy {
  attempts: number;
  correct: number;
}

/**
 * A practice set: exercises of the mode's kinds, optionally for one grammar
 * point, weakest grammar first (fewest correct per attempt, untried in the
 * middle), shuffled within a tier by `rng` so repeats vary.
 */
export function buildPracticeSet(
  pack: PackContent,
  mode: PracticeMode,
  options: {
    grammarPointId?: string;
    count?: number;
    rng?: () => number;
    accuracy?: Readonly<Record<string, GrammarAccuracy>>;
  } = {},
): Exercise[] {
  const kinds = PRACTICE_MODES[mode].kinds as readonly ExerciseKind[];
  const rng = options.rng ?? Math.random;
  const pool = pack.exercises.filter(
    (e) => kinds.includes(e.kind) && (!options.grammarPointId || e.grammarPointIds.includes(options.grammarPointId)),
  );
  const weakness = (e: Exercise) => {
    const scores = e.grammarPointIds.map((id) => options.accuracy?.[id]).filter((a): a is GrammarAccuracy => Boolean(a));
    if (scores.length === 0) return 0.5;
    const rate = scores.reduce((sum, a) => sum + (a.attempts ? a.correct / a.attempts : 0.5), 0) / scores.length;
    return rate;
  };
  const keyed = pool.map((e) => ({ e, tier: Math.round(weakness(e) * 4), r: rng() }));
  keyed.sort((a, b) => a.tier - b.tier || a.r - b.r);
  return keyed.slice(0, options.count ?? SET_SIZE[mode]).map((k) => k.e);
}

/** Grammar search for the reference: title first, then summary, patterns and examples. */
export function searchGrammar(points: readonly GrammarPoint[], query: string): GrammarPoint[] {
  const q = normalizeAnswer(query);
  if (!q) return [...points];
  const scored = points
    .map((point) => {
      const title = normalizeAnswer(point.title);
      let score = 0;
      if (title.includes(q)) score += 4;
      if (normalizeAnswer(point.summary).includes(q)) score += 2;
      if (point.patterns.some((p) => normalizeAnswer(p).includes(q))) score += 2;
      if (point.examples.some((ex) => normalizeAnswer(ex.text).includes(q))) score += 1;
      return { point, score };
    })
    .filter((item) => item.score > 0);
  scored.sort((a, b) => b.score - a.score || a.point.title.localeCompare(b.point.title));
  return scored.map((item) => item.point);
}

/** Group grammar points by topic, in topic order. */
export function grammarByTopic(pack: PackContent): { topicId: string; title: string; points: GrammarPoint[] }[] {
  return pack.topics
    .map((topic) => ({ topicId: topic.id, title: topic.title, points: pack.grammarPoints.filter((p) => p.topicId === topic.id) }))
    .filter((group) => group.points.length > 0);
}

/** Splits `*emphasis*` markup into runs for rendering. */
export function emphasisRuns(text: string): { text: string; emphasis: boolean }[] {
  const runs: { text: string; emphasis: boolean }[] = [];
  const parts = text.split("*");
  parts.forEach((part, i) => {
    if (part) runs.push({ text: part, emphasis: i % 2 === 1 });
  });
  return runs;
}
