"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface CoachVoiceSettings {
  gender: string;
  age: string;
  pitch: string;
  accent: string;
}

const STORAGE_KEY = "cadence-coach-voice";
// Custom event to notify same-tab subscribers when we write to localStorage
// (the native "storage" event only fires in other tabs).
const UPDATE_EVENT = "cadence-coach-voice-update";

export const DEFAULT_VOICE_SETTINGS: CoachVoiceSettings = {
  gender: "female",
  age: "elderly",
  pitch: "moderate pitch",
  accent: "american accent",
};

// Module-level cache so getSnapshot returns a stable reference when nothing changed.
// useSyncExternalStore requires this — returning a new object every call causes an infinite loop.
let _cachedJson = "";
let _cachedSnapshot: CoachVoiceSettings = DEFAULT_VOICE_SETTINGS;

function getSnapshot(): CoachVoiceSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? "";
    if (stored !== _cachedJson) {
      _cachedJson = stored;
      _cachedSnapshot = stored
        ? { ...DEFAULT_VOICE_SETTINGS, ...(JSON.parse(stored) as Partial<CoachVoiceSettings>) }
        : DEFAULT_VOICE_SETTINGS;
    }
  } catch {
    // ignore
  }
  return _cachedSnapshot;
}

// Server always returns defaults — client will reconcile via useSyncExternalStore.
function getServerSnapshot(): CoachVoiceSettings {
  return DEFAULT_VOICE_SETTINGS;
}

function subscribe(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(UPDATE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(UPDATE_EVENT, onStoreChange);
  };
}

export function useCoachVoice() {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const instruct = useMemo(
    () =>
      [settings.gender, settings.age, settings.pitch, settings.accent]
        .filter(Boolean)
        .join(", "),
    [settings],
  );

  const updateSettings = useCallback((next: Partial<CoachVoiceSettings>) => {
    const updated = { ...getSnapshot(), ...next };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event(UPDATE_EVENT));
    } catch {
      // ignore
    }
  }, []);

  return { settings, instruct, updateSettings };
}
