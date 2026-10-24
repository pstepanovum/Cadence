// FILE: src/lib/server/sync.ts
//
// Progress in Firestore, by data tier (docs/PLATFORM.md section 5):
//
//   every signed-in account   users/{uid}/progress/summary   (ProgressSummary)
//                             users/{uid}/inbox/flashcards   (cards from MCP)
//   Plus only                 users/{uid}/srs/{packId}, mastery/{sounds|grammar},
//                             attempts/{day}, coachSessions/{id}, devices/{installId}
//
// Free accounts never write anything but the summary and the inbox; the
// routes check the tier before calling the Plus functions here, and these
// functions check it again inside their transaction.
import type { Firestore } from "firebase-admin/firestore";

import { applyActivity, emptySummary, SUMMARY_SCHEMA_VERSION, type Activity, type ProgressSummary } from "../platform/progress-model";
import { readAccount } from "./entitlement";
import { db as defaultDb } from "./firebase";
import { mailKey, queueMailInTx } from "./email/queue";
import { mergeByLastAt, mergeCards, type AttemptRecord, type CardRecord, type GrammarMastery, type PushInput, type SoundMastery } from "./sync-input";

export const INBOX_CAP = 200;
const ATTEMPTS_PER_DOC = 500;

function userRef(firestore: Firestore, uid: string) {
  return firestore.collection("users").doc(uid);
}

export function summaryRef(firestore: Firestore, uid: string) {
  return userRef(firestore, uid).collection("progress").doc("summary");
}

export function readSummary(data: FirebaseFirestore.DocumentData | undefined): ProgressSummary {
  if (!data || data.schema !== SUMMARY_SCHEMA_VERSION) return { ...emptySummary(), ...(data ?? {}), schema: SUMMARY_SCHEMA_VERSION } as ProgressSummary;
  return data as ProgressSummary;
}

export async function getSummary(uid: string, firestore: Firestore = defaultDb()): Promise<ProgressSummary> {
  return readSummary((await summaryRef(firestore, uid).get()).data());
}

/** Applies up to 50 activities in one transaction: one read, one write. */
export async function applyActivities(uid: string, activities: Activity[], firestore: Firestore = defaultDb()): Promise<ProgressSummary> {
  const ref = summaryRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    let summary = readSummary((await tx.get(ref)).data());
    for (const activity of activities) summary = applyActivity(summary, activity);
    tx.set(ref, summary);
    return summary;
  });
}

// Inbox (cards added through MCP, waiting for a device) ----------------------------

export interface InboxCard {
  id: string;
  front: string;
  back: string;
  example?: string;
  addedAt: number;
  source: "mcp";
}

function inboxRef(firestore: Firestore, uid: string) {
  return userRef(firestore, uid).collection("inbox").doc("flashcards");
}

export async function addToInbox(uid: string, cards: Omit<InboxCard, "addedAt" | "source">[], firestore: Firestore = defaultDb(), now = Date.now()): Promise<{ queued: number; dropped: number }> {
  const ref = inboxRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const existing = ((await tx.get(ref)).data()?.cards ?? []) as InboxCard[];
    const room = Math.max(0, INBOX_CAP - existing.length);
    const added = cards.slice(0, room).map((card) => ({ ...card, addedAt: now, source: "mcp" as const }));
    tx.set(ref, { cards: [...existing, ...added], updatedAt: now });
    return { queued: added.length, dropped: cards.length - added.length };
  });
}

export async function readInbox(uid: string, firestore: Firestore = defaultDb()): Promise<InboxCard[]> {
  return ((await inboxRef(firestore, uid).get()).data()?.cards ?? []) as InboxCard[];
}

/** Removes delivered cards; the document goes once it is empty. */
export async function acknowledgeInbox(uid: string, ids: string[] | "all", firestore: Firestore = defaultDb()): Promise<number> {
  const ref = inboxRef(firestore, uid);
  return firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return 0;
    const cards = (snapshot.data()?.cards ?? []) as InboxCard[];
    const keep = ids === "all" ? [] : cards.filter((card) => !ids.includes(card.id));
    if (keep.length === 0) tx.delete(ref);
    else tx.set(ref, { cards: keep, updatedAt: Date.now() });
    return cards.length - keep.length;
  });
}

// Plus detail ------------------------------------------------------------------

export class TierError extends Error {}

async function requirePlusInTx(tx: FirebaseFirestore.Transaction, firestore: Firestore, uid: string) {
  const account = readAccount((await tx.get(userRef(firestore, uid))).data());
  if (!account.isPlus) throw new TierError("This needs Cadence Plus.");
}

export interface PushResult {
  cardsChanged: number;
  attemptsAdded: number;
  masteryChanged: number;
  coachSaved: number;
  newDevice: boolean;
  cursor: number;
}

/**
 * Merges a device's detail into the account, last writer wins by each item's
 * own time. `importing` marks the one-time upload on upgrade, recorded on the
 * device so a second import changes nothing.
 */
export async function pushDetail(uid: string, input: PushInput, options: { importing?: boolean; db?: Firestore; now?: number } = {}): Promise<PushResult & { alreadyImported?: boolean }> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const user = userRef(firestore, uid);
  const deviceRef = user.collection("devices").doc(input.installId);

  // Attempts are grouped by day so each day's document is touched once.
  const byDay = new Map<string, AttemptRecord[]>();
  for (const attempt of input.attempts) {
    const day = new Date(attempt.at).toISOString().slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), attempt]);
  }

  return firestore.runTransaction(async (tx) => {
    // Every read first, as transactions require.
    await requirePlusInTx(tx, firestore, uid);
    const device = await tx.get(deviceRef);
    if (options.importing && typeof device.data()?.importedAt === "number") {
      return { cardsChanged: 0, attemptsAdded: 0, masteryChanged: 0, coachSaved: 0, newDevice: false, cursor: now, alreadyImported: true };
    }
    const packIds = Object.keys(input.srs);
    const decks = await Promise.all(packIds.map((packId) => tx.get(user.collection("srs").doc(packId))));
    const soundsRef = user.collection("mastery").doc("sounds");
    const grammarRef = user.collection("mastery").doc("grammar");
    const [sounds, grammar] = await Promise.all([tx.get(soundsRef), tx.get(grammarRef)]);
    const days = [...byDay.keys()];
    const dayDocs = await Promise.all(days.flatMap((day) => [tx.get(user.collection("attempts").doc(day)), tx.get(user.collection("attempts").doc(`${day}-2`))]));
    const coachDocs = await Promise.all(input.coach.map((session) => tx.get(user.collection("coachSessions").doc(session.id))));

    let cardsChanged = 0;
    packIds.forEach((packId, index) => {
      const stored = (decks[index].data()?.cards ?? {}) as Record<string, CardRecord>;
      const merged = mergeCards(stored, input.srs[packId]);
      if (merged.changed > 0) {
        tx.set(user.collection("srs").doc(packId), { cards: merged.cards, updatedAt: now });
        cardsChanged += merged.changed;
      }
    });

    let masteryChanged = 0;
    if (Object.keys(input.mastery.sounds).length) {
      const merged = mergeByLastAt((sounds.data()?.items ?? {}) as Record<string, SoundMastery>, input.mastery.sounds);
      if (merged.changed) tx.set(soundsRef, { items: merged.merged, updatedAt: now });
      masteryChanged += merged.changed;
    }
    if (Object.keys(input.mastery.grammar).length) {
      const merged = mergeByLastAt((grammar.data()?.items ?? {}) as Record<string, GrammarMastery>, input.mastery.grammar);
      if (merged.changed) tx.set(grammarRef, { items: merged.merged, updatedAt: now });
      masteryChanged += merged.changed;
    }

    let attemptsAdded = 0;
    days.forEach((day, index) => {
      const first = (dayDocs[index * 2].data()?.items ?? []) as AttemptRecord[];
      const second = (dayDocs[index * 2 + 1].data()?.items ?? []) as AttemptRecord[];
      const known = new Set([...first, ...second].map((a) => a.id));
      const fresh = (byDay.get(day) ?? []).filter((a) => !known.has(a.id));
      if (!fresh.length) return;
      const room = Math.max(0, ATTEMPTS_PER_DOC - first.length);
      const toFirst = fresh.slice(0, room);
      const toSecond = fresh.slice(room, room + Math.max(0, ATTEMPTS_PER_DOC - second.length));
      if (toFirst.length) tx.set(user.collection("attempts").doc(day), { items: [...first, ...toFirst], updatedAt: now });
      if (toSecond.length) tx.set(user.collection("attempts").doc(`${day}-2`), { items: [...second, ...toSecond], updatedAt: now });
      attemptsAdded += toFirst.length + toSecond.length;
    });

    let coachSaved = 0;
    input.coach.forEach((session, index) => {
      const stored = coachDocs[index].data();
      if (stored && typeof stored.updatedAt === "number" && stored.updatedAt >= session.updatedAt) return;
      tx.set(user.collection("coachSessions").doc(session.id), { ...session, syncedAt: now });
      coachSaved += 1;
    });

    const newDevice = !device.exists;
    tx.set(
      deviceRef,
      { platform: input.platform, lastSyncAt: now, ...(newDevice ? { firstSyncAt: now } : {}), ...(options.importing ? { importedAt: now } : {}) },
      { merge: true },
    );
    if (newDevice) {
      queueMailInTx(tx, firestore, mailKey("device", uid, input.installId), { template: "device-paired", uid, props: { device: input.platform === "ios" ? "iPhone or iPad" : input.platform === "android" ? "Android device" : input.platform === "desktop" ? "Cadence desktop" : "A browser", platform: input.platform, at: now } }, now);
    }

    return { cardsChanged, attemptsAdded, masteryChanged, coachSaved, newDevice, cursor: now };
  });
}

/** Everything changed since a cursor (milliseconds), for a device catching up. */
export async function pullDetail(uid: string, since: number, options: { db?: Firestore; now?: number } = {}) {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const user = userRef(firestore, uid);
  const account = readAccount((await user.get()).data());
  if (!account.isPlus) throw new TierError("This needs Cadence Plus.");

  const changed = (name: string) => user.collection(name).where("updatedAt", ">", since).limit(200).get();
  const [srs, mastery, attempts, coach] = await Promise.all([changed("srs"), changed("mastery"), changed("attempts"), user.collection("coachSessions").where("updatedAt", ">", since).limit(50).get()]);
  return {
    cursor: now,
    srs: Object.fromEntries(srs.docs.map((doc) => [doc.id, doc.data().cards ?? {}])),
    mastery: Object.fromEntries(mastery.docs.map((doc) => [doc.id, doc.data().items ?? {}])),
    // Whole days that changed; the device drops ids it already has.
    attempts: attempts.docs.flatMap((doc) => (doc.data().items ?? []) as AttemptRecord[]),
    coachSessions: coach.docs.map((doc) => doc.data()),
  };
}

