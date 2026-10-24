// FILE: tests/cloud/profile-input.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProfileUpdate } from "../../src/lib/cloud/profile-input.ts";

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

  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "name", [], 3]) {
      assert.equal(parseProfileUpdate(body).ok, false);
    }
  });
});
