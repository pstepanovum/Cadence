// FILE: src/lib/cloud/profile-input.ts
//
// Validating a PATCH /api/profile body. Pure, tested in
// tests/cloud/profile-input.test.ts. The same values are offered by the web
// onboarding wizard and the mobile app.

export const PRACTICE_FOCUS_VALUES = ["conversations", "vowels", "work", "daily"] as const;
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
  practiceCadence?: string;
  onboardingCompleted?: boolean;
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

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "Nothing to update." };
  }

  return { ok: true, update };
}
