// FILE: tests/cloud/profile-input.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProfileUpdate, reconcileFocusOnly } from "../../src/lib/cloud/profile-input.ts";

describe("validating a profile update", () => {
  it("accepts the onboarding answers", () => {
    assert.deepEqual(
      parseProfileUpdate({
        displayName: "  Ana ",
        practiceFocus: "vowels",
        practiceCadence: "weekend-only",
        onboardingCompleted: true,
      }),
      {
        ok: true,
        update: {
          displayName: "Ana",
          practiceFocus: "vowels",
          practiceCadence: "weekend-only",
          onboardingCompleted: true,
        },
      },
    );
  });

  it("accepts a single field", () => {
    assert.deepEqual(parseProfileUpdate({ displayName: "Sam" }), {
      ok: true,
      update: { displayName: "Sam" },
    });
  });

  it("drops fields it does not know rather than storing them", () => {
    assert.deepEqual(parseProfileUpdate({ displayName: "Sam", billing: { status: "active" } }), {
      ok: true,
      update: { displayName: "Sam" },
    });
    assert.equal(parseProfileUpdate({ billing: { status: "active" } }).ok, false);
  });

  it("refuses values outside the offered choices", () => {
    assert.equal(parseProfileUpdate({ practiceFocus: "everything" }).ok, false);
    assert.equal(parseProfileUpdate({ practiceCadence: "hourly" }).ok, false);
    assert.equal(parseProfileUpdate({ onboardingCompleted: "yes" }).ok, false);
    assert.equal(parseProfileUpdate({ displayName: 42 }).ok, false);
    assert.equal(parseProfileUpdate({ displayName: "x".repeat(61) }).ok, false);
  });

  it("accepts one or more learning goals and derives the older focus", () => {
    assert.deepEqual(parseProfileUpdate({ learningGoals: ["fluency", "grammar", "fluency"] }), {
      ok: true,
      update: { learningGoals: ["grammar", "fluency"], practiceFocus: "grammar" },
    });
    // A client that sends both keeps its own focus.
    assert.deepEqual(parseProfileUpdate({ learningGoals: ["work"], practiceFocus: "work" }), {
      ok: true,
      update: { practiceFocus: "work", learningGoals: ["work"] },
    });
    assert.equal(parseProfileUpdate({ practiceFocus: "grammar" }).ok, true);
  });

  it("refuses empty, unknown or non-list goals", () => {
    assert.equal(parseProfileUpdate({ learningGoals: [] }).ok, false);
    assert.equal(parseProfileUpdate({ learningGoals: ["work", "fame"] }).ok, false);
    assert.equal(parseProfileUpdate({ learningGoals: "work" }).ok, false);
    assert.equal(parseProfileUpdate({ learningGoals: Array(20).fill("work") }).ok, false);
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "name", [], 3]) {
      assert.equal(parseProfileUpdate(body).ok, false);
    }
  });

  it("accepts level settings and keeps only valid seen placement items", () => {
    const parsed = parseProfileUpdate({
      levels: { overall: "C1", skills: { pronunciation: "B2" }, source: "self", updatedAt: 1700000000000 },
      placementSeen: "c1.error:BB;junk",
    });
    assert.deepEqual(parsed, {
      ok: true,
      update: {
        levels: { overall: "C1", skills: { pronunciation: "B2" }, source: "self", updatedAt: 1700000000000 },
        placementSeen: "c1.error:BB",
      },
    });
    assert.equal(parseProfileUpdate({ levels: { overall: "Z9" } }).ok, false);
    assert.equal(parseProfileUpdate({ placementSeen: 12 }).ok, false);
    assert.equal(parseProfileUpdate({ placementSeen: "x".repeat(5000) }).ok, false);
  });

  it("moves the goals to a focus an older build changed, and keeps them when it resends the same one", () => {
    const changed = parseProfileUpdate({ practiceFocus: "work" });
    assert.ok(changed.ok);
    assert.deepEqual(reconcileFocusOnly(changed.update, "vowels"), { practiceFocus: "work", learningGoals: ["work"] });
    const same = parseProfileUpdate({ displayName: "Ana", practiceFocus: "vowels" });
    assert.ok(same.ok);
    assert.deepEqual(reconcileFocusOnly(same.update, "vowels"), { displayName: "Ana", practiceFocus: "vowels" });
    const both = parseProfileUpdate({ practiceFocus: "work", learningGoals: ["plateau", "work"] });
    assert.ok(both.ok);
    assert.deepEqual(reconcileFocusOnly(both.update, "vowels").learningGoals, ["plateau", "work"]);
  });
});
