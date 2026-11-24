import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseMe } from "../src/lib/me.ts";
import { decidePlusGift, grantFromMe, isCalmPath, NEW_ACCOUNT_MS, plusGiftCopy, plusGiftKey, subscribedFromMe } from "../src/lib/plus-gift.ts";

const NOW = Date.UTC(2026, 10, 24);
const DAY = 86_400_000;
const record = (source: string, expiresAt: number | null) => ({ active: true, source, productId: "p", expiresAt, willRenew: false, updatedAt: 1 });

describe("Plus from a grant: what /api/me says", () => {
  it("reads plusGrant and plusPaid when the server sends them", () => {
    const me = parseMe({ plus: record("code", NOW + 30 * DAY), plusGrant: { expiresAt: NOW + 30 * DAY }, plusPaid: false }, NOW);
    assert.deepEqual(grantFromMe(me, NOW), { expiresAt: NOW + 30 * DAY });
    assert.equal(subscribedFromMe(me, false, NOW), false);
  });

  it("an ended grant from the server is no grant", () => {
    const me = parseMe({ plusGrant: { expiresAt: NOW - 1 }, plusPaid: false }, NOW);
    assert.equal(grantFromMe(me, NOW), null);
    assert.equal(grantFromMe(parseMe({ plusGrant: null }, NOW), NOW), null);
  });

  it("falls back to the resolved record on an older server", () => {
    const code = parseMe({ plus: record("code", NOW + DAY) }, NOW);
    assert.equal(code.plus?.source, "code");
    assert.deepEqual(grantFromMe(code, NOW), { expiresAt: NOW + DAY });
    assert.equal(subscribedFromMe(code, false, NOW), false);
    const store = parseMe({ plus: record("app_store", NOW + DAY) }, NOW);
    assert.equal(grantFromMe(store, NOW), null);
    assert.equal(subscribedFromMe(store, false, NOW), true);
    assert.equal(grantFromMe(parseMe({ plus: record("code", NOW - 1) }, NOW), NOW), null);
  });

  it("decides nothing before /api/me has loaded", () => {
    assert.equal(grantFromMe(null, NOW), undefined);
  });

  it("the phone's own store purchase counts as subscribed", () => {
    assert.equal(subscribedFromMe(parseMe({ plusPaid: false }, NOW), true, NOW), true);
    assert.equal(subscribedFromMe(null, false, NOW), false);
  });
});

describe("decidePlusGift", () => {
  const grant = { expiresAt: NOW + 90 * DAY };

  it("shows a new grant once, then remembers it", () => {
    const first = decidePlusGift({ grant, subscribed: false, seen: "none", accountCreatedAt: NOW - 200 * DAY, now: NOW });
    assert.deepEqual(first, { remember: plusGiftKey(grant), show: true });
    assert.equal(decidePlusGift({ grant, subscribed: false, seen: first.remember, accountCreatedAt: null, now: NOW }).show, false);
  });

  it("shows again when a second grant moves the end date", () => {
    const later = { expiresAt: grant.expiresAt + 30 * DAY };
    assert.equal(decidePlusGift({ grant: later, subscribed: false, seen: plusGiftKey(grant), accountCreatedAt: null, now: NOW }).show, true);
  });

  it("on the first check on a device, shows only for a new account", () => {
    const fresh = decidePlusGift({ grant, subscribed: false, seen: null, accountCreatedAt: NOW - DAY, now: NOW });
    assert.equal(fresh.show, true);
    const old = decidePlusGift({ grant, subscribed: false, seen: null, accountCreatedAt: NOW - NEW_ACCOUNT_MS - 1, now: NOW });
    assert.deepEqual(old, { remember: plusGiftKey(grant), show: false });
    assert.equal(decidePlusGift({ grant, subscribed: false, seen: null, accountCreatedAt: null, now: NOW }).show, false);
    assert.equal(decidePlusGift({ grant, subscribed: false, seen: null, accountCreatedAt: NOW + DAY, now: NOW }).show, false);
  });

  it("stays quiet with a store subscription, and remembers the grant", () => {
    assert.deepEqual(decidePlusGift({ grant, subscribed: true, seen: "none", accountCreatedAt: NOW, now: NOW }), { remember: plusGiftKey(grant), show: false });
  });

  it("no grant, or an ended one, stores none", () => {
    assert.deepEqual(decidePlusGift({ grant: null, subscribed: false, seen: null, accountCreatedAt: NOW, now: NOW }), { remember: "none", show: false });
    assert.deepEqual(decidePlusGift({ grant: { expiresAt: NOW }, subscribed: false, seen: "none", accountCreatedAt: NOW, now: NOW }), { remember: "none", show: false });
  });

  it("keys a grant with no end as life", () => {
    assert.equal(plusGiftKey({ expiresAt: null }), "life");
    assert.equal(plusGiftKey({ expiresAt: 5 }), "until:5");
  });
});

describe("where and what the sheet says", () => {
  it("opens only over the calm tab screens", () => {
    for (const path of ["/", "/learn", "/conversation", "/play"]) assert.equal(isCalmPath(path), true, path);
    for (const path of ["/coach", "/lesson/a1", "/conversation/cafe", "/game/flashcards", "/plus", "/onboarding", "/learn/modules", "", null]) {
      assert.equal(isCalmPath(path), false, String(path));
    }
  });

  it("names the end date, never a code, with no dashes", () => {
    const copy = plusGiftCopy({ expiresAt: NOW }, () => "24 December 2026");
    assert.deepEqual(copy, { title: "Plus is on", body: "Until 24 December 2026. Everything in Plus is yours." });
    assert.equal(plusGiftCopy({ expiresAt: null }, () => "").body, "Everything in Plus is yours.");
    for (const text of [copy.title, copy.body]) {
      assert.doesNotMatch(text, /code|[–—]/i);
    }
  });
});
