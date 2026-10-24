// FILE: mobile/src/lib/profile.ts
//
// The cloud account's profile fields and how to read them out of a server
// response. Kept free of React and React Native imports so it can be unit
// tested with the plain `node --test` runner (see mobile/tests/profile.test.ts).

/**
 * Profile fields the web app keeps for a cloud account. The server owns them
 * (`GET` / `PATCH /api/profile`); the auth context keeps the last copy it saw
 * per account so a cold start offline still knows onboarding is done.
 */
export interface Profile {
  displayName: string;
  practiceFocus: PracticeFocus;
  practiceCadence: PracticeCadence;
  onboardingCompleted: boolean;
}

export type PracticeFocus = "conversations" | "vowels" | "work" | "daily";
export type PracticeCadence = "5-minutes" | "15-minutes" | "30-minutes" | "weekend-only";

export const PRACTICE_FOCUS_OPTIONS: { value: PracticeFocus; label: string }[] = [
  { value: "conversations", label: "Conversation confidence" },
  { value: "vowels", label: "Short and long vowel control" },
  { value: "work", label: "Clearer speaking at work" },
  { value: "daily", label: "Daily speaking fluency" },
];

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
  if (PRACTICE_FOCUS_OPTIONS.some((option) => option.value === body.practiceFocus)) {
    fields.practiceFocus = body.practiceFocus as PracticeFocus;
  }
  if (PRACTICE_CADENCE_OPTIONS.some((option) => option.value === body.practiceCadence)) {
    fields.practiceCadence = body.practiceCadence as PracticeCadence;
  }
  if (typeof body.onboardingCompleted === "boolean") {
    fields.onboardingCompleted = body.onboardingCompleted;
  }
  return fields;
}

export function toProfile(
  fields: StoredProfile,
  user: { email: string | null } | null,
): Profile {
  return {
    displayName: fields.displayName || user?.email?.split("@")[0] || "Learner",
    practiceFocus: fields.practiceFocus ?? "conversations",
    practiceCadence: fields.practiceCadence ?? "15-minutes",
    onboardingCompleted: fields.onboardingCompleted === true,
  };
}
