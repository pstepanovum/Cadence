// FILE: src/lib/server/lifecycle-plan.ts
//
// Which lifecycle email an account is due right now, if any. Pure: the runner
// (./lifecycle.ts) gathers the facts and this decides.
//
//   day 1    lifecycle-start   tips list   (on unless turned off)
//   day 3    lifecycle-habit   tips list
//   day 6    lifecycle-plus    tips list
//   day 10   sale-offer        newsletter  (unless news and offers are off, and only while an offer runs)
//   day 13   sale-reminder     newsletter  (only after sale-offer went out)
//
// Days count the learner's own calendar days since signing up, and mail goes
// out in their local evening (18:00 to 21:00). A step missed by a day (the job
// did not run) is still sent the next evening; older than that it is dropped,
// and never sent after a later step. The sequence stops for good once the
// account has Plus from any source or has been inactive for over 21 days.
export const LIFECYCLE_STEPS = [
  { id: "day1", day: 1, template: "lifecycle-start", list: "lifecycle" },
  { id: "day3", day: 3, template: "lifecycle-habit", list: "lifecycle" },
  { id: "day6", day: 6, template: "lifecycle-plus", list: "lifecycle" },
  { id: "day10", day: 10, template: "sale-offer", list: "newsletter" },
  { id: "day13", day: 13, template: "sale-reminder", list: "newsletter" },
] as const;

export type LifecycleStep = (typeof LIFECYCLE_STEPS)[number];
export type LifecycleStepId = LifecycleStep["id"];

export const EVENING = { fromHour: 18, toHour: 21 } as const;
export const INACTIVE_STOP_DAYS = 21;
/** How far back the runner looks for new accounts: the last step plus its day of grace. */
export const LIFECYCLE_WINDOW_DAYS = 15;
const GRACE_DAYS = 1;
const DAY_MS = 86_400_000;

/** A valid IANA zone name, or null. */
export function cleanTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return null;
  }
}

/** The local calendar day and hour of an instant in a zone. */
export function localTime(epochMs: number, timeZone: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) % 24 };
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

export interface LifecycleFacts {
  now: number;
  createdAt: number;
  /** The learner's zone; UTC when we have none. */
  timeZone: string | null;
  isPlus: boolean;
  /** Last practice; null when they never practised (then sign-up counts). */
  lastActiveAt: number | null;
  prefs: { lifecycle: boolean; newsletter: boolean };
  /** Steps already sent (the email log). */
  sent: ReadonlySet<string>;
  /** Whether an offer is running now (src/lib/server/email/offer.ts). */
  offerRunning: boolean;
}

export type LifecycleDecision = { step: LifecycleStep } | { step: null; reason: string };

export function lifecycleStepDue(facts: LifecycleFacts): LifecycleDecision {
  if (facts.isPlus) return { step: null, reason: "has plus" };
  if (facts.now - (facts.lastActiveAt ?? facts.createdAt) > INACTIVE_STOP_DAYS * DAY_MS) return { step: null, reason: "inactive" };
  const zone = cleanTimeZone(facts.timeZone) ?? "UTC";
  const local = localTime(facts.now, zone);
  if (local.hour < EVENING.fromHour || local.hour >= EVENING.toHour) return { step: null, reason: "not evening" };

  const age = daysBetween(localTime(facts.createdAt, zone).day, local.day);
  const lastSentIndex = LIFECYCLE_STEPS.reduce((last, step, index) => (facts.sent.has(step.id) ? index : last), -1);
  // Latest first: if today's step is not allowed, yesterday's missed one may be.
  for (let index = LIFECYCLE_STEPS.length - 1; index > lastSentIndex; index -= 1) {
    const step = LIFECYCLE_STEPS[index];
    if (step.day > age || age - step.day > GRACE_DAYS) continue;
    if (step.list === "lifecycle" && !facts.prefs.lifecycle) continue;
    if (step.list === "newsletter") {
      if (!facts.prefs.newsletter || !facts.offerRunning) continue;
      if (step.id === "day13" && !facts.sent.has("day10")) continue;
    }
    return { step };
  }
  return { step: null, reason: "nothing due" };
}
