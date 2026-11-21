// FILE: tests/platform/email-consent.test.ts
//
// Every email category is on unless the account stored false, and every
// sign-up form, web and iPhone, says so in one line with no checkbox.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { EMAIL_PREF_KEYS, SIGNUP_EMAIL_NOTICE, readEmailPrefs } from "../../src/lib/platform/email-consent.ts";
import { readAccount } from "../../src/lib/server/entitlement.ts";

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("email preferences", () => {
  it("reads unset as on", () => {
    assert.deepEqual(readEmailPrefs(undefined), { lifecycle: true, reminders: true, newsletter: true });
    assert.deepEqual(readEmailPrefs({}), { lifecycle: true, reminders: true, newsletter: true });
    assert.deepEqual(readEmailPrefs("junk"), { lifecycle: true, reminders: true, newsletter: true });
    assert.deepEqual(readEmailPrefs({ newsletter: null, reminders: "no" }), { lifecycle: true, reminders: true, newsletter: true }, "only a stored false turns one off");
  });

  it("lets a stored false win, one category at a time", () => {
    for (const key of EMAIL_PREF_KEYS) {
      const prefs = readEmailPrefs({ [key]: false });
      for (const other of EMAIL_PREF_KEYS) assert.equal(prefs[other], other !== key, `${key} off leaves ${other}`);
    }
    assert.deepEqual(readEmailPrefs({ lifecycle: true, reminders: false, newsletter: true }), { lifecycle: true, reminders: false, newsletter: true });
  });

  it("is what the account reports, for new and existing accounts alike", () => {
    assert.deepEqual(readAccount(undefined).emailPrefs, { lifecycle: true, reminders: true, newsletter: true });
    assert.deepEqual(readAccount({ email: "a@b.co", emailPrefs: { reminders: true } }).emailPrefs, { lifecycle: true, reminders: true, newsletter: true });
    assert.deepEqual(readAccount({ emailPrefs: { newsletter: false } }).emailPrefs, { lifecycle: true, reminders: true, newsletter: false });
  });
});

describe("the sign-up notice", () => {
  it("says what is sent and where to turn it off", () => {
    assert.equal(SIGNUP_EMAIL_NOTICE, "We'll email you practice tips and offers. Turn them off anytime in Account › Email.");
  });

  it("renders on the web sign-up form, with no checkbox", () => {
    const form = read("src/components/auth/AuthForm.tsx");
    assert.match(form, /\{!isLogin \? \([\s\S]{0,300}data-testid="signup-email-notice"[\s\S]{0,200}\{SIGNUP_EMAIL_NOTICE\}/, "shown when creating an account");
    assert.doesNotMatch(form, /type="checkbox"/, "no checkbox");
  });

  it("renders on the iPhone sign-up and setup forms, with no checkbox", () => {
    const options = read("mobile/src/components/auth/SignInOptions.tsx");
    assert.match(options, /\{creating \? \([\s\S]{0,300}email-notice[\s\S]{0,200}\{SIGNUP_EMAIL_NOTICE\}/, "shown when creating an account");
    assert.doesNotMatch(options, /accessibilityRole="checkbox"/, "no checkbox");
  });
});
