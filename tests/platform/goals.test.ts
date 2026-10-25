// FILE: tests/platform/goals.test.ts
//
// Learning goals (src/lib/platform/goals.ts): several at once, stored in the
// setup's order, older single values read back, and the single focus older
// builds still read derived without the old grammar-to-"daily" slip.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LEARNING_GOALS,
  LEARNING_GOAL_VALUES,
  focusForGoals,
  goalEmphasis,
  goalsFromFocus,
  parseGoals,
  resolveGoals,
  sameGoals,
  toggleGoal,
} from "../../src/lib/platform/goals.ts";

describe("learning goals", () => {
  it("lists every goal once, advanced ones first", () => {
    assert.deepEqual(LEARNING_GOALS.map((goal) => goal.value), [...LEARNING_GOAL_VALUES]);
    assert.equal(LEARNING_GOALS[0].value, "plateau");
  });

  it("parses arrays and older single values, in the setup's order", () => {
    assert.deepEqual(parseGoals(["fluency", "natural", "fluency", "fame", 3]), ["natural", "fluency"]);
    assert.deepEqual(parseGoals("grammar"), ["grammar"]);
    assert.deepEqual(parseGoals(null), []);
    assert.deepEqual(parseGoals({ goal: "work" }), []);
  });

  it("toggles one goal and compares choices", () => {
    const one = toggleGoal([], "work");
    const two = toggleGoal(one, "plateau");
    assert.deepEqual(two, ["plateau", "work"]);
    assert.deepEqual(toggleGoal(two, "plateau"), ["work"]);
    assert.ok(sameGoals(two, parseGoals(["work", "plateau"])));
    assert.ok(!sameGoals(one, two));
  });

  it("migrates an account that only has the older focus", () => {
    assert.deepEqual(goalsFromFocus("vowels"), ["accent"]);
    assert.deepEqual(goalsFromFocus("daily"), ["fluency"]);
    assert.deepEqual(goalsFromFocus("pronunciation"), []);
    assert.deepEqual(resolveGoals(undefined, "work"), ["work"]);
    assert.deepEqual(resolveGoals(["exam"], "work"), ["exam"]);
  });

  it("derives the older focus from the first goal", () => {
    assert.equal(focusForGoals(["grammar"]), "grammar");
    assert.equal(focusForGoals(["natural", "grammar"]), "conversations");
    assert.equal(focusForGoals(["accent"]), "vowels");
    assert.equal(focusForGoals([]), "conversations");
  });

  it("says what to emphasise", () => {
    assert.deepEqual(goalEmphasis([]), { sounds: false, grammar: false, phrases: false, conversation: false });
    assert.deepEqual(goalEmphasis(["plateau"]), { sounds: true, grammar: true, phrases: false, conversation: false });
    assert.equal(goalEmphasis(["natural"]).phrases, true);
  });
});
