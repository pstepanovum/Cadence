// Everything the phone remembers about a learner's practice: the summary
// every signed-in account syncs, the activities not yet sent, and the detail
// (lesson records, grammar and sound mastery, flashcard SRS state, recent
// attempts) that stays on the device for free accounts and syncs for Plus
// (docs/PLATFORM.md, sections 4.1 and 5). Pure, so the rules are unit tested
// (tests/learning-state.test.ts); src/learning/store.ts persists it.
import type { CefrLevel, Exercise, GradeResult } from "../platform/content-model.ts";
import {
  applyActivity,
  emptySummary,
  type Activity,
  type ActivityKind,
  type ProgressSummary,
} from "../platform/progress-model.ts";
import { mergeMastery, recordDrillTake, recordPhonemes, recordReview, type SoundMasteryMap } from "../practice/sound-coach.ts";
import { review, type CardState, type Grade } from "../games/srs.ts";

export const LEARNING_SCHEMA = 1;
export const MAX_PENDING = 200;
export const MAX_ATTEMPTS = 500;
export const MAX_CUSTOM_CARDS = 500;
/** The server accepts at most this many activities per summary sync. */
export const SUMMARY_BATCH = 50;

export interface CardRecord extends CardState {
  updatedAt: number;
}

export interface GrammarMastery {
  attempts: number;
  correct: number;
  /** Smoothed accuracy, 0 to 100. */
  ema: number;
  lastAt: number;
}

export interface Attempt {
  exerciseId: string;
  kind: string;
  grammarPointIds: string[];
  score: number;
  correct: boolean;
  at: number;
  day: string;
}

export interface LessonRecord {
  completedAt: number;
  bestScore: number;
}

/** A card added through the MCP connector or by hand, not from a pack. */
export interface CustomCard {
  id: string;
  front: string;
  back: string;
  example?: string;
  addedAt: number;
}

export interface SyncMarks {
  /** Detail changes after this time have not been pushed yet (Plus). */
  pushedAt: number;
  /** The server's cursor for GET /api/sync/pull (Plus). */
  pullCursor: string | null;
  /** When this install's detail was uploaded once on upgrade (Plus). */
  importedAt: number | null;
}

export interface LearningState {
  schema: number;
  summary: ProgressSummary;
  pending: Activity[];
  lessons: Record<string, LessonRecord>;
  grammar: Record<string, GrammarMastery>;
  sounds: SoundMasteryMap;
  cards: Record<string, CardRecord>;
  customCards: CustomCard[];
  /** Newest first. */
  attempts: Attempt[];
  sync: SyncMarks;
}

export function emptyLearningState(): LearningState {
  return {
    schema: LEARNING_SCHEMA,
    summary: emptySummary(),
    pending: [],
    lessons: {},
    grammar: {},
    sounds: {},
    cards: {},
    customCards: [],
    attempts: [],
    sync: { pushedAt: 0, pullCursor: null, importedAt: null },
  };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads stored state; anything unreadable starts that part fresh rather than failing. */
export function parseLearningState(raw: unknown): LearningState {
  const base = emptyLearningState();
  if (!isObject(raw)) return base;
  const summary = isObject(raw.summary) && isObject(raw.summary.streak) ? (raw.summary as unknown as ProgressSummary) : base.summary;
  return {
    schema: LEARNING_SCHEMA,
    summary: { ...base.summary, ...summary, lessonsCompleted: { ...base.summary.lessonsCompleted, ...(summary.lessonsCompleted ?? {}) } },
    pending: Array.isArray(raw.pending) ? (raw.pending as Activity[]).slice(0, MAX_PENDING) : [],
    lessons: isObject(raw.lessons) ? (raw.lessons as Record<string, LessonRecord>) : {},
    grammar: isObject(raw.grammar) ? (raw.grammar as Record<string, GrammarMastery>) : {},
    sounds: isObject(raw.sounds) ? (raw.sounds as SoundMasteryMap) : {},
    cards: isObject(raw.cards) ? (raw.cards as Record<string, CardRecord>) : {},
    customCards: Array.isArray(raw.customCards) ? (raw.customCards as CustomCard[]) : [],
    attempts: Array.isArray(raw.attempts) ? (raw.attempts as Attempt[]).slice(0, MAX_ATTEMPTS) : [],
    sync: isObject(raw.sync) ? { ...base.sync, ...(raw.sync as Partial<SyncMarks>) } : base.sync,
  };
}

/** One graded answer: grammar mastery for each point it practises, and the attempt log. */
export function recordAnswer(state: LearningState, exercise: Exercise, result: GradeResult, at: number, day: string): LearningState {
  const grammar = { ...state.grammar };
  const score = Math.round(result.score * 100);
  for (const id of exercise.grammarPointIds) {
    const m = grammar[id] ?? { attempts: 0, correct: 0, ema: 0, lastAt: 0 };
    grammar[id] = {
      attempts: m.attempts + 1,
      correct: m.correct + (result.correct ? 1 : 0),
      ema: m.attempts === 0 ? score : Math.round(0.3 * score + 0.7 * m.ema),
      lastAt: Math.max(m.lastAt, at),
    };
  }
  const attempt: Attempt = {
    exerciseId: exercise.id,
    kind: exercise.kind,
    grammarPointIds: exercise.grammarPointIds,
    score,
    correct: result.correct,
    at,
    day,
  };
  return { ...state, grammar, attempts: [attempt, ...state.attempts].slice(0, MAX_ATTEMPTS) };
}

export interface FinishedSession {
  kind: ActivityKind;
  refId: string;
  level: CefrLevel | null;
  /** 0 to 100, or null for unscored practice. */
  score: number | null;
  minutes: number;
  /** Set for a lesson: it counts as completed the first time it is finished. */
  lessonId?: string;
  placementLevel?: CefrLevel;
}

/** Ends a practice session: the summary, the pending activity for sync, and the lesson record. */
export function finishSession(
  state: LearningState,
  session: FinishedSession,
  at: number,
  day: string,
): { state: LearningState; activity: Activity } {
  const lessons = { ...state.lessons };
  let completedLesson = false;
  if (session.lessonId) {
    const previous = lessons[session.lessonId];
    completedLesson = !previous;
    lessons[session.lessonId] = {
      completedAt: previous?.completedAt ?? at,
      bestScore: Math.max(previous?.bestScore ?? 0, session.score ?? 0),
    };
  }
  const activity: Activity = {
    kind: session.kind,
    refId: session.refId,
    level: session.level,
    score: session.score,
    minutes: Math.max(1, Math.round(session.minutes)),
    day,
    at,
    ...(completedLesson ? { completedLesson: true } : {}),
    ...(session.placementLevel ? { placementLevel: session.placementLevel } : {}),
  };
  return {
    activity,
    state: {
      ...state,
      lessons,
      summary: applyActivity(state.summary, activity),
      pending: [...state.pending, activity].slice(-MAX_PENDING),
    },
  };
}

export function reviewCard(state: LearningState, cardId: string, grade: Grade, now: Date): LearningState {
  const next = review(state.cards[cardId], grade, now);
  return { ...state, cards: { ...state.cards, [cardId]: { ...next, updatedAt: now.getTime() } } };
}

/** Adds cards (from the MCP inbox, say), skipping any whose front is already in the deck. */
export function addCustomCards(
  state: LearningState,
  cards: readonly { front: string; back: string; example?: string }[],
  at: number,
): { state: LearningState; added: number } {
  const known = new Set(state.customCards.map((c) => c.front.trim().toLowerCase()));
  const added: CustomCard[] = [];
  for (const card of cards) {
    const front = card.front?.trim();
    const back = card.back?.trim();
    if (!front || !back || known.has(front.toLowerCase())) continue;
    known.add(front.toLowerCase());
    added.push({
      id: `card.custom.${at.toString(36)}-${state.customCards.length + added.length}`,
      front: front.slice(0, 240),
      back: back.slice(0, 240),
      ...(card.example ? { example: card.example.slice(0, 240) } : {}),
      addedAt: at,
    });
  }
  return { added: added.length, state: { ...state, customCards: [...state.customCards, ...added].slice(-MAX_CUSTOM_CARDS) } };
}

export function recordPronunciation(
  state: LearningState,
  phonemes: readonly { symbol: string; accuracy: number }[],
  at: number,
  day: string,
): LearningState {
  return { ...state, sounds: recordPhonemes(state.sounds, phonemes, at, day) };
}

export function recordDrill(
  state: LearningState,
  soundId: string,
  score: number,
  mode: "drill" | "review",
  at: number,
  day: string,
): { state: LearningState; stepPassed: boolean; fixed: boolean } {
  const current = state.sounds[soundId];
  if (mode === "review" && current) {
    return { state: { ...state, sounds: { ...state.sounds, [soundId]: recordReview(current, score, at, day) } }, stepPassed: false, fixed: false };
  }
  const outcome = recordDrillTake(current, score, at, day);
  return { state: { ...state, sounds: { ...state.sounds, [soundId]: outcome.mastery } }, stepPassed: outcome.stepPassed, fixed: outcome.fixed };
}

/** Accuracy per grammar point, for weighting practice sets. */
export function grammarAccuracy(state: LearningState): Record<string, { attempts: number; correct: number }> {
  return state.grammar;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** The next batch for POST /api/sync/summary. */
export function summaryBatch(state: LearningState): Activity[] {
  return state.pending.slice(0, SUMMARY_BATCH);
}

/**
 * After the server applied `sent` activities: drop them from the queue and
 * take the server's summary, which includes other devices, then re-apply
 * anything still queued so local practice is not hidden until the next sync.
 */
export function afterSummarySync(state: LearningState, sent: number, server: ProgressSummary | null): LearningState {
  const pending = state.pending.slice(sent);
  if (!server) return { ...state, pending };
  const summary = pending.reduce((s, activity) => applyActivity(s, activity), server);
  return { ...state, pending, summary };
}

/** Detail that changed since the last push, for POST /api/sync/push (Plus). */
export function detailSince(state: LearningState, since: number) {
  const cards = Object.fromEntries(Object.entries(state.cards).filter(([, card]) => card.updatedAt > since));
  const sounds = Object.fromEntries(Object.entries(state.sounds).filter(([, m]) => m.lastAt > since));
  const grammar = Object.fromEntries(Object.entries(state.grammar).filter(([, m]) => m.lastAt > since));
  const attempts = state.attempts.filter((a) => a.at > since).reverse();
  return { cards, sounds, grammar, attempts };
}

export interface RemoteDetail {
  cards?: Record<string, CardRecord>;
  sounds?: SoundMasteryMap;
  grammar?: Record<string, GrammarMastery>;
}

/** Last writer wins per card, sound and grammar point. */
export function mergeRemoteDetail(state: LearningState, remote: RemoteDetail): LearningState {
  const cards = { ...state.cards };
  for (const [id, card] of Object.entries(remote.cards ?? {})) {
    if (!cards[id] || (card.updatedAt ?? 0) > cards[id].updatedAt) cards[id] = card;
  }
  const grammar = { ...state.grammar };
  for (const [id, m] of Object.entries(remote.grammar ?? {})) {
    if (!grammar[id] || (m.lastAt ?? 0) > grammar[id].lastAt) grammar[id] = m;
  }
  return { ...state, cards, grammar, sounds: mergeMastery(state.sounds, remote.sounds ?? {}) };
}
