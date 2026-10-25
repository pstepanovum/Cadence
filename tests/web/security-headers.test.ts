// FILE: tests/web/security-headers.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STATIC_SECURITY_HEADERS, buildCsp, createNonce } from "../../src/lib/security/headers.ts";

describe("security headers", () => {
  const value = (key: string) => STATIC_SECURITY_HEADERS.find((header) => header.key === key)?.value;

  it("sets HSTS, no framing, a referrer policy, nosniff and a microphone-only permissions policy", () => {
    assert.equal(value("Strict-Transport-Security"), "max-age=63072000; includeSubDomains; preload");
    assert.equal(value("X-Frame-Options"), "DENY");
    assert.equal(value("Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(value("X-Content-Type-Options"), "nosniff");
    assert.match(value("Permissions-Policy") ?? "", /microphone=\(self\), camera=\(\), geolocation=\(\)/);
  });

  it("builds a nonce CSP that forbids framing and allows Firebase, App Check and reCAPTCHA", () => {
    const nonce = createNonce();
    assert.match(nonce, /^[A-Za-z0-9+/]{22}==$/);
    assert.notEqual(nonce, createNonce());
    const csp = buildCsp(nonce);
    assert.match(csp, new RegExp(`script-src 'self' 'nonce-${nonce.replace(/[+/]/g, "\\$&")}' 'strict-dynamic'`));
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /media-src 'self' blob:/);
    for (const host of ["identitytoolkit.googleapis.com", "securetoken.googleapis.com", "firebaseappcheck.googleapis.com", "www.google.com/recaptcha/"]) {
      assert.ok(csp.includes(`https://${host}`), host);
    }
    assert.doesNotMatch(csp, /unsafe-eval/);
    assert.doesNotMatch(csp, /upgrade-insecure-requests/, "own-server mode is served over plain http on the LAN");
  });

  it("adds eval and websockets only in development, and the emulator only when named", () => {
    const dev = buildCsp("n", { development: true, authEmulatorHost: "127.0.0.1:9099", authDomain: "demo.firebaseapp.com" });
    assert.match(dev, /'unsafe-eval'/);
    assert.match(dev, /connect-src [^;]*http:\/\/127\.0\.0\.1:9099/);
    assert.match(dev, /frame-src [^;]*https:\/\/demo\.firebaseapp\.com/);
    assert.match(dev, /frame-src [^;]*http:\/\/127\.0\.0\.1:9099/, "Google and Apple sign-in frame the emulator");
    assert.doesNotMatch(buildCsp("n"), /9099/);
    assert.doesNotMatch(buildCsp("n", { authEmulatorHost: "evil.test; script-src *" }), /evil/);
  });
});
