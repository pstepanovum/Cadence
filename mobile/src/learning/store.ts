// The learner's practice state on the phone (src/learning/state.ts), in
// AsyncStorage, one copy per account: the signed-in uid, or "device" for
// someone using their own Cadence server with no account. Held in a module
// store so the hub and an open session always agree, and so a finished
// session is on disk before its summary is drawn.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSyncExternalStore } from "react";

import { emptyLearningState, parseLearningState, type LearningState } from "./state.ts";

const storageKey = (learner: string) => `cadence_learning:${learner}`;

/** The learner with no account: own-server use, and setup before an account exists. */
export const DEVICE_LEARNER = "device";

interface Snapshot {
  learner: string | null;
  state: LearningState;
  loaded: boolean;
}

let snapshot: Snapshot = { learner: null, state: emptyLearningState(), loaded: false };
const listeners = new Set<() => void>();
let writes: Promise<void> = Promise.resolve();

function emit(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Points the store at a learner, loading their copy. Null while nobody is known. */
export function setLearner(learner: string | null): void {
  if (snapshot.learner === learner) return;
  emit({ learner, state: emptyLearningState(), loaded: learner === null });
  if (!learner) return;
  void (async () => {
    let state = emptyLearningState();
    try {
      let raw = await AsyncStorage.getItem(storageKey(learner));
      if (!raw && learner !== DEVICE_LEARNER) {
        // The first sign-in on this phone takes over what was practised
        // before there was an account (onboarding's placement quiz, say).
        const device = await AsyncStorage.getItem(storageKey(DEVICE_LEARNER));
        if (device) {
          raw = device;
          await AsyncStorage.setItem(storageKey(learner), device);
          await AsyncStorage.removeItem(storageKey(DEVICE_LEARNER));
        }
      }
      if (raw) state = parseLearningState(JSON.parse(raw));
    } catch {
      // Unreadable storage starts fresh; the next write replaces it.
    }
    if (snapshot.learner !== learner || snapshot.loaded) return;
    emit({ learner, state, loaded: true });
  })();
}

export function getLearning(): Snapshot {
  return snapshot;
}

/** Applies a change and saves it. Ignored until a learner is loaded. */
export function updateLearning(mutate: (state: LearningState) => LearningState): LearningState | null {
  const { learner, loaded } = snapshot;
  if (!learner || !loaded) return null;
  const state = mutate(snapshot.state);
  if (state === snapshot.state) return state;
  emit({ ...snapshot, state });
  writes = writes
    .then(() => AsyncStorage.setItem(storageKey(learner), JSON.stringify(state)))
    .catch(() => {
      // Best effort: the in-memory copy is still right for this session.
    });
  return state;
}

/** Removes a learner's copy from the phone (account deletion). */
export async function forgetLearner(learner: string): Promise<void> {
  await AsyncStorage.removeItem(storageKey(learner)).catch(() => {});
  if (snapshot.learner === learner) emit({ learner, state: emptyLearningState(), loaded: true });
}

export function useLearning(): Snapshot {
  return useSyncExternalStore(subscribe, getLearning, getLearning);
}

/** Today's local calendar day, YYYY-MM-DD, the way the summary counts streaks. */
export function today(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
