// FILE: tests/email/brevo-base.test.ts
//
// BREVO_API_URL may point Brevo calls at a local stub, and nowhere else.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BREVO_API, brevoApiBase } from "../../src/lib/server/email/brevo.ts";

describe("brevoApiBase", () => {
  it("is Brevo's API without an override", () => {
    assert.equal(brevoApiBase({}), BREVO_API);
    assert.equal(brevoApiBase({ BREVO_API_URL: "  " }), BREVO_API);
  });

  it("accepts a loopback http stub", () => {
    assert.equal(brevoApiBase({ BREVO_API_URL: "http://127.0.0.1:3399/v3" }), "http://127.0.0.1:3399/v3");
    assert.equal(brevoApiBase({ BREVO_API_URL: "http://localhost:3399/v3/" }), "http://localhost:3399/v3");
  });

  it("ignores anything that could send mail elsewhere", () => {
    for (const url of [
      "https://evil.example/v3",
      "http://evil.example/v3",
      "http://127.0.0.1.evil.example/v3",
      "http://localhost@evil.example/v3",
      "https://127.0.0.1:3399/v3",
      "http://[::1]:3399/v3",
      "file:///etc/passwd",
    ]) {
      assert.equal(brevoApiBase({ BREVO_API_URL: url }), BREVO_API, url);
    }
  });
});
