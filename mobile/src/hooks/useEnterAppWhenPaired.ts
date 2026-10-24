import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { onboardingInProgress } from "@/onboarding/store";
import { useConnection } from "@/pairing/context";

/**
 * Leaves the connect flow once pairing has really landed. Navigating straight
 * after `pair()` resolves is too early: the app's routes only open once the
 * new mode has rendered, so a `replace("/")` fired in the same tick is dropped
 * and the learner is left on a spinner that has finished.
 */
export function useEnterAppWhenPaired() {
  const { mode } = useConnection();
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    // "/" alone is ambiguous: the sign-in group has an index too, and while it
    // is guarded off a navigation to it is silently dropped.
    if (!paired) return;
    // Paired from the first-run setup: back to it, for the steps after.
    if (onboardingInProgress()) {
      router.dismissTo("/onboarding");
      return;
    }
    if (mode === "local") router.dismissTo("/(tabs)");
    // Paired a home server while signed in: back to wherever it was opened from.
    else if (mode === "cloud" && router.canGoBack()) router.back();
  }, [paired, mode]);

  return useCallback(() => setPaired(true), []);
}
