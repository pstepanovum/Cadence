// FILE: tests/platform/daily-plan.test.ts
//
// Today's plan (src/lib/platform/daily-plan.ts): always 10 to 15 minutes,
// due cards first and at most 5 minutes of them, weak sounds and grammar
// next, AI practice only when it is available, and deterministic for a fixed
// input in any order.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PLAN_MAX_MINUTES, PLAN_MIN_MINUTES, buildDailyPlan, type PlanInput } from "../../src/lib/platform/daily-plan.ts";

const TODAY = "2026-10-24";
const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ cardId: `card.b1.${String(i).padStart(3, "0")}`, due: i % 3 === 0 ? "2026-10-20" : TODAY }));
const base: PlanInput = { today: TODAY, dueCards: [], sounds: [], grammar: [], level: "B1", aiAvailable: false };
const full: PlanInput = {
  ...base,
  dueCards: cards(40),
  sounds: [
    { soundId: "sound.th", ema: 52, attempts: 9 },
    { soundId: "sound.r", ema: 61, attempts: 4 },
    { soundId: "sound.ih", ema: 70, attempts: 6 },
    { soundId: "sound.s", ema: 95, attempts: 20 },
  ],
  soundFrequency: { "sound.th": 0.6, "sound.r": 0.9, "sound.ih": 0.8, "sound.s": 1 },
  grammar: [
    { grammarPointId: "gp.b1.present-perfect", accuracy: 45, attempts: 11 },
    { grammarPointId: "gp.b1.conditionals", accuracy: 60, attempts: 5 },
  ],
  aiAvailable: true,
};

describe("daily plan", () => {
  it("fits 10 to 15 minutes for every mix of input", () => {
    const variants: PlanInput[] = [];
    for (const dueCards of [[], cards(1), cards(6), cards(40)])
      for (const sounds of [[], full.sounds.slice(0, 1), full.sounds])
        for (const grammar of [[], full.grammar])
          for (const aiAvailable of [false, true]) variants.push({ ...full, dueCards, sounds, grammar, aiAvailable, level: null });
    for (const input of variants) {
      const plan = buildDailyPlan(input);
      assert.ok(plan.minutes >= PLAN_MIN_MINUTES && plan.minutes <= PLAN_MAX_MINUTES, `${plan.minutes} minutes: ${JSON.stringify(plan.items)}`);
      assert.equal(plan.minutes, plan.items.reduce((sum, item) => sum + item.minutes, 0));
    }
  });

  it("puts due cards first, most overdue first, at most five minutes", () => {
    const plan = buildDailyPlan(full);
    const first = plan.items[0];
    assert.equal(first.kind, "flashcards");
    assert.ok(first.kind === "flashcards" && first.minutes <= 5 && first.cardIds.length === 15);
    assert.ok(first.kind === "flashcards" && first.cardIds[0] === "card.b1.000", "an overdue card leads");
  });

  it("then the weakest sound by score and frequency, a grammar point and shadowing", () => {
    const kinds = buildDailyPlan(full).items.map((item) => (item.kind === "sound" ? `sound:${item.soundId}` : item.kind === "grammar" ? `grammar:${item.grammarPointId}` : item.kind));
    // sound.r: (100 - 61) x 0.9 = 35.1 outweighs sound.th: (100 - 52) x 0.6 = 28.8.
    assert.deepEqual(kinds, ["flashcards", "sound:sound.r", "grammar:gp.b1.present-perfect", "shadowing"]);
  });

  it("offers no AI practice without AI, and fills up with a lesson at the learner's level", () => {
    const plan = buildDailyPlan({ ...full, aiAvailable: false, dueCards: [] });
    assert.ok(!plan.items.some((item) => item.kind === "shadowing" || item.kind === "coach"));
    const empty = buildDailyPlan(base);
    assert.deepEqual(empty.items, [{ kind: "lesson", level: "B1", minutes: 10 }]);
  });

  it("is deterministic: the same input, in any order, gives the same plan", () => {
    const shuffled: PlanInput = { ...full, dueCards: [...full.dueCards].reverse(), sounds: [...full.sounds].reverse(), grammar: [...full.grammar].reverse() };
    assert.deepEqual(buildDailyPlan(full), buildDailyPlan(full));
    assert.deepEqual(buildDailyPlan(shuffled), buildDailyPlan(full));
  });

  it("ignores cards not yet due and sounds that are already good", () => {
    const plan = buildDailyPlan({ ...base, dueCards: [{ cardId: "card.x", due: "2026-10-30" }], sounds: [{ soundId: "sound.s", ema: 95, attempts: 3 }] });
    assert.ok(!plan.items.some((item) => item.kind === "flashcards" || item.kind === "sound"));
  });
});

describe("the learner's goals", () => {
  const kinds = (input: PlanInput) => buildDailyPlan(input).items.map((item) => item.kind);

  it("keeps the default order with no goals", () => {
    assert.deepEqual(kinds({ ...full, goals: [] }), kinds(full));
  });

  it("puts grammar before sounds for a grammar or exam goal", () => {
    const order = kinds({ ...full, dueCards: [], goals: ["grammar"] });
    assert.ok(order.indexOf("grammar") < order.indexOf("sound"), order.join(","));
    const exam = kinds({ ...full, dueCards: [], goals: ["exam"] });
    assert.ok(exam.indexOf("grammar") < exam.indexOf("sound"), exam.join(","));
  });

  it("keeps sounds first when a sound goal is chosen too", () => {
    const order = kinds({ ...full, dueCards: [], goals: ["grammar", "accent"] });
    assert.ok(order.indexOf("sound") < order.indexOf("grammar"), order.join(","));
  });

  it("talks with the coach instead of shadowing for conversation goals", () => {
    assert.ok(kinds({ ...full, dueCards: [], goals: [] }).includes("shadowing"));
    const order = kinds({ ...full, dueCards: [], goals: ["fluency"] });
    assert.ok(order.includes("coach") && !order.includes("shadowing"), order.join(","));
  });

  it("gives a longer phrase review to sound natural", () => {
    const dueItems = Array.from({ length: 20 }, (_, i) => ({ itemId: `phrase.${i}`, due: TODAY }));
    const phrases = (goals: PlanInput["goals"]) => buildDailyPlan({ ...base, dueItems, goals }).items.find((item) => item.kind === "phrases");
    assert.equal(phrases([])?.minutes, 3);
    assert.equal(phrases(["natural"])?.minutes, 5);
  });

  it("stays within 10 to 15 minutes for any goals", () => {
    for (const goals of [["plateau"], ["natural", "work"], ["exam", "grammar", "fluency"]] as const) {
      const plan = buildDailyPlan({ ...full, goals });
      assert.ok(plan.minutes >= PLAN_MIN_MINUTES && plan.minutes <= PLAN_MAX_MINUTES, `${goals.join(",")}: ${plan.minutes}`);
    }
  });
});
