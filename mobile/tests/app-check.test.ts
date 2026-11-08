import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { APP_CHECK_REFUSED, assertionBody, attestationBody, isAppCheckRefusal } from "../src/lib/app-check-rest.ts";

describe("App Attest exchange bodies", () => {
  it("sends the key id exactly as App Attest returned it", () => {
    // DCAppAttestService's key ids are already base64; Google's own client
    // sends them unchanged, and a second encoding names a key nobody attested.
    const keyId = "q1u0a2Jl+Ky/aWQ9PQ==";
    const body = attestationBody(keyId, "YXR0ZXN0YXRpb24=", "Y2hhbGxlbmdl");
    assert.equal(body.key_id, keyId);
    assert.notEqual(body.key_id, Buffer.from(keyId).toString("base64"));
    assert.deepEqual(body, { attestation_statement: "YXR0ZXN0YXRpb24=", challenge: "Y2hhbGxlbmdl", key_id: keyId });
  });

  it("passes the stored artifact, assertion and challenge through", () => {
    assert.deepEqual(assertionBody("YXJ0aWZhY3Q=", "YXNzZXJ0aW9u", "Y2hhbGxlbmdl"), {
      artifact: "YXJ0aWZhY3Q=",
      assertion: "YXNzZXJ0aW9u",
      challenge: "Y2hhbGxlbmdl",
    });
  });
});

describe("isAppCheckRefusal", () => {
  it("recognises the hosted API's App Check refusal", () => {
    assert.equal(isAppCheckRefusal({ error: APP_CHECK_REFUSED, message: "This app could not be verified." }), true);
    assert.equal(isAppCheckRefusal({ code: APP_CHECK_REFUSED }), true);
  });

  it("leaves a real sign-in failure to sign the person out", () => {
    assert.equal(isAppCheckRefusal({ error: "unauthorized", message: "Sign in to continue." }), false);
    assert.equal(isAppCheckRefusal({ error: "Unauthorized." }), false);
    assert.equal(isAppCheckRefusal(null), false);
    assert.equal(isAppCheckRefusal("app_check_failed"), false);
  });
});
