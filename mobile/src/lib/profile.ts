// FILE: mobile/src/lib/profile.ts
//
// The cloud account's profile fields and how to read them out of a server
// response. Kept free of React and React Native imports so it can be unit
// tested with the plain `node --test` runner (see mobile/tests/profile.test.ts).
import { PRACTICE_FOCUS_VALUES, focusForGoals, parseGoals, resolveGoals, type LearningGoal, type PracticeFocus } from "../platform/goals.ts";
import { parseLevelPrefs, type LevelPrefs } from "../platform/levels.ts";

export type { LearningGoal, PracticeFocus };

/**
 * Profile fields the web app keeps for a cloud account. The server owns them
 * (`GET` / `PATCH /api/profile`); the auth context keeps the last copy it saw
 * per account so a cold start offline still knows onboarding is done.
 */
export interface Profile {
  displayName: string;
  /** Kept for builds that predate goals; derived from the goals when they are saved. */
  practiceFocus: PracticeFocus;
  /** What the learner is working towards, one or more (src/platform/goals.ts). */
  learningGoals: LearningGoal[];
  practiceCadence: PracticeCadence;
  onboardingCompleted: boolean;
  /** Level settings kept on the account; the phone keeps its own copy and the newer wins. */
  levels?: LevelPrefs;
  /** Placement items seen in earlier tests, compact (src/platform/placement.ts). */
  placementSeen?: string;
}

export type PracticeCadence = "5-minutes" | "15-minutes" | "30-minutes" | "weekend-only";


export const PRACTICE_CADENCE_OPTIONS: { value: PracticeCadence; label: string }[] = [
  { value: "5-minutes", label: "5 minutes a day" },
  { value: "15-minutes", label: "15 minutes a day" },
  { value: "30-minutes", label: "30 minutes a day" },
  { value: "weekend-only", label: "A few times a week" },
];

export type StoredProfile = Partial<Omit<Profile, "displayName">> & { displayName?: string };

/** Reads the profile out of whatever the server sent, ignoring anything unknown. */
export function parseProfile(raw: unknown): StoredProfile {
  const outer = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const body = (
    typeof outer.profile === "object" && outer.profile !== null ? outer.profile : outer
  ) as Record<string, unknown>;

  const fields: StoredProfile = {};
  if (typeof body.displayName === "string" && body.displayName.trim()) {
    fields.displayName = body.displayName.trim();
  }
  if (PRACTICE_FOCUS_VALUES.includes(body.practiceFocus as PracticeFocus)) {
    fields.practiceFocus = body.practiceFocus as PracticeFocus;
  }
  const goals = parseGoals(body.learningGoals);
  if (goals.length) fields.learningGoals = goals;
  if (PRACTICE_CADENCE_OPTIONS.some((option) => option.value === body.practiceCadence)) {
    fields.practiceCadence = body.practiceCadence as PracticeCadence;
  }
  if (typeof body.onboardingCompleted === "boolean") {
    fields.onboardingCompleted = body.onboardingCompleted;
  }
  const levels = parseLevelPrefs(body.levels);
  if (levels) fields.levels = levels;
  if (typeof body.placementSeen === "string") fields.placementSeen = body.placementSeen;
  return fields;
}

export function toProfile(
  fields: StoredProfile,
  user: { email: string | null } | null,
): Profile {
  return {
    displayName: fields.displayName || user?.email?.split("@")[0] || "Learner",
    practiceFocus: fields.practiceFocus ?? (fields.learningGoals?.length ? focusForGoals(fields.learningGoals) : "conversations"),
    // An account from before goals existed: its focus stands in.
    learningGoals: resolveGoals(fields.learningGoals, fields.practiceFocus),
    practiceCadence: fields.practiceCadence ?? "15-minutes",
    onboardingCompleted: fields.onboardingCompleted === true,
    ...(fields.levels ? { levels: fields.levels } : {}),
    ...(fields.placementSeen !== undefined ? { placementSeen: fields.placementSeen } : {}),
  };
}
