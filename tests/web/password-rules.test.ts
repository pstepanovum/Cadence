// FILE: tests/web/password-rules.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkPassword, isPasswordAcceptable } from "../../src/components/auth/password-rules.ts";

describe("password rules", () => {
  it("accepts a long password with a letter and a number", () => {
    assert.equal(isPasswordAcceptable("river-stone 42"), true);
  });

  it("refuses short, letter-less or digit-less passwords", () => {
    assert.equal(isPasswordAcceptable("ab1"), false);
    assert.equal(isPasswordAcceptable("12345678"), false);
    assert.equal(isPasswordAcceptable("onlyletters"), false);
  });

  it("refuses a password containing the email's name", () => {
    assert.equal(isPasswordAcceptable("maria.lopez1", "maria.lopez@example.com"), false);
    assert.equal(isPasswordAcceptable("blue-kettle-7", "maria.lopez@example.com"), true);
  });

  it("does not flag the email rule before anything is typed", () => {
    assert.equal(checkPassword("", "ann@example.com").find((r) => r.id === "notEmail")?.met, true);
  });
});
