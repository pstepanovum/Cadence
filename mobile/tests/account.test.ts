import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { planForPackage, purchaseMessage, renewalLine, sortPlans, yearlySavingsPercent, FALLBACK_PLANS } from "../src/lib/billing/plans.ts";
import { parseMe, quotaLeftFor } from "../src/lib/me.ts";
import { compareVersions, parseVersionInfo, updateNotice } from "../src/lib/version-check.ts";

const NOW = Date.UTC(2026, 9, 24);

describe("GET /api/me", () => {
  it("reads an active Plus record as the full tier", () => {
    const me = parseMe({ plus: { active: true, source: "stripe", productId: "p", expiresAt: NOW + 1000, willRenew: true, updatedAt: 1 } }, NOW);
    assert.equal(me.tier, "full");
    assert.equal(me.plus?.source, "stripe");
  });

  it("treats a lapsed or malformed record as free", () => {
    assert.equal(parseMe({ plus: { active: true, expiresAt: NOW - 1 } }, NOW).tier, "summary");
    assert.equal(parseMe({ plus: "yes" }, NOW).plus, null);
    assert.equal(parseMe(null, NOW).tier, "summary");
  });

  it("prefers the server's tier when it sends one", () => {
    assert.equal(parseMe({ tier: "full" }, NOW).tier, "full");
  });

  it("reads quota as used or as left", () => {
    const used = parseMe({ quota: { used: { audioSeconds: 600, ttsCharacters: 0, coachTurns: 119 } } }, NOW);
    assert.equal(quotaLeftFor(used, "score"), 1200);
    assert.equal(quotaLeftFor(used, "coach"), 1);
    const left = parseMe({ quota: { left: { audioSeconds: 0, ttsCharacters: 20000, coachTurns: 120 } } }, NOW);
    assert.equal(quotaLeftFor(left, "transcribe"), 0);
    assert.equal(quotaLeftFor(parseMe({}, NOW), "tts"), null);
  });

  it("reads the circuit breaker and the newsletter choice", () => {
    const me = parseMe({ cloudPaused: true, newsletter: true }, NOW);
    assert.equal(me.cloudPaused, true);
    assert.equal(me.newsletter, true);
  });
});

describe("plans", () => {
  it("maps packages to plans and puts yearly first", () => {
    assert.equal(planForPackage("$rc_annual", "x"), "yearly");
    assert.equal(planForPackage("custom", "dev.pstepanov.cadence.plus.monthly"), "monthly");
    assert.equal(planForPackage("custom", "other"), null);
    assert.deepEqual(sortPlans([{ id: "monthly" as const }, { id: "yearly" as const }]).map((p) => p.id), ["yearly", "monthly"]);
  });

  it("works out the yearly saving from the real prices", () => {
    assert.equal(yearlySavingsPercent(FALLBACK_PLANS[1].price, FALLBACK_PLANS[0].price), 44);
    assert.equal(yearlySavingsPercent(undefined, 99), null);
  });

  it("explains store errors calmly", () => {
    assert.match(purchaseMessage({ code: "10" }), /offline/);
    assert.match(purchaseMessage({ code: "20" }), /approval/);
    assert.match(purchaseMessage(new Error("x")), /weren't charged/);
  });

  it("says when Plus renews or ends", () => {
    const at = Date.UTC(2026, 2, 3, 12);
    assert.equal(renewalLine({ expiresAt: at, willRenew: true }), "Renews on March 3, 2026.");
    assert.equal(renewalLine({ expiresAt: at, willRenew: false }), "Ends on March 3, 2026.");
    assert.equal(renewalLine({ expiresAt: null, willRenew: false }), null);
  });
});

describe("update notices", () => {
  const url = "https://apps.apple.com/app/id1";

  it("reads the iOS block and refuses non-App Store links", () => {
    assert.deepEqual(parseVersionInfo({ ios: { latest: "1.2.0", minimumBuild: "3", appStoreUrl: url } }), { latest: "1.2.0", minimumBuild: 3, appStoreUrl: url });
    assert.equal(parseVersionInfo({ ios: { appStoreUrl: "https://evil.example/app" } }).appStoreUrl, null);
    assert.deepEqual(parseVersionInfo(null), { latest: null, minimumBuild: null, appStoreUrl: null });
  });

  it("compares semantic versions", () => {
    assert.ok(compareVersions("1.0.9", "1.0.10") < 0);
    assert.equal(compareVersions("1.2", "1.2.0"), 0);
  });

  it("is soft when behind the latest and blocking only below the minimum build", () => {
    const info = parseVersionInfo({ ios: { latest: "1.2.0", minimumBuild: 5, appStoreUrl: url } });
    assert.deepEqual(updateNotice(info, { version: "1.2.0", build: 9 }), { kind: "none" });
    assert.deepEqual(updateNotice(info, { version: "1.1.3", build: 9 }), { kind: "available", version: "1.2.0", storeUrl: url });
    assert.deepEqual(updateNotice(info, { version: "1.1.3", build: 4 }), { kind: "required", storeUrl: url });
  });

  it("never shows or blocks without an App Store URL", () => {
    const info = parseVersionInfo({ ios: { latest: "9.0.0", minimumBuild: 99, appStoreUrl: null } });
    assert.deepEqual(updateNotice(info, { version: "1.0.0", build: 1 }), { kind: "none" });
  });
});
