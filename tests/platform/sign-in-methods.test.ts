// FILE: tests/platform/sign-in-methods.test.ts
//
// The shared sign-in method rules (src/lib/platform/sign-in-methods.ts).
// Run with: pnpm test
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addableMethods,
  canRemoveMethod,
  continueLabel,
  linkedMethods,
  pendingLinkFromError,
  pendingLinkMessage,
  providerButtons,
  suggestedMethods,
} from "../../src/lib/platform/sign-in-methods.ts";

describe("provider buttons", () => {
  it("puts Apple first on iOS and never shows Google there alone", () => {
    assert.deepEqual(providerButtons("ios", { apple: true, google: true }), ["apple.com", "google.com"]);
    assert.deepEqual(providerButtons("ios", { apple: true, google: false }), ["apple.com"]);
    assert.deepEqual(providerButtons("ios", { apple: false, google: true }), []);
  });

  it("shows whatever is configured on the web and Android, Apple first", () => {
    assert.deepEqual(providerButtons("web", { apple: true, google: true }), ["apple.com", "google.com"]);
    assert.deepEqual(providerButtons("android", { apple: false, google: true }), ["google.com"]);
    assert.deepEqual(providerButtons("web", { apple: false, google: false }), []);
  });

  it("words the buttons the way Apple and Google ask", () => {
    assert.equal(continueLabel("apple.com", "signin"), "Sign in with Apple");
    assert.equal(continueLabel("google.com", "signup"), "Sign up with Google");
  });
});

describe("linked methods", () => {
  it("lists the known methods in order and ignores the rest", () => {
    assert.deepEqual(linkedMethods(["password", "phone", "apple.com"]), ["apple.com", "password"]);
  });

  it("never lets the last way in be removed", () => {
    assert.equal(canRemoveMethod(["password"], "password"), false);
    assert.equal(canRemoveMethod(["password", "google.com"], "password"), true);
    assert.equal(canRemoveMethod(["google.com"], "apple.com"), false, "not linked");
    // A provider Cadence does not offer still signs in, so it counts.
    assert.equal(canRemoveMethod(["google.com", "phone"], "google.com"), true);
    assert.equal(canRemoveMethod(["google.com", "google.com"], "google.com"), false, "duplicates are one method");
  });

  it("offers only what this surface can add", () => {
    assert.deepEqual(addableMethods(["password"], ["apple.com", "google.com", "password"]), ["apple.com", "google.com"]);
    assert.deepEqual(addableMethods(["google.com"], ["google.com", "password"]), ["password"]);
  });
});

describe("same email, another provider", () => {
  const conflict = { code: "auth/account-exists-with-different-credential", customData: { email: "ana@example.com" } };

  it("reads the conflict from Firebase's error", () => {
    assert.deepEqual(pendingLinkFromError(conflict, "apple.com"), { method: "apple.com", email: "ana@example.com" });
    assert.equal(pendingLinkFromError({ code: "auth/invalid-credential" }, "apple.com"), null);
    assert.equal(pendingLinkFromError(null, "apple.com"), null);
    assert.deepEqual(pendingLinkFromError({ code: conflict.code }, "google.com"), { method: "google.com", email: null });
  });

  it("suggests the methods the account has, or every other one when Firebase will not say", () => {
    const pending = { method: "apple.com" as const, email: "ana@example.com" };
    const offered = ["apple.com", "google.com", "password"] as const;
    assert.deepEqual(suggestedMethods(pending, offered, ["password"]), ["password"]);
    assert.deepEqual(suggestedMethods(pending, offered, []), ["google.com", "password"]);
  });

  it("says what will happen in one line", () => {
    assert.equal(
      pendingLinkMessage({ method: "google.com", email: "ana@example.com" }),
      "ana@example.com already has a Cadence account. Sign in the way you did before, and Google will be added to it.",
    );
  });
});
