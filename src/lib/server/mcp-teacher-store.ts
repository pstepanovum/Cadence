// FILE: src/lib/server/mcp-teacher-store.ts
//
// What the connector's teacher tools and the apps share in Firestore for the
// advanced material (docs/PLATFORM.md sections 17 to 19):
//
//   users/{uid}/practice/inbox   every signed-in account: the practice list the
//                                learner's assistant assigned (at most 200
//                                items) and, for a free account, the drill
//                                results the assistant logged, waiting for a
//                                device to apply them (at most 200)
//   users/{uid}/advanced/state   Plus: phrase and slang review state, the
//                                plateau track, and recording metadata (never
//                                audio), one document, merged by the apps
//                                through /api/sync/advanced
//
// Every function takes the verified uid; the Admin SDK bypasses the rules.
import type { Firestore } from "firebase-admin/firestore";

import { newerTrack, parseTrack, recordDrill, type Track } from "../platform/fossilization";
import { addToPracticeList, removeFromPracticeList, PRACTICE_LIST_CAP, type PracticeListItem } from "../platform/phrase-bank";
import { isRecordingMeta, mergeMeta, MAX_SYNCED_META, type RecordingMeta } from "../platform/recordings";
import { review, type CardState, type Grade } from "../platform/srs";
import { db as defaultDb } from "./firebase";

export const REVIEW_INBOX_CAP = 200;
const GRADES: Grade[] = ["again", "hard", "good", "easy"];
const ITEM_ID = /^(phrase|slang)\.[a-z0-9][a-z0-9-]{0,88}$/;
const STEP_ID = /^(fossil\.[a-z0-9-]{1,80}#[a-z]{1,3}\d{1,3}|own\.[a-z0-9]{1,16})$/;

export const isReviewItemId = (id: unknown): id is string => typeof id === "string" && ITEM_ID.test(id);
export const isDrillStepId = (id: unknown): id is string => typeof id === "string" && STEP_ID.test(id);

export interface ConnectorReview {
  itemId: string;
  grade: Grade;
  at: number;
}

export type StoredCard = CardState & { updatedAt: number };

export interface AdvancedState {
  cards: Record<string, StoredCard>;
  track: Track | null;
  recordings: RecordingMeta[];
  updatedAt: number;
}

const practiceRef = (firestore: Firestore, uid: string) => firestore.collection("users").doc(uid).collection("practice").doc("inbox");
const advancedRef = (firestore: Firestore, uid: string) => firestore.collection("users").doc(uid).collection("advanced").doc("state");

// Validation (pure) ---------------------------------------------------------

function isCard(value: unknown): value is StoredCard {
  if (!value || typeof value !== "object") return false;
  const c = value as StoredCard;
  return [c.reps, c.interval, c.ease, c.lapses, c.updatedAt].every((n) => Number.isFinite(n)) && typeof c.due === "string" && (c.due === "" || /^\d{4}-\d{2}-\d{2}$/.test(c.due)) && c.ease >= 1 && c.ease <= 5 && c.interval >= 0 && c.interval <= 3650;
}

export interface AdvancedPush {
  installId: string;
  cards: Record<string, StoredCard>;
  track: Track | null;
  recordings: { upsert: RecordingMeta[]; remove: string[] };
}

/** The body of POST /api/sync/advanced, or a message saying what is wrong with it. */
export function parseAdvancedPush(body: Record<string, unknown> | null): { ok: true; push: AdvancedPush } | { ok: false; message: string } {
  if (!body) return { ok: false, message: "Send a JSON object." };
  const installId = body.installId;
  if (typeof installId !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(installId)) return { ok: false, message: "installId is missing or malformed." };
  const cards: Record<string, StoredCard> = {};
  if (body.cards !== undefined) {
    if (!body.cards || typeof body.cards !== "object" || Array.isArray(body.cards)) return { ok: false, message: "cards must be an object keyed by item id." };
    const entries = Object.entries(body.cards as Record<string, unknown>);
    if (entries.length > 5000) return { ok: false, message: "At most 5,000 cards per push." };
    for (const [id, card] of entries) {
      if (!isReviewItemId(id) || !isCard(card)) return { ok: false, message: `Card ${id.slice(0, 60)} is malformed.` };
      cards[id] = { reps: card.reps, interval: card.interval, ease: card.ease, due: card.due, lapses: card.lapses, updatedAt: card.updatedAt };
    }
  }
  let track: Track | null = null;
  if (body.track !== undefined && body.track !== null) {
    track = parseTrack(body.track);
    if (!track) return { ok: false, message: "track is malformed." };
    if (JSON.stringify(track).length > 200_000) return { ok: false, message: "track is too large." };
  }
  const upsert: RecordingMeta[] = [];
  const remove: string[] = [];
  if (body.recordings !== undefined) {
    const r = body.recordings as { upsert?: unknown; remove?: unknown };
    if (!r || typeof r !== "object") return { ok: false, message: "recordings must be {upsert, remove}." };
    if (r.upsert !== undefined && (!Array.isArray(r.upsert) || r.upsert.length > MAX_SYNCED_META || !r.upsert.every(isRecordingMeta))) return { ok: false, message: "recordings.upsert must be recording metadata." };
    if (r.remove !== undefined && (!Array.isArray(r.remove) || r.remove.length > 1000 || !r.remove.every((id) => typeof id === "string" && id.length <= 48))) return { ok: false, message: "recordings.remove must be ids." };
    upsert.push(...((r.upsert as RecordingMeta[] | undefined) ?? []));
    remove.push(...((r.remove as string[] | undefined) ?? []));
  }
  return { ok: true, push: { installId, cards, track, recordings: { upsert, remove } } };
}

/** Last writer wins per card, by updatedAt. */
export function mergeCards(current: Record<string, StoredCard>, incoming: Record<string, StoredCard>): { cards: Record<string, StoredCard>; changed: number } {
  const cards = { ...current };
  let changed = 0;
  for (const [id, card] of Object.entries(incoming)) {
    if (!cards[id] || card.updatedAt > cards[id].updatedAt) {
      cards[id] = card;
      changed += 1;
    }
  }
  return { cards, changed };
}

function readState(data: FirebaseFirestore.DocumentData | undefined): AdvancedState {
  return {
    cards: (data?.cards ?? {}) as Record<string, StoredCard>,
    track: parseTrack(data?.track ?? null),
    recordings: Array.isArray(data?.recordings) ? (data!.recordings as unknown[]).filter(isRecordingMeta) : [],
    updatedAt: Number(data?.updatedAt) || 0,
  };
}

// Practice list and review inbox (every signed-in account) -------------------

export async function readPractice(uid: string, firestore: Firestore = defaultDb()): Promise<{ list: PracticeListItem[]; reviews: ConnectorReview[] }> {
  const data = (await practiceRef(firestore, uid).get()).data();
  return { list: (data?.list ?? []) as PracticeListItem[], reviews: (data?.reviews ?? []) as ConnectorReview[] };
}

export async function assignPractice(uid: string, items: { itemId: string; note?: string }[], firestore: Firestore = defaultDb(), now = Date.now()): Promise<{ added: number; total: number }> {
  const ref = practiceRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const list = (data?.list ?? []) as PracticeListItem[];
    const next = addToPracticeList(
      list,
      items.map((item, i) => ({ itemId: item.itemId, addedAt: now + i, source: "connector" as const, ...(item.note ? { note: item.note.slice(0, 200) } : {}) })),
    );
    tx.set(ref, { list: next, reviews: data?.reviews ?? [], updatedAt: now });
    return { added: next.filter((n) => !list.some((l) => l.itemId === n.itemId)).length, total: next.length };
  });
}

export async function unassignPractice(uid: string, itemIds: string[], firestore: Firestore = defaultDb(), now = Date.now()): Promise<number> {
  const ref = practiceRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return 0;
    const list = (snapshot.data()?.list ?? []) as PracticeListItem[];
    const next = removeFromPracticeList(list, itemIds);
    tx.set(ref, { ...snapshot.data(), list: next, updatedAt: now });
    return list.length - next.length;
  });
}

/** A free account's logged drill results wait here for a device. */
export async function queueReviews(uid: string, reviews: ConnectorReview[], firestore: Firestore = defaultDb(), now = Date.now()): Promise<{ queued: number; dropped: number }> {
  const ref = practiceRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    const existing = (data?.reviews ?? []) as ConnectorReview[];
    const room = Math.max(0, REVIEW_INBOX_CAP - existing.length);
    const added = reviews.slice(0, room);
    tx.set(ref, { list: data?.list ?? [], reviews: [...existing, ...added], updatedAt: now });
    return { queued: added.length, dropped: reviews.length - added.length };
  });
}

/** A device took the queued reviews (and, optionally, finished some listed items). */
export async function acknowledgePractice(uid: string, input: { reviewsUpTo?: number; done?: string[] }, firestore: Firestore = defaultDb(), now = Date.now()): Promise<{ reviews: number; done: number }> {
  const ref = practiceRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { reviews: 0, done: 0 };
    const reviews = (snapshot.data()?.reviews ?? []) as ConnectorReview[];
    const list = (snapshot.data()?.list ?? []) as PracticeListItem[];
    const keepReviews = input.reviewsUpTo === undefined ? reviews : reviews.filter((r) => r.at > input.reviewsUpTo!);
    const keepList = input.done?.length ? removeFromPracticeList(list, input.done) : list;
    if (keepReviews.length === 0 && keepList.length === 0) tx.delete(ref);
    else tx.set(ref, { list: keepList, reviews: keepReviews, updatedAt: now });
    return { reviews: reviews.length - keepReviews.length, done: list.length - keepList.length };
  });
}

// Plus detail ----------------------------------------------------------------

export async function readAdvanced(uid: string, firestore: Firestore = defaultDb()): Promise<AdvancedState> {
  return readState((await advancedRef(firestore, uid).get()).data());
}

/** Merges a device's push into the account's state and returns the merged state. */
export async function mergeAdvanced(uid: string, push: AdvancedPush, firestore: Firestore = defaultDb(), now = Date.now()): Promise<AdvancedState & { cardsChanged: number }> {
  const ref = advancedRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const current = readState((await tx.get(ref)).data());
    const { cards, changed } = mergeCards(current.cards, push.cards);
    const track = newerTrack(current.track, push.track);
    const recordings = mergeMeta(current.recordings, push.recordings.upsert, push.recordings.remove);
    const next: AdvancedState = { cards, track, recordings, updatedAt: now };
    tx.set(ref, { ...next, lastInstallId: push.installId });
    return { ...next, cardsChanged: changed };
  });
}

/**
 * Plus: drill results the connector logged go straight into review state,
 * phrases and slang into `cards`, plateau steps into the track.
 */
export async function applyConnectorReviews(uid: string, reviews: ConnectorReview[], day: string, firestore: Firestore = defaultDb(), now = Date.now()): Promise<{ applied: number }> {
  const ref = advancedRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const state = readState((await tx.get(ref)).data());
    const cards = { ...state.cards };
    let track = state.track;
    let applied = 0;
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y, m - 1, d, 12);
    for (const r of reviews) {
      if (!GRADES.includes(r.grade)) continue;
      if (isReviewItemId(r.itemId)) {
        cards[r.itemId] = { ...review(cards[r.itemId], r.grade, date), updatedAt: now };
        applied += 1;
      } else if (track && isDrillStepId(r.itemId)) {
        track = recordDrill(track, r.itemId, r.grade, day, now);
        applied += 1;
      }
    }
    tx.set(ref, { cards, track, recordings: state.recordings, updatedAt: now });
    return { applied };
  });
}

export { PRACTICE_LIST_CAP };
