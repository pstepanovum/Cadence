// The first-run setup's saved state on this phone: where a half-finished run
// stopped, the answers so far, and whether it is done. Onboarding is the
// phone's (it runs before there is any account), shows once, and can be
// walked through again from Settings.
import { useSyncExternalStore } from "react";

import { storedValue } from "@/lib/stored-value";
import {
  DEFAULT_ANSWERS,
  ONBOARDING_VERSION,
  parseStoredOnboarding,
  type OnboardingAnswers,
  type OnboardingPosition,
  type StoredOnboarding,
} from "@/onboarding/flow";

const store = storedValue<StoredOnboarding | null>("cadence.onboarding.v1", parseStoredOnboarding, null);

const blank = (): StoredOnboarding => ({ version: ONBOARDING_VERSION, completedAt: null, position: null, answers: DEFAULT_ANSWERS });

export const onboardingReady = store.ready;

export function getOnboarding(): StoredOnboarding | null {
  return store.get();
}

export function saveOnboardingProgress(position: OnboardingPosition, answers: OnboardingAnswers): void {
  store.set((current) => ({ ...(current ?? blank()), position, answers }));
}

export function completeOnboarding(answers: OnboardingAnswers, at = Date.now()): void {
  store.set((current) => ({ ...(current ?? blank()), answers, position: null, completedAt: current?.completedAt ?? at }));
}

/**
 * An install from before this onboarding existed already chose how to
 * practise; it is marked done so nobody sees setup twice.
 */
export function markOnboardingDoneForExistingInstall(): void {
  if (store.get() === null) store.set({ ...blank(), completedAt: 0 });
}

export interface OnboardingStatus {
  loaded: boolean;
  completed: boolean;
  saved: StoredOnboarding | null;
}

const snapshot = (): OnboardingStatus => {
  const saved = store.get();
  return { loaded: store.isLoaded(), completed: saved?.completedAt != null, saved };
};
let last = snapshot();
const getStatus = () => {
  const next = snapshot();
  if (next.loaded !== last.loaded || next.completed !== last.completed || next.saved !== last.saved) last = next;
  return last;
};

export function useOnboardingStatus(): OnboardingStatus {
  return useSyncExternalStore(store.subscribe, getStatus, getStatus);
}

/** Read outside React (the pairing hook): is the first-run setup still open? */
export function onboardingInProgress(): boolean {
  return store.isLoaded() && store.get()?.completedAt == null;
}
