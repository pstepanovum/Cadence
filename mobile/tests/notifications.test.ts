import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_REMINDERS,
  inQuietHours,
  isPlanned,
  parseReminderSettings,
  planNotifications,
  STREAK_CHECK_MINUTE,
  type PlanInput,
} from "../src/notifications/plan.ts";

// Saturday 24 October 2026, 09:00 local.
const NOW = new Date(2026, 9, 24, 9, 0);
const base: PlanInput = {
  now: NOW,
  settings: { ...DEFAULT_REMINDERS, daily: true, time: 18 * 60 },
  permitted: true,
  goalMetToday: false,
  streak: 0,
  practisedToday: false,
  freezes: 0,
  dueByDay: {},
};
const kinds = (input: PlanInput) => planNotifications(input).map((n) => `${n.kind}@${new Date(n.fireAt).getDate()}`);

describe("notification plan", () => {
  it("plans nothing without permission", () => {
    assert.deepEqual(planNotifications({ ...base, permitted: false }), []);
  });

  it("plans a daily reminder for the week, at the chosen time", () => {
    const plan = planNotifications(base).filter((n) => n.kind === "daily");
    assert.equal(plan.length, 7);
    assert.ok(plan.every((n) => new Date(n.fireAt).getHours() === 18));
    assert.ok(plan.every((n) => isPlanned(n.id)));
    assert.equal(plan[0].url, "/");
  });

  it("skips today's reminder once the goal is met", () => {
    const plan = planNotifications({ ...base, goalMetToday: true });
    assert.ok(!plan.some((n) => new Date(n.fireAt).getDate() === 24 && n.kind === "daily"));
    assert.ok(plan.some((n) => new Date(n.fireAt).getDate() === 25));
  });

  it("merges today's reminder and the streak check into one nudge", () => {
    const today = planNotifications({ ...base, streak: 5 }).filter((n) => new Date(n.fireAt).getDate() === 24);
    assert.equal(today.length, 1);
    assert.equal(today[0].kind, "streak");
    assert.equal(new Date(today[0].fireAt).getHours(), 18);
    assert.match(today[0].title, /5-day streak/);
  });

  it("sends the evening streak check alone when daily reminders are off", () => {
    const plan = planNotifications({ ...base, settings: { ...base.settings, daily: false }, streak: 3, freezes: 1 });
    const streak = plan.find((n) => n.kind === "streak");
    assert.ok(streak);
    const fire = new Date(streak.fireAt);
    assert.equal(fire.getHours() * 60 + fire.getMinutes(), STREAK_CHECK_MINUTE);
    assert.match(streak.body, /freeze/);
  });

  it("does not nag about a streak already kept today", () => {
    assert.ok(!kinds({ ...base, streak: 3, practisedToday: true }).some((k) => k.startsWith("streak")));
  });

  it("mentions due flashcards in the reminder, or sends them alone", () => {
    const due = { "2026-10-23": 4, "2026-10-26": 2 };
    const withDaily = planNotifications({ ...base, dueByDay: due });
    assert.match(withDaily[0].body, /4 flashcards are ready/);
    const alone = planNotifications({ ...base, settings: { ...base.settings, daily: false, weekly: false, streak: false }, dueByDay: due });
    assert.deepEqual(alone.map((n) => n.kind), ["flashcards", "flashcards"]);
    assert.equal(alone[0].url, "/practice/flashcards");
  });

  it("plans the weekly summary on Sunday", () => {
    const weekly = planNotifications(base).find((n) => n.kind === "weekly");
    assert.ok(weekly);
    assert.equal(new Date(weekly.fireAt).getDay(), 0);
    assert.equal(weekly.url, "/badges");
  });

  it("respects quiet hours", () => {
    const late = planNotifications({ ...base, settings: { ...base.settings, time: 23 * 60 } });
    assert.ok(!late.some((n) => n.kind === "daily"));
    assert.equal(inQuietHours(23 * 60, DEFAULT_REMINDERS.quiet), true);
    assert.equal(inQuietHours(7 * 60, DEFAULT_REMINDERS.quiet), true);
    assert.equal(inQuietHours(12 * 60, DEFAULT_REMINDERS.quiet), false);
    assert.equal(inQuietHours(23 * 60, { enabled: false, start: 22 * 60, end: 8 * 60 }), false);
  });

  it("never plans something in the past", () => {
    const evening = new Date(2026, 9, 24, 21, 0);
    assert.ok(planNotifications({ ...base, now: evening, streak: 2 }).every((n) => n.fireAt > evening.getTime()));
  });

  it("reads stored settings defensively", () => {
    assert.deepEqual(parseReminderSettings(null), DEFAULT_REMINDERS);
    assert.equal(parseReminderSettings({ daily: true, time: 9999 }).time, DEFAULT_REMINDERS.time);
    assert.equal(parseReminderSettings({ daily: true, time: 450 }).time, 450);
  });
});
