// FILE: tests/platform/engine-routing.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AI_CAPABILITIES,
  EMPTY_USAGE,
  PLUS_DAILY_LIMITS,
  checkQuota,
  dataTier,
  quotaLeft,
  resolvePlus,
  routeRequest,
  sniffAudio,
  usageCost,
  type PlusRecord,
  type RoutingInput,
} from "../../src/lib/platform/engine-routing.ts";

const NOW = Date.UTC(2026, 9, 24);
const DAY = 86_400_000;

const record = (over: Partial<PlusRecord>): PlusRecord => ({
  active: true,
  source: "stripe",
  productId: "dev.pstepanov.cadence.plus.monthly",
  expiresAt: NOW + 10 * DAY,
  willRenew: true,
  updatedAt: NOW - DAY,
  ...over,
});

const home = { paired: true, reachable: true, capabilities: [...AI_CAPABILITIES] };
const cloudOk = { configured: true, paused: false, quotaLeft: 100 };
const input = (over: Partial<RoutingInput>): RoutingInput => ({
  capability: "score",
  local: null,
  signedIn: true,
  plus: false,
  cloud: cloudOk,
  ...over,
});

describe("entitlement", () => {
  it("is Plus when either source is active", () => {
    const lapsedStripe = record({ active: false, expiresAt: NOW - DAY });
    const activeApple = record({ source: "app_store", productId: "dev.pstepanov.cadence.plus.yearly" });
    const plus = resolvePlus({ stripe: lapsedStripe, app_store: activeApple }, NOW);
    assert.equal(plus?.active, true);
    assert.equal(plus?.source, "app_store");
  });

  it("prefers the active record that lasts longest", () => {
    const short = record({ expiresAt: NOW + DAY });
    const long = record({ source: "app_store", expiresAt: NOW + 300 * DAY });
    assert.equal(resolvePlus({ stripe: short, app_store: long }, NOW)?.source, "app_store");
  });

  it("is not Plus once the period has ended, even if a webhook is late", () => {
    const stale = record({ active: true, expiresAt: NOW - 1 });
    assert.equal(resolvePlus({ stripe: stale }, NOW)?.active, false);
  });

  it("returns null with no records at all", () => {
    assert.equal(resolvePlus({}, NOW), null);
  });

  it("maps to data tiers", () => {
    assert.equal(dataTier(false, false), "none");
    assert.equal(dataTier(true, false), "summary");
    assert.equal(dataTier(true, true), "full");
  });
});

describe("routing", () => {
  it("runs locally whenever the paired Cadence is reachable, Plus or not", () => {
    assert.deepEqual(routeRequest(input({ local: home })), { route: "local" });
    assert.deepEqual(routeRequest(input({ local: home, plus: true })), { route: "local" });
    assert.deepEqual(routeRequest(input({ local: home, signedIn: false })), { route: "local" });
  });

  it("falls back to the cloud for Plus when home is out of reach", () => {
    const away = { ...home, reachable: false };
    assert.deepEqual(routeRequest(input({ local: away, plus: true })), { route: "cloud", note: "local_unreachable" });
  });

  it("uses the cloud for a capability the local engines lack", () => {
    const noCoach = { ...home, capabilities: ["score" as const] };
    assert.deepEqual(routeRequest(input({ capability: "coach", local: noCoach, plus: true })), {
      route: "cloud",
      note: "local_missing_capability",
    });
  });

  it("offers your own Cadence or Plus to a free account", () => {
    assert.deepEqual(routeRequest(input({})), {
      route: "blocked",
      reason: "needs_plus",
      offers: ["connect_own_server", "plus"],
    });
  });

  it("asks a signed-out person to sign in or connect", () => {
    const decision = routeRequest(input({ signedIn: false }));
    assert.equal(decision.route, "blocked");
    assert.ok(decision.route === "blocked" && decision.reason === "needs_sign_in");
  });

  it("offers to reconnect rather than connect when a server is already paired", () => {
    const decision = routeRequest(input({ local: { ...home, reachable: false } }));
    assert.ok(decision.route === "blocked" && decision.offers[0] === "reconnect_own_server");
  });

  it("stops at the daily limit and when the circuit breaker is open, even for Plus", () => {
    const limit = routeRequest(input({ plus: true, cloud: { ...cloudOk, quotaLeft: 0 } }));
    assert.ok(limit.route === "blocked" && limit.reason === "daily_limit");
    assert.deepEqual(limit.route === "blocked" && limit.offers, ["connect_own_server"]);
    const paused = routeRequest(input({ plus: true, cloud: { ...cloudOk, paused: true } }));
    assert.ok(paused.route === "blocked" && paused.reason === "cloud_paused");
  });

  it("never sends anything to a cloud this build does not have", () => {
    const decision = routeRequest(input({ plus: true, cloud: { ...cloudOk, configured: false } }));
    assert.ok(decision.route === "blocked" && decision.reason === "cloud_unavailable");
  });
});

describe("quotas", () => {
  it("charges each capability to its own meter", () => {
    assert.deepEqual(usageCost("score", { audioSeconds: 4.2 }), { audioSeconds: 5, ttsCharacters: 0, coachTurns: 0 });
    assert.deepEqual(usageCost("tts", { characters: 120 }), { audioSeconds: 0, ttsCharacters: 120, coachTurns: 0 });
    assert.equal(usageCost("coach").coachTurns, 1);
  });

  it("refuses a request that would cross a ceiling", () => {
    const used = { ...EMPTY_USAGE, coachTurns: PLUS_DAILY_LIMITS.coachTurns };
    const check = checkQuota(used, usageCost("coach"));
    assert.equal(check.allowed, false);
    assert.deepEqual(check.exceeded, ["coachTurns"]);
    assert.equal(checkQuota(used, usageCost("tts", { characters: 10 })).allowed, true);
    assert.equal(quotaLeft("coach", used), 0);
  });
});

describe("audio sniffing", () => {
  const bytes = (text: string, at = 0) => {
    const out = new Uint8Array(16);
    [...text].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
    return out;
  };

  it("recognizes real containers and nothing else", () => {
    const wav = bytes("RIFF");
    "WAVE".split("").forEach((c, i) => (wav[8 + i] = c.charCodeAt(0)));
    assert.equal(sniffAudio(wav), "wav");
    assert.equal(sniffAudio(bytes("ftyp", 4)), "mp4");
    assert.equal(sniffAudio(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3])), "webm");
    assert.equal(sniffAudio(bytes("OggS")), "ogg");
    assert.equal(sniffAudio(bytes("<html>")), null);
    assert.equal(sniffAudio(new Uint8Array()), null);
  });
});
