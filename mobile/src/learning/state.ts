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
import { emptyMastery, mergeMastery, recordDrillTake, recordPhonemes, recordReview, type SoundMasteryMap } from "../practice/sound-coach.ts";
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

/**
 * Practice by local day and the counters badges need. Device-local in every
 * tier; the streak, badges and daily goal are computed from it
 * (src/engagement/).
 */
export interface ActivityLog {
  /** Minutes practised per local day (YYYY-MM-DD), the last ACTIVITY_DAYS_KEPT days. */
  days: Record<string, number>;
  cardsReviewed: number;
  perfectQuizzes: number;
  conversations: number;
  /** Badge id to the time it was earned. */
  badges: Record<string, number>;
}

export const ACTIVITY_DAYS_KEPT = 400;

export function emptyActivity(): ActivityLog {
  return { days: {}, cardsReviewed: 0, perfectQuizzes: 0, conversations: 0, badges: {} };
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
  activity: ActivityLog;
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
    activity: emptyActivity(),
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
    activity: parseActivity(raw.activity),
    sync: isObject(raw.sync) ? { ...base.sync, ...(raw.sync as Partial<SyncMarks>) } : base.sync,
  };
}

const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

function parseActivity(raw: unknown): ActivityLog {
  if (!isObject(raw)) return emptyActivity();
  const days: Record<string, number> = {};
  if (isObject(raw.days)) {
    for (const [day, minutes] of Object.entries(raw.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && typeof minutes === "number" && minutes >= 0) days[day] = minutes;
    }
  }
  const badges: Record<string, number> = {};
  if (isObject(raw.badges)) {
    for (const [id, at] of Object.entries(raw.badges)) if (typeof at === "number") badges[id] = at;
  }
  return { days, cardsReviewed: count(raw.cardsReviewed), perfectQuizzes: count(raw.perfectQuizzes), conversations: count(raw.conversations), badges };
}

/** Adds practice minutes to a day, keeping only the most recent days. */
export function logMinutes(activity: ActivityLog, day: string, minutes: number): ActivityLog {
  const days = { ...activity.days, [day]: (activity.days[day] ?? 0) + Math.max(0, minutes) };
  const keys = Object.keys(days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - ACTIVITY_DAYS_KEPT))) delete days[old];
  return { ...activity, days };
}

/** Marks badges as earned, keeping the first time each was earned. */
export function earnBadges(state: LearningState, ids: readonly string[], at: number): LearningState {
  const fresh = ids.filter((id) => !(id in state.activity.badges));
  if (fresh.length === 0) return state;
  const badges = { ...state.activity.badges };
  for (const id of fresh) badges[id] = at;
  return { ...state, activity: { ...state.activity, badges } };
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

/**
 * A refId the sync API accepts: a content id, or a lowercase key of letters,
 * digits and . _ : - (src/lib/server/sync-input.ts). The server refuses a
 * whole batch over one bad id, so "flashcards:B2" would block the queue.
 */
export function syncRefId(refId: string): string {
  const cleaned = refId
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 96);
  return cleaned || "practice";
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
    refId: syncRefId(session.refId),
    level: session.level,
    score: session.score,
    minutes: Math.max(1, Math.round(session.minutes)),
    day,
    at,
    ...(completedLesson ? { completedLesson: true } : {}),
    ...(session.placementLevel ? { placementLevel: session.placementLevel } : {}),
  };
  let log = logMinutes(state.activity, day, activity.minutes);
  if (session.kind === "quiz" && session.score === 100) log = { ...log, perfectQuizzes: log.perfectQuizzes + 1 };
  if (session.kind === "coach") log = { ...log, conversations: log.conversations + 1 };
  return {
    activity,
    state: {
      ...state,
      lessons,
      activity: log,
      summary: applyActivity(state.summary, activity),
      pending: [...state.pending, activity].slice(-MAX_PENDING),
    },
  };
}

export function reviewCard(state: LearningState, cardId: string, grade: Grade, now: Date): LearningState {
  const next = review(state.cards[cardId], grade, now);
  return {
    ...state,
    cards: { ...state.cards, [cardId]: { ...next, updatedAt: now.getTime() } },
    activity: { ...state.activity, cardsReviewed: state.activity.cardsReviewed + 1 },
  };
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
  // Activities queued before refIds were normalized are fixed on the way out.
  return state.pending.slice(0, SUMMARY_BATCH).map((activity) => ({ ...activity, refId: syncRefId(activity.refId) }));
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

/** The server keeps device-learned cards and added cards in separate deck documents. */
export function deckFor(cardId: string): "custom" | "cards" {
  return cardId.startsWith("card.custom.") || cardId.startsWith("card.mcp.") ? "custom" : "cards";
}

function attemptKind(kind: string): ActivityKind {
  switch (kind) {
    case "matching":
      return "matching";
    case "sentence_building":
      return "sentence_building";
    case "flashcard":
      return "flashcards";
    case "minimal_pair":
      return "pronunciation";
    default:
      return "quiz";
  }
}

/** A stable id per attempt, in the server's alphabet. */
function attemptId(attempt: Attempt): string {
  let hash = 5381;
  for (const char of attempt.exerciseId) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `${attempt.at.toString(36)}-${hash.toString(36)}`;
}

export const MAX_CARDS_PER_PUSH = 2000;

export interface PushPayload {
  installId: string;
  platform: "ios" | "android";
  srs: Record<string, Record<string, CardRecord>>;
  attempts: { id: string; kind: ActivityKind; refId: string; at: number; score: number; detail: { correct: boolean; grammarPointIds: string[] } }[];
  mastery: {
    sounds: Record<string, { attempts: number; ema: number; best: number; lastAt: number; history: { day: string; score: number }[] }>;
    grammar: Record<string, GrammarMastery>;
  };
}

/**
 * Detail in the shape POST /api/sync/import and /api/sync/push take
 * (src/lib/server/sync-input.ts): cards grouped into decks, attempts with an
 * id and an activity kind, sound mastery without the phone's ladder state.
 * Split so no request carries more than MAX_CARDS_PER_PUSH cards; the first
 * also carries the attempts and mastery.
 */
export function pushPayloads(installId: string, platform: PushPayload["platform"], detail: ReturnType<typeof detailSince>): PushPayload[] {
  const entries = Object.entries(detail.cards);
  const payloads: PushPayload[] = [];
  for (let start = 0; start === 0 || start < entries.length; start += MAX_CARDS_PER_PUSH) {
    const srs: PushPayload["srs"] = {};
    for (const [id, card] of entries.slice(start, start + MAX_CARDS_PER_PUSH)) {
      const deck = deckFor(id);
      srs[deck] = { ...srs[deck], [id]: card };
    }
    payloads.push({ installId, platform, srs, attempts: [], mastery: { sounds: {}, grammar: {} } });
  }
  payloads[0].attempts = detail.attempts.slice(-500).map((a) => ({
    id: attemptId(a),
    kind: attemptKind(a.kind),
    refId: syncRefId(a.exerciseId),
    at: a.at,
    score: Math.max(0, Math.min(100, a.score)),
    detail: { correct: a.correct, grammarPointIds: a.grammarPointIds.slice(0, 10) },
  }));
  payloads[0].mastery = {
    sounds: Object.fromEntries(
      Object.entries(detail.sounds).map(([id, m]) => [id, { attempts: m.attempts, ema: m.ema, best: m.best, lastAt: m.lastAt, history: m.history.map((h) => ({ day: h.day, score: h.score })) }]),
    ),
    grammar: detail.grammar,
  };
  return payloads;
}

/**
 * GET /api/sync/pull as RemoteDetail: decks flattened into one card map, and
 * sound records completed with the phone's own ladder state, which the
 * server does not keep.
 */
export function remoteFromPull(pulled: unknown, localSounds: SoundMasteryMap): RemoteDetail {
  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
  const body = isObject(pulled) ? pulled : {};
  const cards: Record<string, CardRecord> = {};
  for (const deck of Object.values(isObject(body.srs) ? body.srs : {})) {
    if (!isObject(deck)) continue;
    for (const [id, card] of Object.entries(deck)) if (isObject(card) && typeof card.updatedAt === "number") cards[id] = card as unknown as CardRecord;
  }
  const mastery = isObject(body.mastery) ? body.mastery : {};
  const sounds: SoundMasteryMap = {};
  for (const [id, raw] of Object.entries(isObject(mastery.sounds) ? mastery.sounds : {})) {
    if (!isObject(raw) || typeof raw.lastAt !== "number") continue;
    const base = localSounds[id] ?? emptyMastery();
    const history = Array.isArray(raw.history)
      ? (raw.history as { day?: unknown; score?: unknown }[])
          .filter((h) => typeof h.day === "string" && typeof h.score === "number")
          .map((h) => ({ day: h.day as string, score: h.score as number, takes: 1 }))
      : base.history;
    sounds[id] = { ...base, attempts: Number(raw.attempts) || base.attempts, ema: Number(raw.ema) || 0, best: Number(raw.best) || base.best, lastAt: raw.lastAt, history };
  }
  const grammar = isObject(mastery.grammar) ? (mastery.grammar as Record<string, GrammarMastery>) : undefined;
  return { cards, sounds, grammar };
}

/** The pull cursor as the phone stores it; the server sends milliseconds. */
export function pullCursorOf(pulled: unknown): string | null {
  const cursor = typeof pulled === "object" && pulled !== null ? (pulled as { cursor?: unknown }).cursor : null;
  if (typeof cursor === "number" && Number.isFinite(cursor)) return String(cursor);
  return typeof cursor === "string" && cursor ? cursor : null;
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
