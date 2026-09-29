import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { clearReferenceAudioCache } from "@/audio/reference-audio";

// AsyncStorage port of the web app's `useCoachVoice` (src/hooks/useCoachVoice.ts).
// The voice is global: it drives reference words, coach lines and theory
// narration alike, so it lives in a module-level store rather than in a screen.

const STORAGE_KEY = "cadence-coach-voice";

export const VOICE_GENDERS = ["female", "male"] as const;
export const VOICE_AGES = ["child", "teenager", "young adult", "middle-aged", "elderly"] as const;
export const VOICE_PITCHES = ["very low", "low", "moderate", "high", "very high"] as const;
export const VOICE_ACCENTS = [
  "american",
  "australian",
  "british",
  "canadian",
  "chinese",
  "indian",
  "japanese",
  "korean",
  "portuguese",
  "russian",
] as const;

export interface CoachVoiceSettings {
  gender: (typeof VOICE_GENDERS)[number];
  age: (typeof VOICE_AGES)[number];
  pitch: (typeof VOICE_PITCHES)[number];
  accent: (typeof VOICE_ACCENTS)[number];
}

export const DEFAULT_COACH_VOICE: CoachVoiceSettings = {
  gender: "female",
  age: "elderly",
  pitch: "moderate",
  accent: "american",
};

/** The `instruct` string the TTS route expects, e.g. "female, elderly, moderate pitch, american accent". */
export function voiceInstruct(settings: CoachVoiceSettings): string {
  return `${settings.gender}, ${settings.age}, ${settings.pitch} pitch, ${settings.accent} accent`;
}

function sanitize(raw: unknown): CoachVoiceSettings {
  const value = (raw ?? {}) as Partial<Record<keyof CoachVoiceSettings, string>>;
  const pick = <K extends keyof CoachVoiceSettings>(
    key: K,
    allowed: readonly CoachVoiceSettings[K][],
  ): CoachVoiceSettings[K] =>
    allowed.includes(value[key] as CoachVoiceSettings[K])
      ? (value[key] as CoachVoiceSettings[K])
      : DEFAULT_COACH_VOICE[key];

  return {
    gender: pick("gender", VOICE_GENDERS),
    age: pick("age", VOICE_AGES),
    pitch: pick("pitch", VOICE_PITCHES),
    accent: pick("accent", VOICE_ACCENTS),
  };
}

// --- Module-level store -----------------------------------------------------
// useSyncExternalStore needs a stable snapshot, so the settings object is only
// replaced when something actually changes.

let snapshot: CoachVoiceSettings = DEFAULT_COACH_VOICE;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
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

async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const next = sanitize(JSON.parse(raw));
    if (voiceInstruct(next) !== voiceInstruct(snapshot)) {
      snapshot = next;
      emit();
    }
  } catch {
    // A corrupt entry just means the default voice; never block startup.
  }
}

function write(next: CoachVoiceSettings) {
  if (voiceInstruct(next) === voiceInstruct(snapshot)) return;
  snapshot = next;
  // Every cached clip was rendered in the old voice, so it is now wrong.
  clearReferenceAudioCache();
  emit();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
    // The change still applies for this session even if it cannot be saved.
  });
}

export interface CoachVoice {
  settings: CoachVoiceSettings;
  /** Pass this straight to the TTS helpers. */
  instruct: string;
  update: (patch: Partial<CoachVoiceSettings>) => void;
  reset: () => void;
  isDefault: boolean;
}

export function useCoachVoice(): CoachVoice {
  const settings = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    hydrate();
  }, []);

  const update = useCallback((patch: Partial<CoachVoiceSettings>) => {
    write(sanitize({ ...snapshot, ...patch }));
  }, []);

  const reset = useCallback(() => {
    write(DEFAULT_COACH_VOICE);
  }, []);

  return {
    settings,
    instruct: voiceInstruct(settings),
    update,
    reset,
    isDefault: voiceInstruct(settings) === voiceInstruct(DEFAULT_COACH_VOICE),
  };
}
