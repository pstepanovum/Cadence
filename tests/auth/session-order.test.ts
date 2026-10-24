// FILE: tests/auth/session-order.test.ts
//
// Which identity getAppSession() verifies for a request. The order is the
// security property: a bearer token beats cookies, and a device token is told
// apart from a Firebase ID token by its prefix alone.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chooseSessionSource, readBearerToken } from "../../src/lib/auth/bearer.ts";
import { generateDeviceToken } from "../../src/lib/pairing/service-logic.ts";
import { isRecentSignIn } from "../../src/lib/auth/session-cookie.ts";

const ID_TOKEN = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1aWQifQ.signature";

describe("reading a bearer token", () => {
  it("takes the token after the scheme", () => {
    assert.equal(readBearerToken(`Bearer ${ID_TOKEN}`), ID_TOKEN);
    assert.equal(readBearerToken("Bearer   padded  "), "padded");
  });

  it("ignores anything that is not a bearer token", () => {
    assert.equal(readBearerToken(null), null);
    assert.equal(readBearerToken(undefined), null);
    assert.equal(readBearerToken(""), null);
    assert.equal(readBearerToken("Bearer "), null);
    assert.equal(readBearerToken("Basic dXNlcjpwYXNz"), null);
    assert.equal(readBearerToken("bearer lowercase"), null);
  });
});

describe("choosing the session source", () => {
  it("checks a paired-device token first, whatever the cookies say", () => {
    const token = generateDeviceToken();
    for (const modeCookie of ["local", "cloud", null] as const) {
      assert.deepEqual(
        chooseSessionSource({ authorization: `Bearer ${token}`, modeCookie }),
        { kind: "device", token },
      );
    }
  });

  it("treats any other bearer token as a Firebase ID token, ahead of cookies", () => {
    for (const modeCookie of ["local", "cloud", null] as const) {
      assert.deepEqual(
        chooseSessionSource({ authorization: `Bearer ${ID_TOKEN}`, modeCookie }),
        { kind: "id-token", token: ID_TOKEN },
      );
    }
  });

  it("falls back to the cookie for the chosen mode only without a bearer token", () => {
    assert.deepEqual(chooseSessionSource({ authorization: null, modeCookie: "local" }), {
      kind: "local-cookie",
    });
    assert.deepEqual(chooseSessionSource({ authorization: null, modeCookie: "cloud" }), {
      kind: "session-cookie",
    });
    assert.deepEqual(chooseSessionSource({ authorization: "Basic abc", modeCookie: "cloud" }), {
      kind: "session-cookie",
    });
  });

  it("has no identity with neither a token nor a mode", () => {
    assert.deepEqual(chooseSessionSource({ authorization: null, modeCookie: null }), {
      kind: "none",
    });
  });
});

describe("starting a session from an ID token", () => {
  const now = 1_800_000_000_000;

  it("accepts a sign-in from the last five minutes", () => {
    assert.equal(isRecentSignIn(now / 1000 - 10, now), true);
    assert.equal(isRecentSignIn(now / 1000 - 300, now), true);
  });

  it("refuses an older sign-in, so a leaked token cannot start a fresh session", () => {
    assert.equal(isRecentSignIn(now / 1000 - 301, now), false);
  });
});
