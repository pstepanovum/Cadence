import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/context/auth";
import {
  applyReview,
  emptyProgress,
  parseProgress,
  recordResult,
  type GameProgress,
  type GameResult,
} from "./progress.ts";
import type { Grade } from "./srs.ts";

// Game progress lives on the device, keyed per account, the same way coach
// history does (src/lib/coach-storage.ts). It is held in a module-level store
// so the hub and a game screen that is still open always agree, and so a
// finished round is on disk before the summary is even drawn.
//
// Local mode has no account; every phone paired to one computer shares one
// learner there, so "local" is the key.

function storageKey(userId: string) {
  return `cadence_games:${userId}`;
}

interface Snapshot {
  userId: string | null;
  progress: GameProgress;
  loaded: boolean;
}

let snapshot: Snapshot = { userId: null, progress: emptyProgress(), loaded: false };
const listeners = new Set<() => void>();
let writeQueue: Promise<void> = Promise.resolve();

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

function getSnapshot() {
  return snapshot;
}

async function load(userId: string): Promise<void> {
  let progress = emptyProgress();
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (raw) progress = parseProgress(JSON.parse(raw));
  } catch {
    // Unreadable storage reads as a fresh start; the next write replaces it.
  }
  // A sign-out while the read was in flight must not resurrect the old user,
  // and a round finished before the read landed must not be thrown away.
  if (snapshot.userId !== userId || snapshot.loaded) return;
  emit({ userId, progress, loaded: true });
}

function persist(userId: string, progress: GameProgress) {
  writeQueue = writeQueue
    .then(() => AsyncStorage.setItem(storageKey(userId), JSON.stringify(progress)))
    .catch(() => {
      // Best effort — the in-memory copy is still right for this session.
    });
}

function update(mutate: (progress: GameProgress) => GameProgress) {
  if (!snapshot.userId) return;
  const progress = mutate(snapshot.progress);
  emit({ ...snapshot, progress });
  persist(snapshot.userId, progress);
}

export interface GameProgressHandle {
  progress: GameProgress;
  /** False until the stored copy has been read; screens hold their stats until then. */
  loaded: boolean;
  recordRound: (result: Omit<GameResult, "playedAt">) => void;
  gradeCard: (wordId: string, grade: Grade) => void;
}

export function useGameProgress(): GameProgressHandle {
  const { user } = useAuth();
  const userId = user?.uid ?? "local";

  useEffect(() => {
    if (snapshot.userId !== userId) {
      emit({ userId, progress: emptyProgress(), loaded: false });
      load(userId);
    } else if (!snapshot.loaded) {
      load(userId);
    }
  }, [userId]);

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const recordRound = useCallback((result: Omit<GameResult, "playedAt">) => {
    const now = new Date();
    update((progress) => recordResult(progress, { ...result, playedAt: now.toISOString() }, now));
  }, []);

  const gradeCard = useCallback((wordId: string, grade: Grade) => {
    update((progress) => applyReview(progress, wordId, grade, new Date()));
  }, []);

  return {
    progress: state.userId === userId ? state.progress : emptyProgress(),
    loaded: state.userId === userId && state.loaded,
    recordRound,
    gradeCard,
  };
}
