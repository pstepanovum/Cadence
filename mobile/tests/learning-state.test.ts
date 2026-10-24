import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addCustomCards,
  afterSummarySync,
  detailSince,
  emptyLearningState,
  finishSession,
  mergeRemoteDetail,
  parseLearningState,
  recordAnswer,
  recordDrill,
  recordPronunciation,
  reviewCard,
  summaryBatch,
  MAX_PENDING,
} from "../src/learning/state.ts";
import { emptySummary } from "../src/platform/progress-model.ts";
import type { MultipleChoiceExercise } from "../src/platform/content-model.ts";

const AT = Date.UTC(2026, 9, 20, 9);
const DAY = "2026-10-20";

const mc: MultipleChoiceExercise = {
  id: "ex.a1.test.01",
  kind: "multiple_choice",
  level: "A1",
  grammarPointIds: ["gp.a1.one", "gp.a1.two"],
  prompt: "Pick",
  question: "q",
  options: ["a", "b"],
  answer: 0,
};

describe("learning state", () => {
  it("parses garbage as a fresh state and keeps known parts", () => {
    assert.deepEqual(parseLearningState(null), emptyLearningState());
    const parsed = parseLearningState({ lessons: { x: { completedAt: 1, bestScore: 2 } }, pending: "nope" });
    assert.deepEqual(parsed.lessons, { x: { completedAt: 1, bestScore: 2 } });
    assert.deepEqual(parsed.pending, []);
  });

  it("records grammar mastery for every point an answer practises", () => {
    let s = recordAnswer(emptyLearningState(), mc, { correct: true, score: 1 }, AT, DAY);
    s = recordAnswer(s, mc, { correct: false, score: 0 }, AT + 1, DAY);
    assert.deepEqual(s.grammar["gp.a1.one"], { attempts: 2, correct: 1, ema: 70, lastAt: AT + 1 });
    assert.equal(s.attempts.length, 2);
    assert.equal(s.attempts[0].correct, false);
  });

  it("finishing a lesson completes it once, updates the summary and queues the activity", () => {
    const first = finishSession(emptyLearningState(), { kind: "lesson", refId: "lesson.a1.x", level: "A1", score: 80, minutes: 5, lessonId: "lesson.a1.x" }, AT, DAY);
    assert.equal(first.activity.completedLesson, true);
    assert.equal(first.state.summary.lessonsCompleted.A1, 1);
    assert.equal(first.state.summary.streak.current, 1);
    assert.equal(first.state.pending.length, 1);
    const again = finishSession(first.state, { kind: "lesson", refId: "lesson.a1.x", level: "A1", score: 95, minutes: 5, lessonId: "lesson.a1.x" }, AT + 10, DAY);
    assert.equal(again.activity.completedLesson, undefined);
    assert.equal(again.state.summary.lessonsCompleted.A1, 1);
    assert.equal(again.state.lessons["lesson.a1.x"].bestScore, 95);
    assert.equal(again.state.summary.totalMinutes, 10);
  });

  it("caps the pending queue", () => {
    let s = emptyLearningState();
    for (let i = 0; i < MAX_PENDING + 5; i += 1) {
      s = finishSession(s, { kind: "quiz", refId: "q", level: null, score: 50, minutes: 1 }, AT + i, DAY).state;
    }
    assert.equal(s.pending.length, MAX_PENDING);
    assert.equal(summaryBatch(s).length, 50);
  });

  it("takes the server summary after a sync and re-applies what is still queued", () => {
    let s = emptyLearningState();
    for (let i = 0; i < 3; i += 1) s = finishSession(s, { kind: "quiz", refId: "q", level: null, score: 50, minutes: 2 }, AT + i, DAY).state;
    const server = { ...emptySummary(), totalMinutes: 100 };
    const synced = afterSummarySync(s, 2, server);
    assert.equal(synced.pending.length, 1);
    assert.equal(synced.summary.totalMinutes, 102);
    assert.equal(afterSummarySync(s, 3, null).pending.length, 0);
  });

  it("reviews cards with SRS and stamps them", () => {
    const s = reviewCard(emptyLearningState(), "ex.a1.cards.01", "good", new Date(AT));
    assert.equal(s.cards["ex.a1.cards.01"].reps, 1);
    assert.equal(s.cards["ex.a1.cards.01"].updatedAt, AT);
  });

  it("adds custom cards without duplicates", () => {
    const { state, added } = addCustomCards(emptyLearningState(), [{ front: "Brisk", back: "quick" }, { front: "brisk", back: "x" }, { front: "", back: "y" }], AT);
    assert.equal(added, 1);
    assert.equal(addCustomCards(state, [{ front: "BRISK ", back: "z" }], AT).added, 0);
  });

  it("records sounds from pronunciation and from drills", () => {
    let s = recordPronunciation(emptyLearningState(), [{ symbol: "/θ/", accuracy: 40 }], AT, DAY);
    assert.equal(s.sounds["sound.th"].ema, 40);
    for (let i = 0; i < 3; i += 1) s = recordDrill(s, "sound.th", 90, "drill", AT, DAY).state;
    assert.equal(s.sounds["sound.th"].step, 1);
  });

  it("collects changed detail since a time and merges remote detail by recency", () => {
    let s = reviewCard(emptyLearningState(), "c1", "good", new Date(AT));
    s = recordAnswer(s, mc, { correct: true, score: 1 }, AT, DAY);
    const detail = detailSince(s, AT - 1);
    assert.deepEqual(Object.keys(detail.cards), ["c1"]);
    assert.equal(detail.attempts.length, 1);
    assert.deepEqual(detailSince(s, AT).cards, {});

    const older = { ...s.cards.c1, reps: 9, updatedAt: AT - 5 };
    const newer = { ...s.cards.c1, reps: 7, updatedAt: AT + 5 };
    assert.equal(mergeRemoteDetail(s, { cards: { c1: older } }).cards.c1.reps, 1);
    assert.equal(mergeRemoteDetail(s, { cards: { c1: newer } }).cards.c1.reps, 7);
  });
});
