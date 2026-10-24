import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authErrorCode, describeAuthError } from "../src/copy/auth-errors.ts";

const FALLBACK = "Could not sign in. Try again.";

describe("authErrorCode", () => {
  it("reads the code off an SDK error", () => {
    assert.equal(authErrorCode({ code: "auth/too-many-requests" }), "auth/too-many-requests");
  });

  it("returns null when there is no code", () => {
    assert.equal(authErrorCode(new Error("boom")), null);
    assert.equal(authErrorCode(null), null);
    assert.equal(authErrorCode("auth/invalid-email"), null);
  });
});

describe("describeAuthError", () => {
  it("does not say which half of a bad sign-in was wrong", () => {
    const message = describeAuthError({ code: "auth/invalid-credential" }, FALLBACK);
    assert.equal(describeAuthError({ code: "auth/wrong-password" }, FALLBACK), message);
    assert.equal(describeAuthError({ code: "auth/user-not-found" }, FALLBACK), message);
  });

  it("names the network when the service cannot be reached", () => {
    assert.match(
      describeAuthError({ code: "auth/network-request-failed" }, FALLBACK),
      /connection/,
    );
  });

  it("falls back for codes it does not know and for plain errors", () => {
    assert.equal(describeAuthError({ code: "auth/internal-error" }, FALLBACK), FALLBACK);
    assert.equal(describeAuthError(new Error("Firebase: Error (auth/x)."), FALLBACK), FALLBACK);
  });
});
