import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  accountOptional,
  afterWelcome,
  cadenceForMinutes,
  DEFAULT_ANSWERS,
  focusForGoal,
  INTRO_SLIDES,
  nextPosition,
  onboardingSteps,
  parseStoredOnboarding,
  previousPosition,
  progressIndex,
  resumePosition,
  SELF_CHECK_LEVELS,
  startingLevel,
  type FlowContext,
} from "../src/onboarding/flow.ts";
import { PLACEMENT_QUESTIONS, placementLevel, placementScore } from "../src/onboarding/placement.ts";

const ctx: FlowContext = { replay: false, cloudAvailable: true, wantsPlacement: false, place: null, signedIn: false, plus: false };

describe("onboarding steps", () => {
  it("asks one thing at a time, in order", () => {
    assert.deepEqual(onboardingSteps(ctx), ["welcome", "goal", "level", "minutes", "reminders", "where", "account"]);
  });

  it("adds the placement quiz only when asked for", () => {
    assert.ok(onboardingSteps({ ...ctx, wantsPlacement: true }).includes("placement"));
  });

  it("offers Plus last, only on the cloud path with an account and no Plus", () => {
    assert.equal(onboardingSteps({ ...ctx, place: "cloud", signedIn: true }).at(-1), "paywall");
    assert.ok(!onboardingSteps({ ...ctx, place: "own", signedIn: true }).includes("paywall"));
    assert.ok(!onboardingSteps({ ...ctx, place: "cloud", signedIn: true, plus: true }).includes("paywall"));
    assert.ok(!onboardingSteps({ ...ctx, place: "cloud", signedIn: false }).includes("paywall"));
  });

  it("has no account or paywall in a build without the cloud", () => {
    assert.deepEqual(onboardingSteps({ ...ctx, cloudAvailable: false }).slice(-1), ["where"]);
  });

  it("replays only the learning questions", () => {
    assert.deepEqual(onboardingSteps({ ...ctx, replay: true }), ["welcome", "goal", "level", "minutes", "reminders"]);
  });

  it("makes the account optional only on your own server", () => {
    assert.equal(accountOptional("own"), true);
    assert.equal(accountOptional("cloud"), false);
  });
});

describe("moving through onboarding", () => {
  const steps = onboardingSteps(ctx);

  it("goes through the welcome slides first", () => {
    let position = { step: "welcome" as const, slide: 0 };
    for (let i = 1; i < INTRO_SLIDES; i += 1) {
      const next = nextPosition(position, steps);
      assert.deepEqual(next, { step: "welcome", slide: i });
      position = next as typeof position;
    }
    assert.deepEqual(nextPosition(position, steps), { step: "goal", slide: 0 });
    assert.deepEqual(previousPosition({ step: "goal", slide: 0 }, steps), { step: "welcome", slide: INTRO_SLIDES - 1 });
    assert.equal(previousPosition({ step: "welcome", slide: 0 }, steps), null);
    assert.deepEqual(afterWelcome(steps), { step: "goal", slide: 0 });
  });

  it("ends after the last step", () => {
    assert.equal(nextPosition({ step: "account", slide: 0 }, steps), null);
    assert.equal(progressIndex({ step: "goal", slide: 0 }, steps), 2);
  });

  it("resumes where it stopped, or the nearest earlier step", () => {
    assert.deepEqual(resumePosition({ step: "minutes", slide: 0 }, steps), { step: "minutes", slide: 0 });
    assert.deepEqual(resumePosition({ step: "placement", slide: 0 }, steps), { step: "level", slide: 0 });
    assert.deepEqual(resumePosition({ step: "paywall", slide: 0 }, steps), { step: "account", slide: 0 });
    assert.deepEqual(resumePosition(null, steps), { step: "welcome", slide: 0 });
  });

  it("reads a saved run back defensively", () => {
    assert.equal(parseStoredOnboarding("nope"), null);
    const stored = parseStoredOnboarding({ completedAt: 4, position: { step: "goal", slide: 0 }, answers: { goal: "work", minutes: 15, level: "B2", place: "own", reminderTime: 600 } });
    assert.equal(stored?.completedAt, 4);
    assert.equal(stored?.answers.goal, "work");
    assert.equal(stored?.answers.minutes, 15);
    const bad = parseStoredOnboarding({ position: { step: "elsewhere" }, answers: { goal: "fame", minutes: 7, level: "Z9" } });
    assert.equal(bad?.position, null);
    assert.deepEqual(bad?.answers, DEFAULT_ANSWERS);
  });
});

describe("what the answers mean", () => {
  it("maps the goal and minutes to the web profile", () => {
    assert.equal(focusForGoal("accent"), "vowels");
    assert.equal(focusForGoal("work"), "work");
    assert.equal(focusForGoal("fluency"), "conversations");
    assert.equal(focusForGoal(null), "daily");
    assert.equal(cadenceForMinutes(5), "5-minutes");
    assert.equal(cadenceForMinutes(10), "15-minutes");
    assert.equal(cadenceForMinutes(20), "30-minutes");
  });

  it("starts from the quiz, else the self-check, else B2", () => {
    assert.equal(startingLevel(DEFAULT_ANSWERS), "B2");
    assert.equal(startingLevel({ ...DEFAULT_ANSWERS, level: "B1" }), "B1");
    assert.equal(startingLevel({ ...DEFAULT_ANSWERS, level: "B1", placementLevel: "C1" }), "C1");
  });
});

describe("placement quiz", () => {
  const upTo = (levels: string[]) => Object.fromEntries(PLACEMENT_QUESTIONS.map((q) => [q.id, levels.includes(q.level) ? 1 : 0]));

  it("has two questions per level, each with a valid answer", () => {
    assert.equal(PLACEMENT_QUESTIONS.length, 12);
    for (const q of PLACEMENT_QUESTIONS) assert.ok(q.answer >= 0 && q.answer < q.options.length, q.id);
  });

  it("estimates the highest level reached", () => {
    assert.equal(placementLevel({}), "A1");
    assert.equal(placementLevel(upTo(["A1", "A2", "B1"])), "B1");
    assert.equal(placementLevel(upTo(["A1", "A2", "B1", "B2", "C1", "C2"])), "C2");
  });

  it("forgives one slip but not two levels missed in a row", () => {
    assert.equal(placementLevel(upTo(["A1", "B1", "B2"])), "B2");
    assert.equal(placementLevel(upTo(["A1", "C1", "C2"])), "A1");
  });

  it("scores out of 100", () => {
    assert.equal(placementScore(upTo(["A1", "A2", "B1"])), 50);
  });
});

describe("self-check levels", () => {
  it("offers all six levels, advanced first, with approximate exam equivalents", () => {
    assert.deepEqual(
      SELF_CHECK_LEVELS.map((level) => level.value),
      ["C2", "C1", "B2", "B1", "A2", "A1"],
    );
    for (const level of SELF_CHECK_LEVELS) assert.match(level.detail, /TOEFL iBT .+\(approx\.\)$/);
    assert.match(SELF_CHECK_LEVELS[1].detail, /IELTS 7\.0 to 8\.0/);
  });
});
