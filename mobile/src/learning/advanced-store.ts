// The phone's advanced practice state (docs/PLATFORM.md section 20): phrase
// and slang review cards, the practice list and the plateau track, in
// AsyncStorage per learner (the uid, or "device"), scheduled by the shared
// srs.ts. Kept apart from learn-state, whose parser drops unknown keys.
// Signed in, every account takes what the learner's assistant assigned and
// logged through the connector (GET /api/practice); Plus also syncs the state
// and recording metadata across devices (POST /api/sync/advanced).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useSyncExternalStore } from "react";

import { api, apiJson } from "@/api/client";
import { getInstallId } from "@/lib/install-id";
import type { DataTier } from "@/platform/engine-routing";
import { dateOf, newerTrack, parseTrack, recordDrill, type Track } from "@/platform/fossilization";
import { addToPracticeList, removeFromPracticeList, type PracticeListItem } from "@/platform/phrase-bank";
import { metadataForSync, type RecordingIndex } from "@/platform/recordings";
import { review, type Grade } from "@/platform/srs";

import { EMPTY_ADVANCED, parseAdvancedState, type AdvancedState, type StoredCard } from "./advanced-state.ts";
import { getLearning, today, useLearning } from "./store.ts";

export { EMPTY_ADVANCED, parseAdvancedState, type AdvancedState, type StoredCard };

const key = (learner: string) => `cadence_advanced:${learner}`;

let snapshot: { learner: string | null; state: AdvancedState; loaded: boolean } = { learner: null, state: EMPTY_ADVANCED, loaded: false };
const listeners = new Set<() => void>();
let writes: Promise<void> = Promise.resolve();

function emit(next: typeof snapshot) {
  snapshot = next;
  for (const l of listeners) l();
}

/** Loads the current learner's copy when it changed. */
function ensureLoaded() {
  const learner = getLearning().learner;
  if (!learner || snapshot.learner === learner) return;
  emit({ learner, state: EMPTY_ADVANCED, loaded: false });
  void AsyncStorage.getItem(key(learner))
    .then((raw) => (raw ? parseAdvancedState(JSON.parse(raw)) : EMPTY_ADVANCED))
    .catch(() => EMPTY_ADVANCED)
    .then((state) => {
      if (snapshot.learner === learner && !snapshot.loaded) emit({ learner, state, loaded: true });
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getSnapshot = () => snapshot;

/** The current learner's state; loads their copy once the learner is known. */
export function useAdvancedState() {
  const { learner } = useLearning();
  useEffect(() => ensureLoaded(), [learner]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function getAdvanced(): AdvancedState {
  return snapshot.state;
}

export function updateAdvanced(mutate: (state: AdvancedState) => AdvancedState) {
  ensureLoaded();
  const { learner, loaded } = snapshot;
  if (!learner || !loaded) return;
  const state = mutate(snapshot.state);
  if (state === snapshot.state) return;
  emit({ ...snapshot, state });
  writes = writes.then(() => AsyncStorage.setItem(key(learner), JSON.stringify(state))).catch(() => {});
}

export function gradeItem(itemId: string, grade: Grade) {
  const now = Date.now();
  updateAdvanced((s) => ({ ...s, cards: { ...s.cards, [itemId]: { ...review(s.cards[itemId], grade, new Date()), updatedAt: now } } }));
}

export function toggleListed(itemId: string) {
  updateAdvanced((s) => (s.list.some((i) => i.itemId === itemId) ? { ...s, list: removeFromPracticeList(s.list, [itemId]) } : { ...s, list: addToPracticeList(s.list, [{ itemId, addedAt: Date.now(), source: "device" }]) }));
}

export function setTrack(track: Track | null) {
  updateAdvanced((s) => ({ ...s, track }));
}

export function updateTrack(mutate: (track: Track) => Track) {
  updateAdvanced((s) => (s.track ? { ...s, track: mutate(s.track) } : s));
}

export function gradeDrillStep(stepId: string, grade: Grade) {
  updateTrack((t) => recordDrill(t, stepId, grade, today(), Date.now()));
}

export function forgetRecordings(ids: string[]) {
  updateAdvanced((s) => ({ ...s, removedRecordings: [...s.removedRecordings, ...ids].slice(-1000) }));
}

// Sync -----------------------------------------------------------------------

const appCheck = { appCheck: true };
let recordingIndex: () => Promise<RecordingIndex | null> = async () => null;
export function registerRecordingIndex(read: () => Promise<RecordingIndex | null>) {
  recordingIndex = read;
}

async function syncOnce(tier: DataTier) {
  if (tier === "none" || !snapshot.loaded || !snapshot.learner || snapshot.learner === "device") return;
  const learner = snapshot.learner;
  const body = await api<{ list?: PracticeListItem[]; reviews?: { itemId: string; grade: Grade; at: number }[] }>("/api/practice", {}, appCheck);
  if (snapshot.learner !== learner) return;
  const fresh = (body.reviews ?? []).filter((r) => r.at > snapshot.state.reviewsUpTo).sort((a, b) => a.at - b.at);
  const assigned = (body.list ?? []).filter((i) => i && typeof i.itemId === "string");
  const day = today();
  updateAdvanced((s) => {
    let cards = s.cards;
    let track = s.track;
    for (const r of fresh) {
      if (r.itemId.startsWith("phrase.") || r.itemId.startsWith("slang.")) cards = { ...cards, [r.itemId]: { ...review(cards[r.itemId], r.grade, dateOf(day)), updatedAt: r.at } };
      else if (track) track = recordDrill(track, r.itemId, r.grade, day, r.at);
    }
    const list = addToPracticeList(s.list, assigned);
    if (!fresh.length && list.length === s.list.length) return s;
    return { ...s, cards, track, list, reviewsUpTo: fresh.length ? fresh[fresh.length - 1].at : s.reviewsUpTo };
  });
  if (fresh.length) await apiJson("/api/practice", "PATCH", { reviewsUpTo: fresh[fresh.length - 1].at }, appCheck);

  if (tier !== "full") return;
  const state = snapshot.state;
  const installId = await getInstallId();
  const index = await recordingIndex();
  const changed = Object.fromEntries(Object.entries(state.cards).filter(([, c]) => c.updatedAt > state.syncedAt));
  const merged = await apiJson<{ cards?: Record<string, StoredCard>; track?: unknown; updatedAt?: number }>(
    "/api/sync/advanced",
    "POST",
    { installId, cards: changed, track: state.track, recordings: { upsert: index ? metadataForSync(index, installId) : [], remove: state.removedRecordings } },
    appCheck,
  );
  if (snapshot.learner !== learner) return;
  updateAdvanced((s) => {
    const cards = { ...s.cards };
    for (const [id, card] of Object.entries(merged.cards ?? {})) if (!cards[id] || card.updatedAt > cards[id].updatedAt) cards[id] = card;
    return { ...s, cards, track: newerTrack(s.track, parseTrack(merged.track ?? null)), removedRecordings: [], syncedAt: Number(merged.updatedAt) || Date.now() };
  });
}

let running: Promise<void> | null = null;

/** One sync, or the one already running. Never throws. */
export function syncAdvanced(tier: DataTier): Promise<void> {
  running ??= syncOnce(tier)
    .catch(() => {
      // Offline, or a free account refused the Plus half: everything is still on the phone.
    })
    .finally(() => {
      running = null;
    });
  return running;
}
