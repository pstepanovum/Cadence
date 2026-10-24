// FILE: tests/auth/auth-errors.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describeAuthError } from "../../src/lib/firebase/auth-errors.ts";

describe("describing a Firebase Auth error", () => {
  it("does not say which half of a wrong sign-in was wrong", () => {
    const expected = "That email and password do not match an account.";
    for (const code of ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"]) {
      assert.equal(describeAuthError({ code }, "fallback"), expected);
    }
  });

  it("explains rate limiting and network failures", () => {
    assert.match(describeAuthError({ code: "auth/too-many-requests" }, "x"), /Too many attempts/);
    assert.match(describeAuthError({ code: "auth/network-request-failed" }, "x"), /connection/);
  });

  it("keeps our own messages but hides raw SDK text", () => {
    assert.equal(describeAuthError(new Error("Could not start your session."), "x"), "Could not start your session.");
    assert.equal(describeAuthError(new Error("Firebase: Error (auth/internal-error)."), "fallback"), "fallback");
    assert.equal(describeAuthError({ code: "auth/something-new" }, "fallback"), "fallback");
    assert.equal(describeAuthError(null, "fallback"), "fallback");
  });
});
