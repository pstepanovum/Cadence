// FILE: tests/server/password-reset.test.ts
//
// Cadence's own password reset, without the emulators: token shape and hash,
// the link, who gets what (password account, Apple or Google only, unknown),
// the emails and their one retry, and that nothing anywhere still uses
// Firebase's reset links or emails. tests/server/emulator/password-reset.test.ts
// runs the Firestore half for real.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { renderTemplate } from "../../src/lib/server/email/templates/index.ts";
import { hashResetToken, isResetTokenShape, issuePasswordReset, newResetToken, resetPageUrl, socialProviders, type ResetAuth, type ResetUser } from "../../src/lib/server/password-reset.ts";
import { deliverResetPlan, sendWithOneRetry } from "../../src/lib/server/password-reset-mail.ts";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function fakeAuth(users: ResetUser[]): ResetAuth {
  return {
    getUserByEmail: async (email) => users.find((u) => u.email === email) ?? null,
    getUser: async (uid) => users.find((u) => u.uid === uid) ?? null,
    setPassword: async () => undefined,
    revokeSessions: async () => null,
  };
}

/** A Brevo stub: records each message, failing the first `failures` sends. */
function brevo(failures = 0) {
  const sent: { to: string; subject: string; html: string }[] = [];
  let calls = 0;
  const fetch = (async (_url: string, init: RequestInit) => {
    calls += 1;
    if (calls <= failures) return new Response(JSON.stringify({ message: "down" }), { status: 503 });
    const body = JSON.parse(String(init.body));
    sent.push({ to: body.to[0].email, subject: body.subject, html: body.htmlContent });
    return new Response(JSON.stringify({ messageId: "m" }), { status: 201 });
  }) as typeof globalThis.fetch;
  return { sent, deps: { fetch, env: { BREVO_API_KEY: "test", CADENCE_PUBLIC_ORIGIN: "https://cadence.pstepanov.dev" }, log: () => undefined } };
}

describe("reset tokens", () => {
  it("are 32 random bytes in base64url, stored only as a SHA-256", () => {
    const token = newResetToken();
    assert.ok(isResetTokenShape(token));
    assert.equal(Buffer.from(token, "base64url").length, 32);
    assert.notEqual(newResetToken(), token);
    assert.match(hashResetToken(token), /^[0-9a-f]{64}$/);
    assert.equal(hashResetToken(token), hashResetToken(token));
    assert.ok(!hashResetToken(token).includes(token));
  });

  it("refuse anything else", () => {
    for (const bad of ["", "short", `${"a".repeat(43)}=`, "a".repeat(44), "../../etc/passwd....................................", null, 42]) assert.equal(isResetTokenShape(bad), false);
  });

  it("go on our own page, never a Firebase action link", () => {
    const url = resetPageUrl("A".repeat(43), "https://cadence.pstepanov.dev");
    assert.equal(url, `https://cadence.pstepanov.dev/reset-password?token=${"A".repeat(43)}`);
    assert.doesNotMatch(url, /oobCode|firebaseapp|__\/auth/);
  });
});

describe("who gets what", () => {
  const users: ResetUser[] = [
    { uid: "g", email: "g@example.com", emailVerified: true, disabled: false, providers: ["google.com"] },
    { uid: "ag", email: "ag@example.com", emailVerified: true, disabled: false, providers: ["google.com", "apple.com"] },
    { uid: "off", email: "off@example.com", emailVerified: true, disabled: true, providers: ["password"] },
  ];

  it("an Apple or Google account gets no token, only the note", async () => {
    assert.deepEqual(await issuePasswordReset("g@example.com", { auth: fakeAuth(users) }), { kind: "social", email: "g@example.com", providers: ["google"] });
    assert.deepEqual(await issuePasswordReset("ag@example.com", { auth: fakeAuth(users) }), { kind: "social", email: "ag@example.com", providers: ["apple", "google"] });
    assert.deepEqual(socialProviders(["password", "apple.com"]), ["apple"]);
  });

  it("an unknown or disabled address gets nothing", async () => {
    assert.deepEqual(await issuePasswordReset("nobody@example.com", { auth: fakeAuth(users) }), { kind: "none" });
    assert.deepEqual(await issuePasswordReset("off@example.com", { auth: fakeAuth(users) }), { kind: "none" });
  });
});

describe("the emails", () => {
  it("a password account gets our link, valid 60 minutes", async () => {
    const { sent, deps } = brevo();
    const token = newResetToken();
    assert.equal(await deliverResetPlan({ kind: "password", uid: "u", email: "maria@example.com", token }, deps), true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "maria@example.com");
    assert.equal(sent[0].subject, "Reset your Cadence password");
    assert.ok(sent[0].html.includes(`https://cadence.pstepanov.dev/reset-password?token=${token}`));
    assert.match(sent[0].html, /works for an hour, and only once/);
  });

  it("an Apple or Google account gets the note, with no link to reset", async () => {
    const { sent, deps } = brevo();
    await deliverResetPlan({ kind: "social", email: "g@example.com", providers: ["google"] }, deps);
    assert.equal(sent[0].subject, "You sign in to Cadence with Google");
    assert.doesNotMatch(sent[0].html, /reset-password\?token=/);
  });

  it("an unknown address gets nothing", async () => {
    const { sent, deps } = brevo();
    assert.equal(await deliverResetPlan({ kind: "none" }, deps), true);
    assert.equal(sent.length, 0);
  });

  it("a failed send is tried once more, and only once", async () => {
    const once = brevo(1);
    assert.equal(await deliverResetPlan({ kind: "password", uid: "u", email: "maria@example.com", token: newResetToken() }, once.deps), true);
    assert.equal(once.sent.length, 1);
    let tries = 0;
    const quiet = console.error;
    console.error = () => undefined;
    try {
      assert.equal(await sendWithOneRetry(async () => { tries += 1; throw new Error("down"); }, "test"), false);
    } finally {
      console.error = quiet;
    }
    assert.equal(tries, 2);
  });

  it("render in the current design", () => {
    const social = renderTemplate("password-reset-social", { email: "g@example.com", providers: ["apple", "google"] });
    assert.equal(social.subject, "You sign in to Cadence with Apple or Google");
    assert.equal(social.category, "transactional");
  });
});

describe("Firebase's reset is gone", () => {
  it("no code calls Firebase's reset links or emails", () => {
    const files: string[] = [];
    for (const dir of ["src", "mobile/src"]) {
      for (const rel of readdirSync(join(ROOT, dir), { recursive: true }).map(String)) {
        if (/\.(ts|tsx)$/.test(rel) && !rel.includes("node_modules")) files.push(join(dir, rel));
      }
    }
    const offenders = files.filter((file) => /generatePasswordResetLink|sendPasswordResetEmail|confirmPasswordReset|verifyPasswordResetCode/.test(readFileSync(join(ROOT, file), "utf8")));
    assert.deepEqual(offenders, []);
  });
});
