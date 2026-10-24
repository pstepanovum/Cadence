// FILE: src/lib/server/sync-input.ts
//
// Validation for the sync API's request bodies. Pure: the routes and the MCP
// tools parse with these, and tests cover them without a database. Anything
// that does not validate is refused whole, never half-applied.
import { ACTIVITY_KINDS, isDayKey, type Activity, type ActivityKind } from "../platform/progress-model";
import { isCefrLevel, isContentId } from "../platform/content-model";

export const MAX_ACTIVITIES = 50;
export const MAX_CARDS_PER_PUSH = 2000;
export const MAX_ATTEMPTS_PER_PUSH = 500;
export const MAX_COACH_PER_PUSH = 20;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

function isKind(value: unknown): value is ActivityKind {
  return typeof value === "string" && (ACTIVITY_KINDS as readonly string[]).includes(value);
}

/** Ids from content, or a free-form key a client made up (an MCP card, a placement run). */
export function isRefId(value: unknown): value is string {
  return typeof value === "string" && (isContentId(value) || /^[a-z0-9][a-z0-9._:-]{0,95}$/.test(value));
}

export function parseActivity(raw: unknown, now = Date.now()): Parsed<Activity> {
  if (!raw || typeof raw !== "object") return fail("Each activity must be an object.");
  const a = raw as Record<string, unknown>;
  if (!isKind(a.kind)) return fail("Unknown activity kind.");
  if (!isRefId(a.refId)) return fail("refId is not a valid id.");
  if (a.level !== null && a.level !== undefined && !isCefrLevel(a.level)) return fail("level must be a CEFR level or null.");
  if (a.score !== null && a.score !== undefined && (typeof a.score !== "number" || !Number.isFinite(a.score))) return fail("score must be a number or null.");
  if (typeof a.minutes !== "number" || !Number.isFinite(a.minutes) || a.minutes < 0 || a.minutes > 600) return fail("minutes must be between 0 and 600.");
  if (!isDayKey(a.day)) return fail("day must be YYYY-MM-DD.");
  if (typeof a.at !== "number" || !Number.isFinite(a.at) || a.at < 1_500_000_000_000 || a.at > now + 36 * 3600_000) return fail("at must be a recent time in milliseconds.");
  if (a.placementLevel !== undefined && !isCefrLevel(a.placementLevel)) return fail("placementLevel must be a CEFR level.");
  return {
    ok: true,
    value: {
      kind: a.kind,
      refId: a.refId,
      level: (a.level as Activity["level"]) ?? null,
      score: typeof a.score === "number" ? a.score : null,
      minutes: a.minutes,
      day: a.day,
      at: a.at,
      ...(a.completedLesson === true ? { completedLesson: true } : {}),
      ...(isCefrLevel(a.placementLevel) ? { placementLevel: a.placementLevel } : {}),
    },
  };
}

export function parseActivities(raw: unknown, now = Date.now()): Parsed<Activity[]> {
  const list = (raw as { activities?: unknown } | null)?.activities;
  if (!Array.isArray(list) || list.length === 0) return fail("activities must be a non-empty array.");
  if (list.length > MAX_ACTIVITIES) return fail(`At most ${MAX_ACTIVITIES} activities per request.`);
  const out: Activity[] = [];
  for (const item of list) {
    const parsed = parseActivity(item, now);
    if (!parsed.ok) return parsed;
    out.push(parsed.value);
  }
  return { ok: true, value: out.sort((x, y) => x.at - y.at) };
}

// Plus detail ------------------------------------------------------------------

export interface CardRecord {
  [field: string]: number | string | boolean | null;
  updatedAt: number;
}

export interface AttemptRecord {
  id: string;
  kind: ActivityKind;
  refId: string;
  at: number;
  score: number | null;
  /** Per-sound or per-gap detail, kept small. */
  detail?: Record<string, unknown>;
}

export interface SoundMastery {
  attempts: number;
  ema: number;
  best: number;
  lastAt: number;
  history: { day: string; score: number }[];
}

export interface GrammarMastery {
  attempts: number;
  correct: number;
  ema: number;
  lastAt: number;
}

export interface CoachSessionRecord {
  id: string;
  scenarioId: string | null;
  startedAt: number;
  endedAt: number | null;
  turnCount: number;
  summary: string;
  transcript: { role: "coach" | "learner"; text: string }[];
  updatedAt: number;
}

export interface PushInput {
  installId: string;
  platform: string;
  srs: Record<string, Record<string, CardRecord>>;
  attempts: AttemptRecord[];
  mastery: { sounds: Record<string, SoundMastery>; grammar: Record<string, GrammarMastery> };
  coach: CoachSessionRecord[];
}

const INSTALL_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PACK_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;

function num(value: unknown, min = -1e12, max = 1e13): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function parseCard(raw: unknown): CardRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 16) return null;
  const card: Record<string, number | string | boolean | null> = {};
  for (const [key, value] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,23}$/.test(key)) return null;
    if (typeof value === "string" && value.length <= 40) card[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) card[key] = value;
    else if (typeof value === "boolean" || value === null) card[key] = value;
    else return null;
  }
  if (num(card.updatedAt, 0) === null) return null;
  return card as CardRecord;
}

export function parsePush(raw: unknown): Parsed<PushInput> {
  if (!raw || typeof raw !== "object") return fail("Body must be an object.");
  const body = raw as Record<string, unknown>;
  if (typeof body.installId !== "string" || !INSTALL_ID.test(body.installId)) return fail("installId is required.");
  const platform = typeof body.platform === "string" && /^(ios|android|web|desktop)$/.test(body.platform) ? body.platform : "unknown";

  const srs: PushInput["srs"] = {};
  let cards = 0;
  for (const [packId, deck] of Object.entries((body.srs ?? {}) as Record<string, unknown>)) {
    if (!PACK_ID.test(packId) || !deck || typeof deck !== "object") return fail("srs must map pack ids to cards.");
    srs[packId] = {};
    for (const [cardId, card] of Object.entries(deck as Record<string, unknown>)) {
      if (!isRefId(cardId)) return fail(`Bad card id ${String(cardId).slice(0, 40)}.`);
      const parsed = parseCard(card);
      if (!parsed) return fail(`Card ${cardId} has a bad state.`);
      srs[packId][cardId] = parsed;
      if (++cards > MAX_CARDS_PER_PUSH) return fail(`At most ${MAX_CARDS_PER_PUSH} cards per push.`);
    }
  }

  const attemptsRaw = Array.isArray(body.attempts) ? body.attempts : [];
  if (attemptsRaw.length > MAX_ATTEMPTS_PER_PUSH) return fail(`At most ${MAX_ATTEMPTS_PER_PUSH} attempts per push.`);
  const attempts: AttemptRecord[] = [];
  for (const item of attemptsRaw) {
    const a = (item ?? {}) as Record<string, unknown>;
    if (typeof a.id !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(a.id) || !isKind(a.kind) || !isRefId(a.refId) || num(a.at, 1_500_000_000_000) === null) return fail("Each attempt needs id, kind, refId and at.");
    const detail = a.detail && typeof a.detail === "object" && JSON.stringify(a.detail).length <= 2000 ? (a.detail as Record<string, unknown>) : undefined;
    attempts.push({ id: a.id, kind: a.kind, refId: a.refId, at: a.at as number, score: num(a.score, 0, 100), ...(detail ? { detail } : {}) });
  }

  const masteryRaw = (body.mastery ?? {}) as { sounds?: unknown; grammar?: unknown };
  const sounds: Record<string, SoundMastery> = {};
  for (const [id, value] of Object.entries((masteryRaw.sounds ?? {}) as Record<string, unknown>)) {
    const v = (value ?? {}) as Record<string, unknown>;
    if (!isRefId(id) || num(v.attempts, 0) === null || num(v.ema, 0, 100) === null || num(v.lastAt, 0) === null) return fail("Bad sound mastery.");
    const history = (Array.isArray(v.history) ? v.history : [])
      .filter((h): h is { day: string; score: number } => isDayKey((h as { day?: unknown })?.day) && num((h as { score?: unknown })?.score, 0, 100) !== null)
      .slice(-30);
    sounds[id] = { attempts: v.attempts as number, ema: v.ema as number, best: num(v.best, 0, 100) ?? (v.ema as number), lastAt: v.lastAt as number, history };
  }
  const grammar: Record<string, GrammarMastery> = {};
  for (const [id, value] of Object.entries((masteryRaw.grammar ?? {}) as Record<string, unknown>)) {
    const v = (value ?? {}) as Record<string, unknown>;
    if (!isRefId(id) || num(v.attempts, 0) === null || num(v.correct, 0) === null || num(v.ema, 0, 100) === null || num(v.lastAt, 0) === null) return fail("Bad grammar mastery.");
    grammar[id] = { attempts: v.attempts as number, correct: v.correct as number, ema: v.ema as number, lastAt: v.lastAt as number };
  }

  const coachRaw = Array.isArray(body.coach) ? body.coach : [];
  if (coachRaw.length > MAX_COACH_PER_PUSH) return fail(`At most ${MAX_COACH_PER_PUSH} coach sessions per push.`);
  const coach: CoachSessionRecord[] = [];
  for (const item of coachRaw) {
    const c = (item ?? {}) as Record<string, unknown>;
    if (typeof c.id !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(c.id) || num(c.startedAt, 0) === null || num(c.updatedAt, 0) === null) return fail("Each coach session needs id, startedAt and updatedAt.");
    const transcript = (Array.isArray(c.transcript) ? c.transcript : [])
      .slice(-60)
      .map((t) => t as { role?: unknown; text?: unknown })
      .filter((t) => (t.role === "coach" || t.role === "learner") && typeof t.text === "string")
      .map((t) => ({ role: t.role as "coach" | "learner", text: (t.text as string).slice(0, 1200) }));
    coach.push({
      id: c.id,
      scenarioId: isContentId(c.scenarioId, "scenario") ? c.scenarioId : null,
      startedAt: c.startedAt as number,
      endedAt: num(c.endedAt, 0),
      turnCount: num(c.turnCount, 0, 1000) ?? transcript.length,
      summary: typeof c.summary === "string" ? c.summary.slice(0, 600) : "",
      transcript,
      updatedAt: c.updatedAt as number,
    });
  }

  return { ok: true, value: { installId: body.installId, platform, srs, attempts, mastery: { sounds, grammar }, coach } };
}

/** Merges cards last-writer-wins by updatedAt; returns the merged deck and how many changed. */
export function mergeCards(stored: Record<string, CardRecord>, incoming: Record<string, CardRecord>): { cards: Record<string, CardRecord>; changed: number } {
  const cards = { ...stored };
  let changed = 0;
  for (const [id, card] of Object.entries(incoming)) {
    const current = cards[id];
    if (!current || card.updatedAt > current.updatedAt) {
      cards[id] = card;
      changed += 1;
    }
  }
  return { cards, changed };
}

/** Last-writer-wins by lastAt, per key. */
export function mergeByLastAt<T extends { lastAt: number }>(stored: Record<string, T>, incoming: Record<string, T>): { merged: Record<string, T>; changed: number } {
  const merged = { ...stored };
  let changed = 0;
  for (const [id, value] of Object.entries(incoming)) {
    if (!merged[id] || value.lastAt > merged[id].lastAt) {
      merged[id] = value;
      changed += 1;
    }
  }
  return { merged, changed };
}
