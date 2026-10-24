// Local reminders as plain data: what to schedule for the next week, given
// the learner's settings and today's practice. src/notifications/schedule.ts
// hands the plan to iOS; the app re-plans whenever it opens or practice
// changes, so a reminder for a day whose goal is already met is simply not in
// the next plan. Pure, so it is unit tested (tests/notifications.test.ts).

export const NOTIFICATION_PREFIX = "cadence-";
/** iOS keeps at most 64 pending; a plan stays well under. */
export const PLAN_BUDGET = 40;
export const PLAN_DAYS = 7;
/** The evening check for a streak that has no practice yet today. */
export const STREAK_CHECK_MINUTE = 20 * 60 + 30;
/** The weekly summary: Sunday late morning. */
export const WEEKLY_DAY = 0;
export const WEEKLY_MINUTE = 11 * 60;

export interface QuietHours {
  enabled: boolean;
  /** Minutes after midnight. Start after end means overnight. */
  start: number;
  end: number;
}

export interface ReminderSettings {
  /** The daily practice reminder. */
  daily: boolean;
  /** Minutes after midnight. */
  time: number;
  streak: boolean;
  flashcards: boolean;
  weekly: boolean;
  quiet: QuietHours;
}

export const DEFAULT_REMINDERS: ReminderSettings = {
  daily: false,
  time: 19 * 60,
  streak: true,
  flashcards: true,
  weekly: true,
  quiet: { enabled: true, start: 22 * 60, end: 8 * 60 },
};

export type NotificationKind = "daily" | "streak" | "flashcards" | "weekly";

export interface PlannedNotification {
  id: string;
  kind: NotificationKind;
  /** Epoch milliseconds. */
  fireAt: number;
  title: string;
  body: string;
  /** In-app path opened on tap. */
  url: string;
}

export interface PlanInput {
  now: Date;
  settings: ReminderSettings;
  /** Whether notifications are allowed at all. */
  permitted: boolean;
  goalMetToday: boolean;
  streak: number;
  practisedToday: boolean;
  freezes: number;
  /** Flashcards due on each local day (YYYY-MM-DD), overdue cards counted on today. */
  dueByDay: Readonly<Record<string, number>>;
}

export const NOTIFICATION_LINKS: Record<NotificationKind, string> = {
  daily: "/",
  streak: "/",
  flashcards: "/practice/flashcards",
  weekly: "/badges",
};

export function inQuietHours(minute: number, quiet: QuietHours): boolean {
  if (!quiet.enabled || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? minute >= quiet.start && minute < quiet.end : minute >= quiet.start || minute < quiet.end;
}

export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local midnight `offset` days from `now`, plus `minute` minutes. */
function at(now: Date, offset: number, minute: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, Math.floor(minute / 60), minute % 60, 0, 0);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function dailyCopy(streak: number, due: number): { title: string; body: string } {
  if (due > 0) return { title: "Time for Cadence", body: `${plural(due, "flashcard is", "flashcards are")} ready, and a short lesson is waiting.` };
  if (streak > 1) return { title: "Time for Cadence", body: `A few minutes keeps your ${streak}-day streak going.` };
  return { title: "Time for Cadence", body: "A few minutes today is all it takes." };
}

function streakCopy(streak: number, freezes: number): { title: string; body: string } {
  return {
    title: `Your ${streak}-day streak`,
    body: freezes > 0 ? "One short practice keeps it going. A freeze covers today if you need a rest." : "One short practice keeps it going.",
  };
}

export function planNotifications(input: PlanInput): PlannedNotification[] {
  const { now, settings, permitted } = input;
  if (!permitted) return [];
  const nowMs = now.getTime();
  const quiet = (minute: number) => inQuietHours(minute, settings.quiet);
  const plan: PlannedNotification[] = [];
  const add = (kind: NotificationKind, date: Date, copy: { title: string; body: string }) => {
    if (date.getTime() <= nowMs) return;
    plan.push({ id: `${NOTIFICATION_PREFIX}${kind}-${dayKey(date)}`, kind, fireAt: date.getTime(), url: NOTIFICATION_LINKS[kind], ...copy });
  };
  const dueOn = (offset: number) => {
    const key = dayKey(at(now, offset, 0));
    return offset === 0 ? Object.entries(input.dueByDay).reduce((sum, [day, n]) => (day <= key ? sum + n : sum), 0) : (input.dueByDay[key] ?? 0);
  };

  // Today's evening streak check, merged with today's reminder so the
  // learner gets one nudge, not two: whichever comes first, in streak words.
  const streakToday =
    settings.streak && input.streak > 0 && !input.practisedToday && !quiet(STREAK_CHECK_MINUTE) ? at(now, 0, STREAK_CHECK_MINUTE) : null;
  const dailyToday = settings.daily && !input.goalMetToday && !quiet(settings.time) ? at(now, 0, settings.time) : null;
  const liveStreak = streakToday && streakToday.getTime() > nowMs ? streakToday : null;
  const liveDaily = dailyToday && dailyToday.getTime() > nowMs ? dailyToday : null;
  if (liveStreak && liveDaily) {
    const first = liveDaily.getTime() <= liveStreak.getTime() ? liveDaily : liveStreak;
    add("streak", first, streakCopy(input.streak, input.freezes));
  } else if (liveStreak) {
    add("streak", liveStreak, streakCopy(input.streak, input.freezes));
  } else if (liveDaily) {
    add("daily", liveDaily, dailyCopy(input.streak, dueOn(0)));
  }

  for (let offset = 0; offset < PLAN_DAYS; offset += 1) {
    const due = dueOn(offset);
    if (offset > 0 && settings.daily && !quiet(settings.time)) {
      // A streak running today is still running tomorrow only with practice,
      // which re-plans; the copy stays general.
      add("daily", at(now, offset, settings.time), dailyCopy(0, due));
    } else if (!settings.daily && settings.flashcards && due > 0 && !quiet(settings.time)) {
      const date = at(now, offset, settings.time);
      if (offset > 0 || !input.goalMetToday) add("flashcards", date, { title: "Flashcards are ready", body: `${plural(due, "card is", "cards are")} due for review.` });
    }
  }

  if (settings.weekly && !quiet(WEEKLY_MINUTE)) {
    for (let offset = 0; offset <= PLAN_DAYS; offset += 1) {
      const date = at(now, offset, WEEKLY_MINUTE);
      if (date.getDay() === WEEKLY_DAY && date.getTime() > nowMs) {
        add("weekly", date, { title: "Your week in Cadence", body: "See your minutes, streak and badges from the last seven days." });
        break;
      }
    }
  }

  return plan.sort((a, b) => a.fireAt - b.fireAt).slice(0, PLAN_BUDGET);
}

/** Whether a scheduled notification id is one of Cadence's plan, so a re-plan may replace it. */
export function isPlanned(id: string): boolean {
  return id.startsWith(NOTIFICATION_PREFIX);
}

/** "19:00" / "7:00 PM" for a minute of the day, in the device's locale. */
export function formatTime(minute: number, locale?: string): string {
  const date = new Date(2000, 0, 1, Math.floor(minute / 60), minute % 60);
  return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

/** Reads stored settings; anything unreadable falls back to the defaults. */
export function parseReminderSettings(raw: unknown): ReminderSettings {
  const o = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const minute = (v: unknown, fallback: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440 ? v : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  const q = (typeof o.quiet === "object" && o.quiet !== null ? o.quiet : {}) as Record<string, unknown>;
  return {
    daily: bool(o.daily, DEFAULT_REMINDERS.daily),
    time: minute(o.time, DEFAULT_REMINDERS.time),
    streak: bool(o.streak, DEFAULT_REMINDERS.streak),
    flashcards: bool(o.flashcards, DEFAULT_REMINDERS.flashcards),
    weekly: bool(o.weekly, DEFAULT_REMINDERS.weekly),
    quiet: {
      enabled: bool(q.enabled, DEFAULT_REMINDERS.quiet.enabled),
      start: minute(q.start, DEFAULT_REMINDERS.quiet.start),
      end: minute(q.end, DEFAULT_REMINDERS.quiet.end),
    },
  };
}
