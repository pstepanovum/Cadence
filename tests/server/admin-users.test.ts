// FILE: tests/server/admin-users.test.ts
//
// The pure parts of the owner's account list (GET /api/admin/users): query
// parsing, the cursor, the plan each account is on (from the same record
// every Plus gate reads), and the activity and platform signals.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readAccount } from "../../src/lib/server/entitlement.ts";
import {
  authTime,
  classifyPlan,
  decodeCursor,
  encodeCursor,
  lastActive,
  latestPlatform,
  matchesPlanFilter,
  matchesQuery,
  parseUsersQuery,
} from "../../src/lib/server/users/logic.ts";

const NOW = Date.UTC(2026, 10, 23, 12);
const DAY = 86_400_000;

const record = (source: "stripe" | "app_store" | "code", over: Record<string, unknown> = {}) => ({
  active: true,
  source,
  productId: "dev.pstepanov.cadence.plus.monthly",
  expiresAt: NOW + 30 * DAY,
  willRenew: true,
  updatedAt: NOW - DAY,
  eventAt: NOW - DAY,
  ...over,
});

describe("account list query", () => {
  const parse = (query: string) => parseUsersQuery(new URLSearchParams(query));

  it("has defaults and cleans the search", () => {
    assert.deepEqual(parse(""), { q: "", cursor: null, limit: 50, plan: "all" });
    assert.deepEqual(parse("q=%20Maria%40Example%20&limit=10&plan=paid"), { q: "maria@example", cursor: null, limit: 10, plan: "paid" });
    assert.equal((parse("limit=100") as { limit: number }).limit, 100);
  });

  it("refuses what it cannot serve", () => {
    for (const bad of ["limit=0", "limit=101", "limit=ten", "limit=1.5", "plan=gold", `q=${"x".repeat(101)}`, "cursor=nope!", "cursor=abc"]) {
      assert.equal(typeof parse(bad), "string", bad);
    }
  });

  it("round-trips the cursor and rejects tampered ones", () => {
    const cursor = { s: 1_763_900_000, n: 123_456_000, id: "Uid_123-abc" };
    const encoded = encodeCursor(cursor);
    assert.deepEqual(decodeCursor(encoded), cursor);
    assert.deepEqual((parse(`cursor=${encoded}`) as { cursor: unknown }).cursor, cursor);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify([1, 2, "../x"])).toString("base64url")), null);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify([1, -1, "x"])).toString("base64url")), null);
    assert.equal(decodeCursor(Buffer.from(JSON.stringify({ s: 1 })).toString("base64url")), null);
  });
});

describe("plan classification", () => {
  const plan = (data: Record<string, unknown> | undefined) => classifyPlan(readAccount(data, NOW), NOW);

  it("is free with no Plus or a lapsed one", () => {
    assert.deepEqual(plan(undefined), { plan: "free", planUntil: null });
    assert.deepEqual(plan({ plusSources: { stripe: record("stripe", { active: false, expiresAt: NOW - DAY }) } }), { plan: "free", planUntil: null });
    assert.deepEqual(plan({ plusSources: { stripe: record("stripe", { expiresAt: NOW - 1 }) } }), { plan: "free", planUntil: null }, "a period that ran out without its webhook");
  });

  it("names paid, trial, code and lifetime Plus", () => {
    assert.deepEqual(plan({ plusSources: { stripe: record("stripe") } }), { plan: "plus", planUntil: NOW + 30 * DAY });
    assert.deepEqual(plan({ plusSources: { app_store: record("app_store", { trial: true, expiresAt: NOW + 3 * DAY }) } }), { plan: "trial", planUntil: NOW + 3 * DAY });
    assert.deepEqual(plan({ plusSources: { code: record("code", { willRenew: false, expiresAt: NOW + 7 * DAY, codeId: "c" }) } }), { plan: "code", planUntil: NOW + 7 * DAY });
    assert.deepEqual(plan({ plusSources: { app_store: record("app_store", { expiresAt: null, willRenew: false }) } }), { plan: "lifetime", planUntil: null });
  });

  it("follows the resolved record: the longest active source wins", () => {
    const data = { plusSources: { stripe: record("stripe", { expiresAt: NOW + 10 * DAY }), code: record("code", { expiresAt: NOW + 90 * DAY }) } };
    assert.deepEqual(plan(data), { plan: "code", planUntil: NOW + 90 * DAY });
    // A stored resolved `plus` is what every gate reads, so it is what the list reads too.
    assert.equal(plan({ ...data, plus: record("stripe", { expiresAt: NOW + 10 * DAY }) }).plan, "plus");
  });

  it("filters free and paid", () => {
    assert.equal(matchesPlanFilter("free", "all"), true);
    assert.equal(matchesPlanFilter("free", "free"), true);
    assert.equal(matchesPlanFilter("free", "paid"), false);
    for (const paid of ["plus", "trial", "code", "lifetime"] as const) {
      assert.equal(matchesPlanFilter(paid, "paid"), true);
      assert.equal(matchesPlanFilter(paid, "free"), false);
    }
  });
});

describe("search, activity and platform", () => {
  it("matches a substring of the email or the name, ignoring case", () => {
    const row = { email: "Maria.Lopez@Example.com", name: "María López" };
    assert.equal(matchesQuery(row, ""), true);
    assert.equal(matchesQuery(row, "maria.lo"), true);
    assert.equal(matchesQuery(row, "example.com"), true);
    assert.equal(matchesQuery(row, "lópez"), true);
    assert.equal(matchesQuery(row, "nobody"), false);
    assert.equal(matchesQuery({ email: null, name: null }, "a"), false);
  });

  it("prefers the app's own activity, then Firebase Auth's", () => {
    assert.equal(lastActive([NOW - DAY, null, NOW - 2 * DAY], [NOW]), NOW - DAY);
    assert.equal(lastActive([null, undefined], [NOW - 5 * DAY, NOW - 4 * DAY]), NOW - 4 * DAY);
    assert.equal(lastActive([], [null]), null);
    assert.equal(authTime("Mon, 23 Nov 2026 12:00:00 GMT"), NOW);
    assert.equal(authTime(""), null);
    assert.equal(authTime(undefined), null);
  });

  it("takes the platform of the device seen last", () => {
    assert.equal(latestPlatform([]), null);
    assert.equal(latestPlatform([{ platform: "ios", at: 1 }, { platform: "android", at: 5 }]), "android");
    assert.equal(latestPlatform([{ platform: "desktop", at: 9 }, { platform: "web", at: 2 }]), "web");
    assert.equal(latestPlatform([{ platform: "unknown", at: 9 }]), null);
  });
});
