// Preferences kept on this phone: sounds, haptics and the daily goal. They
// are the phone's own (a learner may want silence on one device only).
import { DEFAULT_DAILY_GOAL, isDailyGoal, type DailyGoal } from "@/engagement/today";
import { storedValue } from "@/lib/stored-value";

export interface Prefs {
  sounds: boolean;
  haptics: boolean;
  dailyGoal: DailyGoal;
}

export const DEFAULT_PREFS: Prefs = { sounds: true, haptics: true, dailyGoal: DEFAULT_DAILY_GOAL };

function parsePrefs(raw: unknown): Prefs {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    sounds: typeof o.sounds === "boolean" ? o.sounds : DEFAULT_PREFS.sounds,
    haptics: typeof o.haptics === "boolean" ? o.haptics : DEFAULT_PREFS.haptics,
    dailyGoal: isDailyGoal(o.dailyGoal) ? o.dailyGoal : DEFAULT_PREFS.dailyGoal,
  };
}

export const prefs = storedValue("cadence.prefs.v1", parsePrefs, DEFAULT_PREFS);

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs.set((current) => ({ ...current, [key]: value }));
}

export const usePrefs = prefs.use;
