// FILE: src/components/advanced/store.ts
//
// The browser's own copy of the advanced practice state (docs/PLATFORM.md
// section 20): phrase and slang review cards, the practice list and the
// plateau track, in localStorage, scheduled by the shared srs.ts. Signed in,
// every account picks up what the learner's assistant assigned and logged
// (GET /api/practice, then PATCH to acknowledge); with Plus the state also
// syncs across devices (POST /api/sync/advanced, last writer wins). Best
// effort: offline, nothing is lost.
"use client";

import { useSyncExternalStore } from "react";

import { readMe } from "@/components/account/me";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { notifyStored } from "@/hooks/use-stored";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { dateOf, newerTrack, parseTrack, recordDrill, type Track } from "@/lib/platform/fossilization.ts";
import { addToPracticeList, removeFromPracticeList, type PracticeListItem } from "@/lib/platform/phrase-bank.ts";
import { metadataForSync, type RecordingIndex } from "@/lib/platform/recordings.ts";
import { dayKey, review, type CardState, type Grade } from "@/lib/platform/srs.ts";

export const ADVANCED_KEY = "cadence.advanced.v1";
const INSTALL_KEY = "cadence.install.v1";

export type StoredCard = CardState & { updatedAt: number };

export interface AdvancedState {
  cards: Record<string, StoredCard>;
  list: PracticeListItem[];
  track: Track | null;
  /** The newest connector review applied, so none is applied twice. */
  reviewsUpTo: number;
  /** Recording ids deleted here since the last sync, so the account forgets them too. */
  removedRecordings: string[];
  /** Practice-list items removed here since the last sync, so the account's list drops them too. */
  listDone: string[];
  syncedAt: number;
}

const EMPTY: AdvancedState = { cards: {}, list: [], track: null, reviewsUpTo: 0, removedRecordings: [], listDone: [], syncedAt: 0 };
let cache: { raw: string | null; state: AdvancedState } = { raw: null, state: EMPTY };

function parse(raw: string | null): AdvancedState {
  if (!raw) return EMPTY;
  try {
    const value = JSON.parse(raw) as Partial<AdvancedState>;
    return {
      cards: value.cards && typeof value.cards === "object" ? value.cards : {},
      list: Array.isArray(value.list) ? value.list : [],
      track: parseTrack(value.track ?? null),
      reviewsUpTo: Number(value.reviewsUpTo) || 0,
      removedRecordings: Array.isArray(value.removedRecordings) ? value.removedRecordings.slice(-1000) : [],
      listDone: Array.isArray(value.listDone) ? value.listDone.filter((id) => typeof id === "string").slice(-200) : [],
      syncedAt: Number(value.syncedAt) || 0,
    };
  } catch {
    return EMPTY;
  }
}

export function readAdvanced(): AdvancedState {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ADVANCED_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cache.raw) cache = { raw, state: parse(raw) };
  return cache.state;
}

export function writeAdvanced(update: (state: AdvancedState) => AdvancedState) {
  const next = update(readAdvanced());
  try {
    window.localStorage.setItem(ADVANCED_KEY, JSON.stringify(next));
  } catch {
    // Storage blocked or full; the state lives for this page only.
    cache = { raw: cache.raw, state: next };
  }
  notifyStored();
  scheduleAdvancedSync();
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener("cadence:storage", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("cadence:storage", onChange);
  };
}

export function useAdvancedState(): AdvancedState {
  return useSyncExternalStore(subscribe, readAdvanced, () => EMPTY);
}

export const today = () => dayKey(new Date());

/** Grades one phrase or slang item through the shared scheduler. */
export function gradeItem(itemId: string, grade: Grade) {
  const now = Date.now();
  writeAdvanced((s) => ({ ...s, cards: { ...s.cards, [itemId]: { ...review(s.cards[itemId], grade, new Date()), updatedAt: now } } }));
}

export function addToList(itemIds: string[]) {
  const now = Date.now();
  writeAdvanced((s) => ({ ...s, list: addToPracticeList(s.list, itemIds.map((itemId, i) => ({ itemId, addedAt: now + i, source: "device" as const }))), listDone: s.listDone.filter((id) => !itemIds.includes(id)) }));
}

export function removeFromList(itemIds: string[]) {
  writeAdvanced((s) => ({ ...s, list: removeFromPracticeList(s.list, itemIds), listDone: [...s.listDone.filter((id) => !itemIds.includes(id)), ...itemIds].slice(-200) }));
}

export function setTrack(track: Track | null) {
  writeAdvanced((s) => ({ ...s, track }));
}

export function gradeDrillStep(stepId: string, grade: Grade) {
  writeAdvanced((s) => (s.track ? { ...s, track: recordDrill(s.track, stepId, grade, today(), Date.now()) } : s));
}

export function forgetRecordings(ids: string[]) {
  writeAdvanced((s) => ({ ...s, removedRecordings: [...s.removedRecordings, ...ids].slice(-1000) }));
}

// Sync ----------------------------------------------------------------------

function installId(): string {
  try {
    let id = window.localStorage.getItem(INSTALL_KEY);
    const parsed = id ? (JSON.parse(id) as string) : null;
    if (parsed && /^[A-Za-z0-9_-]{8,64}$/.test(parsed)) return parsed;
    id = `web-${crypto.randomUUID().replace(/-/g, "")}`;
    window.localStorage.setItem(INSTALL_KEY, JSON.stringify(id));
    return id;
  } catch {
    return "web-unsaved-install";
  }
}

async function signedIn(): Promise<boolean> {
  if (!isFirebaseConfigured) return false;
  try {
    const { getCurrentIdToken } = await import("@/lib/firebase/client");
    return Boolean(await getCurrentIdToken());
  } catch {
    return false;
  }
}

let recordingsIndex: () => Promise<RecordingIndex | null> = async () => null;
/** The recordings store registers how to read its index, so the sync can send its metadata. */
export function registerRecordingsIndex(read: () => Promise<RecordingIndex | null>) {
  recordingsIndex = read;
}

async function syncOnce() {
  if (!(await signedIn())) return;
  const me = await readMe();
  if (!me?.uid || me.tier === "none") return;

  // Every tier: what the assistant assigned or logged through the connector.
  const inbox = await cloudFetch("/api/practice");
  if (inbox.ok) {
    const body = (await inbox.json().catch(() => null)) as { list?: PracticeListItem[]; reviews?: { itemId: string; grade: Grade; at: number }[] } | null;
    const state = readAdvanced();
    const fresh = (body?.reviews ?? []).filter((r) => r.at > state.reviewsUpTo).sort((a, b) => a.at - b.at);
    // Items removed in this browser stay removed: they are not taken back from the account's list.
    const removed = new Set(state.listDone);
    const assigned = (body?.list ?? []).filter((i) => i && typeof i.itemId === "string" && !removed.has(i.itemId));
    if (fresh.length || assigned.some((i) => !state.list.some((l) => l.itemId === i.itemId))) {
      const day = today();
      writeAdvanced((s) => {
        let cards = s.cards;
        let track = s.track;
        for (const r of fresh) {
          if (r.itemId.startsWith("phrase.") || r.itemId.startsWith("slang.")) cards = { ...cards, [r.itemId]: { ...review(cards[r.itemId], r.grade, dateOf(day)), updatedAt: r.at } };
          else if (track) track = recordDrill(track, r.itemId, r.grade, day, r.at);
        }
        return { ...s, cards, track, list: addToPracticeList(s.list, assigned), reviewsUpTo: fresh.length ? fresh[fresh.length - 1].at : s.reviewsUpTo };
      });
    }
    const done = state.listDone;
    if (fresh.length || done.length) {
      const ack = await cloudFetch("/api/practice", { method: "PATCH", json: { ...(fresh.length ? { reviewsUpTo: fresh[fresh.length - 1].at } : {}), ...(done.length ? { done } : {}) } });
      if (ack.ok && done.length) writeAdvanced((s) => ({ ...s, listDone: s.listDone.filter((id) => !done.includes(id)) }));
    }
  }

  if (me.tier !== "full") return;
  // The device clock, like every card's updatedAt, so a skewed server clock never hides a change.
  const pushedAt = Date.now();
  const state = readAdvanced();
  const changed = Object.fromEntries(Object.entries(state.cards).filter(([, c]) => c.updatedAt > state.syncedAt));
  const index = await recordingsIndex();
  const response = await cloudFetch("/api/sync/advanced", {
    method: "POST",
    json: { installId: installId(), cards: changed, track: state.track, recordings: { upsert: index ? metadataForSync(index, installId()) : [], remove: state.removedRecordings } },
  });
  if (!response.ok) return;
  const merged = (await response.json().catch(() => null)) as { cards?: Record<string, StoredCard>; track?: unknown; updatedAt?: number } | null;
  if (!merged) return;
  writeAdvanced((s) => {
    const cards = { ...s.cards };
    for (const [id, card] of Object.entries(merged.cards ?? {})) if (!cards[id] || card.updatedAt > cards[id].updatedAt) cards[id] = card;
    return { ...s, cards, track: newerTrack(s.track, parseTrack(merged.track ?? null)), removedRecordings: s.removedRecordings.filter((id) => !state.removedRecordings.includes(id)), syncedAt: pushedAt };
  });
}

let running: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let syncing = false;

export function syncAdvanced(): Promise<void> {
  running ??= (async () => {
    syncing = true;
    try {
      await syncOnce();
    } catch {
      // Offline or refused; everything is still in this browser.
    } finally {
      syncing = false;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export function scheduleAdvancedSync(delayMs = 4000) {
  if (typeof window === "undefined" || syncing) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncAdvanced();
  }, delayMs);
}
