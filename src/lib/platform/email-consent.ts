// FILE: src/lib/platform/email-consent.ts
//
// Which email an account gets. Every category is on unless the learner turned
// it off: an unset preference means on, and a stored false always wins. New
// accounts are told so in one line at sign-up (SIGNUP_EMAIL_NOTICE), every
// non-account email carries a one-click unsubscribe, and Account › Email (web)
// and Settings (iPhone) show a switch for each. Account, security and billing
// email is not a category and cannot be turned off.
//
// Twin: mobile/src/platform/email-consent.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

/** The email categories a learner can turn off. */
export const EMAIL_PREF_KEYS = ["lifecycle", "reminders", "newsletter"] as const;
export type EmailPrefKey = (typeof EMAIL_PREF_KEYS)[number];
export type EmailPrefs = Record<EmailPrefKey, boolean>;

/** What each switch is called, and what it covers. */
export const EMAIL_PREF_LABELS: Record<EmailPrefKey, { title: string; detail: string }> = {
  lifecycle: { title: "Getting-started tips", detail: "A few short emails in your first two weeks." },
  reminders: { title: "Practice reminders", detail: "Streak checks, a weekly summary, badges, and a nudge when you've been away." },
  newsletter: { title: "Product news and offers", detail: "New lessons, what changed in Cadence, and the occasional offer." },
};

/** The line every sign-up form shows, web and iPhone. No checkbox: the switches are in Account › Email. */
export const SIGNUP_EMAIL_NOTICE = "We'll email you practice tips and offers. Turn them off anytime in Account › Email.";

/** An account's stored `emailPrefs`, read with unset meaning on. Only a stored false turns a category off. */
export function readEmailPrefs(raw: unknown): EmailPrefs {
  const prefs = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    lifecycle: prefs.lifecycle !== false,
    reminders: prefs.reminders !== false,
    newsletter: prefs.newsletter !== false,
  };
}
