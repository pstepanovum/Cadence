import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProfile, toProfile } from "../src/lib/profile.ts";

describe("parseProfile", () => {
  it("reads fields wrapped in a profile object", () => {
    assert.deepEqual(
      parseProfile({
        profile: {
          displayName: "  Ada ",
          practiceFocus: "vowels",
          practiceCadence: "5-minutes",
          onboardingCompleted: true,
        },
      }),
      {
        displayName: "Ada",
        practiceFocus: "vowels",
        practiceCadence: "5-minutes",
        onboardingCompleted: true,
      },
    );
  });

  it("reads fields at the top level", () => {
    assert.deepEqual(parseProfile({ displayName: "Ada", onboardingCompleted: false }), {
      displayName: "Ada",
      onboardingCompleted: false,
    });
  });

  it("drops unknown values instead of trusting them", () => {
    assert.deepEqual(
      parseProfile({
        displayName: "   ",
        practiceFocus: "juggling",
        practiceCadence: 15,
        onboardingCompleted: "yes",
      }),
      {},
    );
  });

  it("treats anything that is not an object as empty", () => {
    assert.deepEqual(parseProfile(null), {});
    assert.deepEqual(parseProfile("profile"), {});
    assert.deepEqual(parseProfile({ profile: null }), {});
  });
});

describe("toProfile", () => {
  it("fills in defaults for a new account", () => {
    assert.deepEqual(toProfile({}, null), {
      displayName: "Learner",
      practiceFocus: "conversations",
      learningGoals: [],
      practiceCadence: "15-minutes",
      onboardingCompleted: false,
    });
  });

  it("reads several goals, and an older account's focus as one", () => {
    const parsed = parseProfile({ profile: { learningGoals: ["fluency", "nonsense", "plateau"] } });
    assert.deepEqual(parsed.learningGoals, ["plateau", "fluency"]);
    assert.deepEqual(toProfile(parsed, null).learningGoals, ["plateau", "fluency"]);
    assert.equal(toProfile(parsed, null).practiceFocus, "vowels");
    assert.deepEqual(toProfile({ practiceFocus: "work" }, null).learningGoals, ["work"]);
    assert.equal(parseProfile({ practiceFocus: "grammar" }).practiceFocus, "grammar");
  });

  it("falls back to the email's name before the generic one", () => {
    assert.equal(toProfile({}, { email: "ada@example.com" }).displayName, "ada");
    assert.equal(toProfile({ displayName: "Ada L" }, { email: "ada@example.com" }).displayName, "Ada L");
  });
});
