// FILE: tests/auth/route-gate.test.ts
//
// The proxy's redirects: who may open which page in each mode.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decideRoute, needsSignInCheck, type RouteGateInput } from "../../src/lib/auth/route-gate.ts";

function gate(overrides: Partial<RouteGateInput>): RouteGateInput {
  return {
    pathname: "/dashboard",
    mode: "cloud",
    hasLocalProfile: false,
    cloudConfigured: true,
    signedIn: false,
    ...overrides,
  };
}

describe("before a mode is chosen", () => {
  it("sends protected pages and the signed-in cloud pages to setup", () => {
    for (const pathname of ["/dashboard", "/learn/basic", "/checkout", "/onboarding"]) {
      assert.deepEqual(decideRoute(gate({ mode: null, pathname })), {
        action: "redirect",
        pathname: "/setup",
        keepNext: true,
      });
    }
  });

  it("leaves public pages and the sign-in page alone", () => {
    for (const pathname of ["/", "/privacy", "/login", "/setup"]) {
      assert.deepEqual(decideRoute(gate({ mode: null, pathname })), { action: "next" });
    }
  });
});

describe("local mode", () => {
  it("needs the local profile for protected pages", () => {
    assert.deepEqual(decideRoute(gate({ mode: "local", hasLocalProfile: false })), {
      action: "redirect",
      pathname: "/setup",
      keepNext: true,
    });
    assert.deepEqual(decideRoute(gate({ mode: "local", hasLocalProfile: true })), {
      action: "next",
    });
  });

  it("keeps people out of cloud-only pages", () => {
    assert.deepEqual(
      decideRoute(gate({ mode: "local", hasLocalProfile: true, pathname: "/login" })),
      { action: "redirect", pathname: "/dashboard", keepNext: true },
    );
    assert.deepEqual(
      decideRoute(gate({ mode: "local", hasLocalProfile: false, pathname: "/checkout" })),
      { action: "redirect", pathname: "/setup", keepNext: true },
    );
  });

  it("never needs the session cookie", () => {
    assert.equal(needsSignInCheck(gate({ mode: "local" })), false);
  });
});

describe("cloud mode", () => {
  it("sends everything back to setup when the build has no Firebase config", () => {
    for (const pathname of ["/dashboard", "/login"]) {
      assert.deepEqual(decideRoute(gate({ cloudConfigured: false, pathname })), {
        action: "redirect",
        pathname: "/setup",
        keepNext: true,
      });
    }
    assert.equal(needsSignInCheck(gate({ cloudConfigured: false })), false);
  });

  it("sends a signed-out person to sign in", () => {
    for (const pathname of ["/dashboard", "/profile", "/checkout", "/onboarding"]) {
      assert.deepEqual(decideRoute(gate({ pathname })), {
        action: "redirect",
        pathname: "/login",
        keepNext: true,
      });
    }
  });

  it("lets a signed-out person reach the sign-in pages", () => {
    for (const pathname of ["/login", "/signup", "/forgot-password", "/reset-password"]) {
      assert.deepEqual(decideRoute(gate({ pathname })), { action: "next" });
    }
  });

  it("sends a signed-in person past the sign-in pages", () => {
    assert.deepEqual(decideRoute(gate({ pathname: "/login", signedIn: true })), {
      action: "redirect",
      pathname: "/dashboard",
      keepNext: false,
    });
  });

  it("opens email links signed in, signed out and in local mode", () => {
    for (const pathname of ["/reset-password", "/verify-email"]) {
      assert.deepEqual(decideRoute(gate({ pathname, signedIn: true })), { action: "next" });
      assert.deepEqual(decideRoute(gate({ pathname })), { action: "next" });
      assert.deepEqual(decideRoute(gate({ pathname, mode: "local", hasLocalProfile: true })), { action: "next" });
    }
  });

  it("keeps the account page behind sign-in", () => {
    assert.deepEqual(decideRoute(gate({ pathname: "/account" })), {
      action: "redirect",
      pathname: "/login",
      keepNext: true,
    });
  });

  it("lets a signed-in person reach checkout and onboarding after sign-up", () => {
    for (const pathname of ["/checkout", "/onboarding", "/dashboard"]) {
      assert.deepEqual(decideRoute(gate({ pathname, signedIn: true })), { action: "next" });
    }
  });

  it("only checks the cookie on pages whose answer depends on it", () => {
    assert.equal(needsSignInCheck(gate({ pathname: "/dashboard" })), true);
    assert.equal(needsSignInCheck(gate({ pathname: "/login" })), true);
    assert.equal(needsSignInCheck(gate({ pathname: "/" })), false);
    assert.equal(needsSignInCheck(gate({ pathname: "/api/health" })), false);
  });

  it("does not match a route by prefix alone", () => {
    assert.deepEqual(decideRoute(gate({ pathname: "/learning-tips" })), { action: "next" });
  });
});
