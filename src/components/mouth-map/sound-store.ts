// FILE: src/components/mouth-map/sound-store.ts
//
// The per-sound records on this device (localStorage). Free and local in every
// mode; Plus sync of mastery/sounds goes through the server's sync routes.
"use client";

import { useMemo } from "react";
import { localDay, recordScore, type SoundStore } from "@/components/mouth-map/sound-practice";
import { notifyStored, useStoredString } from "@/hooks/use-stored";
import { soundIdFromArpabet } from "@/components/mouth-map/targets";

const KEY = "cadence.sounds.v1";

export function loadSoundStore(): SoundStore {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SoundStore) : {};
  } catch {
    return {};
  }
}

export function saveSoundStore(store: SoundStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked: the practice still works, it just is not remembered.
  }
  notifyStored();
}

/** The device's per-sound records, live. */
export function useSoundStore(): SoundStore {
  const raw = useStoredString(KEY);
  return useMemo(() => {
    try {
      return raw ? (JSON.parse(raw) as SoundStore) : {};
    } catch {
      return {};
    }
  }, [raw]);
}

/** Records one result's phoneme scores (ARPAbet symbols, 0-100). */
export function recordPhonemeScores(scores: readonly { phoneme: string; score: number }[]): void {
  if (scores.length === 0) return;
  let store = loadSoundStore();
  const now = new Date();
  for (const { phoneme, score } of scores) {
    const id = soundIdFromArpabet(phoneme);
    if (id) store = recordScore(store, id, score, now);
  }
  saveSoundStore(store);
}

export { localDay };
