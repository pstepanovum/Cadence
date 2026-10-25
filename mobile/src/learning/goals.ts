// The learner's goals as the screens see them: the account's when signed in
// to Cadence Cloud and it has some, else the answers this phone's setup saved
// (a phone on your own Cadence has no account). Rules are in the shared
// src/platform/goals.ts.
import { useMemo } from "react";

import { useAuth } from "@/context/auth";
import { useOnboardingStatus } from "@/onboarding/store";
import { parseGoals, type LearningGoal } from "@/platform/goals";

export function useLearningGoals(): readonly LearningGoal[] {
  const { user, profile } = useAuth();
  const onboarding = useOnboardingStatus();
  const fromAccount = user ? profile.learningGoals : [];
  const chosen = fromAccount.length ? fromAccount : (onboarding.saved?.answers.goals ?? []);
  const key = chosen.join(",");
  // Stable while the choice is the same, so effects and memos can depend on it.
  return useMemo(() => parseGoals(key ? key.split(",") : []), [key]);
}
