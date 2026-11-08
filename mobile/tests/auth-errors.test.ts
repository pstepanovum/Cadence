import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authErrorCode, describeAuthError, isCancelledSignIn } from "../src/copy/auth-errors.ts";

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

  it("says a test build's emulator is down instead of blaming the connection", () => {
    const message = describeAuthError({ code: "auth/network-request-failed" }, FALLBACK, { emulator: "127.0.0.1:9099" });
    assert.match(message, /test build/);
    assert.match(message, /127\.0\.0\.1:9099/);
    assert.doesNotMatch(describeAuthError({ code: "auth/network-request-failed" }, FALLBACK, { emulator: null }), /emulator/);
  });

  it("explains a provider that is not turned on and a sign-in already used elsewhere", () => {
    assert.match(describeAuthError({ code: "auth/operation-not-allowed" }, FALLBACK), /isn't available/);
    assert.match(describeAuthError({ code: "auth/credential-already-in-use" }, FALLBACK), /another Cadence account/);
    assert.match(describeAuthError({ code: "auth/email-already-in-use" }, FALLBACK), /Apple or Google/);
  });

  it("states the project's password policy when a new password breaks it", () => {
    assert.match(describeAuthError({ code: "auth/password-does-not-meet-requirements" }, FALLBACK), /8 to 128 characters/);
  });

  it("falls back for codes it does not know and for plain errors", () => {
    assert.equal(describeAuthError({ code: "auth/internal-error" }, FALLBACK), FALLBACK);
    assert.equal(describeAuthError(new Error("Firebase: Error (auth/x)."), FALLBACK), FALLBACK);
  });
});

describe("isCancelledSignIn", () => {
  it("treats a closed Apple or Google sheet as no error", () => {
    assert.equal(isCancelledSignIn({ code: "ERR_REQUEST_CANCELED" }), true);
    assert.equal(isCancelledSignIn({ code: "SIGN_IN_CANCELLED" }), true);
    assert.equal(isCancelledSignIn({ code: "auth/popup-closed-by-user" }), true);
    assert.equal(isCancelledSignIn({ code: "auth/network-request-failed" }), false);
    assert.equal(isCancelledSignIn(null), false);
  });
});
