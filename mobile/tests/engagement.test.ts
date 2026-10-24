import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBadges, newlyEarned, type ContentFacts } from "../src/engagement/badges.ts";
import { daysToNextFreeze, MAX_FREEZES, streakStatus } from "../src/engagement/streak.ts";
import { dueByDay, dueToday, todayStatus } from "../src/engagement/today.ts";
import { earnBadges, emptyLearningState, finishSession, logMinutes, parseLearningState, reviewCard } from "../src/learning/state.ts";
import { shiftDay } from "../src/platform/progress-model.ts";

const T = "2026-10-24";
const run = (end: string, length: number) => Array.from({ length }, (_, i) => shiftDay(end, -i));

describe("streak with freezes", () => {
  it("is empty with no practice", () => {
    assert.deepEqual(streakStatus([], T), { current: 0, best: 0, freezes: 0, frozenDays: [], practisedToday: false, atRisk: false });
  });

  it("counts consecutive days and today", () => {
    const s = streakStatus(run(T, 3), T);
    assert.equal(s.current, 3);
    assert.equal(s.practisedToday, true);
    assert.equal(s.atRisk, false);
  });

  it("stays alive but at risk until today ends", () => {
    const s = streakStatus(run(shiftDay(T, -1), 4), T);
    assert.equal(s.current, 4);
    assert.equal(s.atRisk, true);
  });

  it("breaks after a missed day with no freeze", () => {
    const s = streakStatus(run(shiftDay(T, -2), 4), T);
    assert.equal(s.current, 0);
    assert.equal(s.best, 4);
  });

  it("earns a freeze every seven days and spends it on a missed day", () => {
    const days = [...run(shiftDay(T, -2), 7)];
    const s = streakStatus(days, T);
    assert.equal(s.current, 7);
    assert.equal(s.freezes, 0);
    assert.deepEqual(s.frozenDays, [shiftDay(T, -1)]);
    assert.equal(s.atRisk, true);
  });

  it("banks at most MAX_FREEZES", () => {
    const s = streakStatus(run(T, 28), T);
    assert.equal(s.freezes, MAX_FREEZES);
    assert.equal(daysToNextFreeze(s), null);
  });

  it("ignores future days and duplicates", () => {
    const s = streakStatus([T, T, shiftDay(T, 1)], T);
    assert.equal(s.current, 1);
  });

  it("says how far the next freeze is", () => {
    assert.equal(daysToNextFreeze(streakStatus(run(T, 3), T)), 4);
  });
});

describe("activity log", () => {
  it("records minutes per day and counters through sessions and reviews", () => {
    let state = emptyLearningState();
    state = finishSession(state, { kind: "quiz", refId: "q", level: "A1", score: 100, minutes: 3 }, 1, T).state;
    state = finishSession(state, { kind: "coach", refId: "c", level: null, score: null, minutes: 2 }, 2, T).state;
    state = reviewCard(state, "card.1", "good", new Date(2026, 9, 24));
    assert.equal(state.activity.days[T], 5);
    assert.equal(state.activity.perfectQuizzes, 1);
    assert.equal(state.activity.conversations, 1);
    assert.equal(state.activity.cardsReviewed, 1);
  });

  it("keeps only the most recent days", () => {
    let log = emptyLearningState().activity;
    for (let i = 0; i < 410; i += 1) log = logMinutes(log, shiftDay(T, -i), 1);
    assert.equal(Object.keys(log.days).length, 400);
    assert.ok(log.days[T]);
  });

  it("survives a round trip and bad input", () => {
    const state = finishSession(emptyLearningState(), { kind: "quiz", refId: "q", level: "A1", score: 80, minutes: 1 }, 1, T).state;
    assert.deepEqual(parseLearningState(JSON.parse(JSON.stringify(state))).activity, state.activity);
    assert.deepEqual(parseLearningState({ activity: { days: { nope: 3 }, cardsReviewed: -2 } }).activity.days, {});
  });

  it("keeps the first time a badge was earned", () => {
    let state = earnBadges(emptyLearningState(), ["first-lesson"], 5);
    state = earnBadges(state, ["first-lesson"], 9);
    assert.equal(state.activity.badges["first-lesson"], 5);
  });
});

describe("today", () => {
  it("measures the daily goal and the week", () => {
    let state = emptyLearningState();
    state = { ...state, activity: logMinutes(logMinutes(state.activity, T, 6), shiftDay(T, -1), 4) };
    const today = todayStatus(state, T, 10);
    assert.equal(today.minutesToday, 6);
    assert.equal(today.goalMet, false);
    assert.equal(today.goalProgress, 0.6);
    assert.equal(today.weekMinutes, 10);
    assert.equal(today.week.length, 7);
    assert.equal(today.week[6].day, T);
    assert.equal(today.streak.current, 2);
  });

  it("takes the account's streak when another device is further along", () => {
    const state = emptyLearningState();
    state.summary.streak = { current: 12, best: 12, lastDay: shiftDay(T, -1) };
    const today = todayStatus(state, T, 10);
    assert.equal(today.streak.current, 12);
    assert.equal(today.streak.atRisk, true);
  });

  it("counts due flashcards", () => {
    const state = emptyLearningState();
    state.cards = {
      a: { reps: 1, interval: 1, ease: 2.5, due: shiftDay(T, -1), lapses: 0, updatedAt: 0 },
      b: { reps: 1, interval: 1, ease: 2.5, due: T, lapses: 0, updatedAt: 0 },
      c: { reps: 1, interval: 3, ease: 2.5, due: shiftDay(T, 2), lapses: 0, updatedAt: 0 },
    };
    assert.equal(dueToday(state, T), 2);
    assert.equal(dueByDay(state)[shiftDay(T, 2)], 1);
  });
});

describe("badges", () => {
  const facts: ContentFacts = {
    lessonsByLevel: { A1: ["l1", "l2"] },
    topics: [{ id: "tenses", title: "Tenses", grammarPointIds: ["gp.a", "gp.b"] }],
  };

  it("starts with nothing earned", () => {
    const badges = buildBadges({ state: emptyLearningState(), bestStreak: 0, facts });
    assert.equal(badges.filter((b) => b.earned).length, 0);
    assert.ok(badges.some((b) => b.id === "level-A1"));
    assert.ok(badges.some((b) => b.id === "grammar-tenses"));
    assert.ok(!badges.some((b) => b.id === "level-B1"), "no level badge without its pack");
  });

  it("earns lessons, levels, streaks, cards, quizzes, conversations and grammar", () => {
    const state = emptyLearningState();
    state.lessons = { l1: { completedAt: 1, bestScore: 90 }, l2: { completedAt: 2, bestScore: 80 } };
    state.activity = { ...state.activity, cardsReviewed: 120, perfectQuizzes: 1, conversations: 1 };
    state.grammar = {
      "gp.a": { attempts: 6, correct: 6, ema: 90, lastAt: 1 },
      "gp.b": { attempts: 5, correct: 5, ema: 88, lastAt: 1 },
    };
    const earned = new Set(buildBadges({ state, bestStreak: 30, facts }).filter((b) => b.earned).map((b) => b.id));
    for (const id of ["first-lesson", "level-A1", "streak-7", "streak-30", "cards-100", "perfect-quiz", "first-conversation", "grammar-tenses"]) {
      assert.ok(earned.has(id), id);
    }
    assert.ok(!earned.has("streak-100"));
    assert.ok(!earned.has("cards-1000"));
  });

  it("counts lessons from the account summary too", () => {
    const state = emptyLearningState();
    state.summary.lessonsCompleted.A1 = 2;
    const level = buildBadges({ state, bestStreak: 0, facts }).find((b) => b.id === "level-A1");
    assert.equal(level?.earned, true);
  });

  it("celebrates only what is not recorded yet, and keeps recorded badges", () => {
    const state = earnBadges(emptyLearningState(), ["streak-7", "level-C2"], 3);
    const badges = buildBadges({ state, bestStreak: 7, facts });
    assert.deepEqual(newlyEarned(badges), []);
    assert.equal(badges.find((b) => b.id === "level-C2")?.title, "C2 complete");
    const fresh = buildBadges({ state: emptyLearningState(), bestStreak: 7, facts });
    assert.deepEqual(newlyEarned(fresh).map((b) => b.id), ["streak-7"]);
  });
});
