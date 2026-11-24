// When Plus turns on from a grant (users/{uid}.plusSources.code: a code
// redeemed on the website), the app says so once, in a sheet. Pure, so what
// counts as new is tested (tests/plus-gift.test.ts); PlusGiftWatcher keeps
// what was seen in AsyncStorage per account and decides with these.
//
// The sheet never says where the grant came from: the app does not mention
// codes at all (App Review 3.1.1).
import type { Me } from "./me.ts";
import { isRecordActive } from "../platform/engine-routing.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** On the first check on a device, a grant shows only for an account this new (signed up, redeemed, then installed). */
export const NEW_ACCOUNT_MS = 3 * DAY_MS;

/** Plus from a grant: when it ends, or null for no end. */
export type PlusGrant = { expiresAt: number | null };

/**
 * The active grant on the account, or null. The server sends `plusGrant`;
 * an older server only sends the resolved record, whose source is "code"
 * when the grant is what keeps Plus on. Undefined while /api/me has not
 * loaded, so nothing is decided (or stored) before it has.
 */
export function grantFromMe(me: Me | null, now: number): PlusGrant | null | undefined {
  if (!me) return undefined;
  if (me.plusGrant !== undefined) {
    const grant = me.plusGrant;
    return grant && (grant.expiresAt === null || grant.expiresAt > now) ? grant : null;
  }
  return me.plus?.source === "code" && isRecordActive(me.plus, now) ? { expiresAt: me.plus.expiresAt } : null;
}

/**
 * Plus bought through a store (App Store or Stripe). The server says so as
 * `plusPaid`; otherwise the phone's own store answer, or a resolved record
 * from a store, stands in.
 */
export function subscribedFromMe(me: Me | null, storeActive: boolean, now: number): boolean {
  if (storeActive) return true;
  if (!me) return false;
  if (me.plusPaid !== null) return me.plusPaid;
  return me.plus !== null && me.plus.source !== "code" && isRecordActive(me.plus, now);
}

/** What is stored once a grant is seen: "none", "life", or "until:<ms>". */
export function plusGiftKey(grant: PlusGrant | null): string {
  if (!grant) return "none";
  return grant.expiresAt === null ? "life" : `until:${grant.expiresAt}`;
}

/**
 * Whether to show the sheet, and what to store. A new end date (a second code
 * extends the first) shows again. Plus bought in a store covers it, so nothing
 * shows then. `seen` null is the first check on this device, which shows only
 * for a new account, so an older account updating the app is not told about a
 * grant it already knew of.
 */
export function decidePlusGift(input: {
  grant: PlusGrant | null;
  subscribed: boolean;
  seen: string | null;
  accountCreatedAt: number | null;
  now: number;
}): { remember: string; show: boolean } {
  const grant = input.grant && (input.grant.expiresAt === null || input.grant.expiresAt > input.now) ? input.grant : null;
  const remember = plusGiftKey(grant);
  if (!grant || input.subscribed || input.seen === remember) return { remember, show: false };
  if (input.seen === null) {
    const created = input.accountCreatedAt;
    return { remember, show: created !== null && input.now - created >= 0 && input.now - created <= NEW_ACCOUNT_MS };
  }
  return { remember, show: true };
}

/** The tab screens the sheet may open over. Never a lesson, a game, a session or a modal. */
const CALM_PATHS = new Set(["/", "/learn", "/conversation", "/play"]);

export function isCalmPath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && CALM_PATHS.has(pathname);
}

/** How long the screen must stay calm before the sheet opens, so it never lands mid-transition. */
export const CALM_FOR_MS = 1200;

/** The sheet's words. Sentence case, no dashes, nothing about codes. */
export function plusGiftCopy(grant: PlusGrant, formatDate: (ms: number) => string): { title: string; body: string } {
  return {
    title: "Plus is on",
    body: grant.expiresAt === null ? "Everything in Plus is yours." : `Until ${formatDate(grant.expiresAt)}. Everything in Plus is yours.`,
  };
}
