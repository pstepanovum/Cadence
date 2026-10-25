// FILE: src/lib/cloud/profile-input.ts
//
// Validating a PATCH /api/profile body. Pure, tested in
// tests/cloud/profile-input.test.ts. The same values are offered by the web
// onboarding wizard and the mobile app.

import { LEARNING_GOAL_VALUES, PRACTICE_FOCUS_VALUES, focusForGoals, goalsFromFocus, isLearningGoal, parseGoals, type LearningGoal } from "../platform/goals";
import { parseLevelPrefs, type LevelPrefs } from "../platform/levels";
import { SEEN_MAX_LENGTH, decodeSeen, encodeSeen } from "../platform/placement";

export { PRACTICE_FOCUS_VALUES };
export const PRACTICE_CADENCE_VALUES = [
  "5-minutes",
  "15-minutes",
  "30-minutes",
  "weekend-only",
] as const;

export const DISPLAY_NAME_MAX_LENGTH = 60;

export interface ProfileUpdate {
  displayName?: string;
  practiceFocus?: string;
  /** One or more goals from the setup question, in the setup's order. */
  learningGoals?: LearningGoal[];
  practiceCadence?: string;
  onboardingCompleted?: boolean;
  /** The learner's level settings: overall, per skill, and where they came from. */
  levels?: LevelPrefs;
  /** Placement items seen in earlier tests, re-encoded so only valid ids are kept. */
  placementSeen?: string;
}

export type ProfileParseResult =
  | { ok: true; update: ProfileUpdate }
  | { ok: false; error: string };

export function parseProfileUpdate(body: unknown): ProfileParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }

  const input = body as Record<string, unknown>;
  const update: ProfileUpdate = {};

  if ("displayName" in input) {
    if (typeof input.displayName !== "string") {
      return { ok: false, error: "displayName must be text." };
    }
    const displayName = input.displayName.trim();
    if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      return { ok: false, error: `Keep your name under ${DISPLAY_NAME_MAX_LENGTH} characters.` };
    }
    update.displayName = displayName;
  }

  if ("practiceFocus" in input) {
    if (!PRACTICE_FOCUS_VALUES.includes(input.practiceFocus as never)) {
      return { ok: false, error: "Unknown practiceFocus." };
    }
    update.practiceFocus = input.practiceFocus as string;
  }

  if ("learningGoals" in input) {
    const raw = input.learningGoals;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > LEARNING_GOAL_VALUES.length * 2 || !raw.every(isLearningGoal)) {
      return { ok: false, error: "learningGoals must list at least one known goal." };
    }
    update.learningGoals = parseGoals(raw);
    // Builds that only read the single focus still see the closest one.
    if (!("practiceFocus" in input)) update.practiceFocus = focusForGoals(update.learningGoals);
  }

  if ("practiceCadence" in input) {
    if (!PRACTICE_CADENCE_VALUES.includes(input.practiceCadence as never)) {
      return { ok: false, error: "Unknown practiceCadence." };
    }
    update.practiceCadence = input.practiceCadence as string;
  }

  if ("onboardingCompleted" in input) {
    if (typeof input.onboardingCompleted !== "boolean") {
      return { ok: false, error: "onboardingCompleted must be true or false." };
    }
    update.onboardingCompleted = input.onboardingCompleted;
  }

  if ("levels" in input) {
    const levels = parseLevelPrefs(input.levels);
    if (!levels) {
      return { ok: false, error: "levels needs an overall CEFR level." };
    }
    update.levels = levels;
  }

  if ("placementSeen" in input) {
    if (typeof input.placementSeen !== "string" || input.placementSeen.length > SEEN_MAX_LENGTH) {
      return { ok: false, error: "placementSeen must be the compact seen string." };
    }
    update.placementSeen = encodeSeen(decodeSeen(input.placementSeen));
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  return { ok: true, update };
}

/**
 * A build from before goals sends only `practiceFocus`. When that focus is a
 * change from the stored one, the learner picked something new on that build,
 * so the goals follow it; otherwise (a rename that resends the same focus)
 * the goals chosen on a newer build are kept.
 */
export function reconcileFocusOnly(update: ProfileUpdate, storedFocus: string | null): ProfileUpdate {
  if (update.practiceFocus === undefined || update.learningGoals !== undefined || update.practiceFocus === storedFocus) return update;
  const goals = goalsFromFocus(update.practiceFocus);
  return goals.length ? { ...update, learningGoals: goals } : update;
}
