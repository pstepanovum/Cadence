// FILE: src/lib/server/codes/logic.ts
//
// Friend codes: the rules that need no database.
//
// A friend code gives complimentary Cadence Plus for a set number of days and
// then ends by itself. Codes are made on the owner's dashboard
// (pstepanov.dev, through /api/admin/codes) and redeemed only on the website's
// /redeem page, never in the iPhone app. The grant is one more Plus source,
// users/{uid}.plusSources.code, resolved with the others by resolvePlus, so
// every gate, every client and the daily purge read it the same way.
//
// No code gives Plus for life: every code carries a whole number of days, at
// most CODE_LIMITS.maxDurationDays. The contract (fields, limits, messages)
// matches the other apps the dashboard manages, so the dashboard's one client
// (the portfolio's lib/apps/codes-client.ts) works for all of them.
import { createHash, randomInt } from "node:crypto";

export const DAY_MS = 24 * 60 * 60 * 1000;

export const CODE_PREFIX = "CADENCE";

export const CODE_LIMITS = {
  minLength: 4,
  maxLength: 40,
  labelLength: 80,
  minDurationDays: 1,
  /** Two years. A friend code lends Plus for a while; it never gives it away for good. */
  maxDurationDays: 730,
  maxRedemptions: 10_000,
} as const;

/** Letters and digits that cannot be mistaken for one another when read aloud or typed from a screenshot. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** friendCodes/{codeId}. Times are epoch milliseconds. */
export interface FriendCode {
  code: string;
  codeHash: string;
  label: string;
  /** How long the Plus each redemption gives lasts, in whole days. 0 only when read leniently for the owner's list. */
  durationDays: number;
  maxRedemptions: number;
  redemptions: number;
  /** The last moment the code can be redeemed; null when it never stops working. */
  expiresAt: number | null;
  disabled: boolean;
  createdAt: number;
  createdBy: string;
}

/** friendCodes/{codeId}/redemptions/{uid}. */
export interface FriendCodeRedemption {
  uid: string;
  email?: string;
  redeemedAt: number;
  /** When the code's Plus ends after this redemption. */
  grantExpiresAt: number | null;
  revokedAt?: number;
}

/** The productId a code's Plus record carries, so the account page can tell it apart from a purchase. */
export const CODE_PRODUCT_ID = "dev.pstepanov.cadence.plus.code";

/** "7 days", "1 month", "3 months", "1 year": whole 365-day years and 30-day months read as such. */
export function describeGrantDuration(days: number): string {
  const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;
  if (days % 365 === 0) return plural(days / 365, "year");
  if (days % 30 === 0) return plural(days / 30, "month");
  return plural(days, "day");
}

/** Trimmed, uppercase, inner spaces removed, dash-like characters made hyphens: "cadence–abcd efgh" matches CADENCE-ABCD-EFGH. */
export function normalizeCode(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
    .replace(/\s+/g, "");
}

export function isWellFormedCode(normalized: string): boolean {
  return normalized.length >= CODE_LIMITS.minLength && normalized.length <= CODE_LIMITS.maxLength && /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(normalized);
}

/** SHA-256 of the normalized code, hex. Also the document id, which makes codes unique. */
export function hashCode(normalized: string): string {
  return createHash("sha256").update(normalized).digest("hex");
}

/** A readable code such as CADENCE-7KQ2-XH9D. */
export function generateCode(prefix = CODE_PREFIX, pick: (max: number) => number = randomInt): string {
  const group = () => Array.from({ length: 4 }, () => CODE_ALPHABET[pick(CODE_ALPHABET.length)]).join("");
  return `${prefix}-${group()}-${group()}`;
}

/**
 * When the code's Plus ends after a redemption: the later of what the
 * person's current code grant already runs to and now plus the code's days.
 * A code never shortens a longer grant; purchases are separate sources and
 * are never touched.
 */
export function extendedGrantExpiry(current: { active: boolean; expiresAt: number | null } | null, durationDays: number, now: number): number {
  const fromCode = now + durationDays * DAY_MS;
  const existing = current && current.active && typeof current.expiresAt === "number" && current.expiresAt > now ? current.expiresAt : 0;
  return Math.max(existing, fromCode);
}

export type RedeemFailure = "invalid" | "disabled" | "expired" | "exhausted" | "already_redeemed";

/** Why a code cannot be redeemed by this person now, or null when it can. */
export function redeemFailure(code: FriendCode | null, alreadyRedeemed: boolean, now: number): RedeemFailure | null {
  if (!code) return "invalid";
  if (code.disabled) return "disabled";
  if (code.expiresAt !== null && code.expiresAt <= now) return "expired";
  if (alreadyRedeemed) return "already_redeemed";
  if (code.redemptions >= code.maxRedemptions) return "exhausted";
  return null;
}

/**
 * Plain words, so a used-up code is not mistaken for a typo. Naming the reason
 * reveals only that some code exists: redeeming needs a signed-in account, ten
 * tries an hour, and a generated code is eight characters from a 31-letter
 * alphabet, so nothing can be found by guessing.
 */
export function redeemFailureMessage(reason: RedeemFailure): string {
  switch (reason) {
    case "already_redeemed":
      return "You've already redeemed this code.";
    case "disabled":
      return "That code has been turned off.";
    case "expired":
      return "That code has expired.";
    case "exhausted":
      return "That code has already been used up.";
    default:
      return "We couldn't find that code. Check it for a typo.";
  }
}

export interface CreateCodeInput {
  label: string;
  /** Normalized custom code; absent to generate one. */
  code?: string;
  durationDays: number;
  maxRedemptions: number;
  expiresAt: number | null;
}

const isInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value);

/** Checks a request to create a code. The input, or a sentence saying what is wrong. */
export function parseCreateCodeInput(body: Record<string, unknown> | null, now: number): CreateCodeInput | string {
  if (!body) return "Send a JSON object.";

  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label) return "Give the code a label.";
  if (label.length > CODE_LIMITS.labelLength) return `Keep the label under ${CODE_LIMITS.labelLength} characters.`;

  let code: string | undefined;
  if (body.code !== undefined && body.code !== null && body.code !== "") {
    code = normalizeCode(body.code);
    if (!isWellFormedCode(code)) {
      return `A custom code is ${CODE_LIMITS.minLength} to ${CODE_LIMITS.maxLength} letters and digits, in groups joined by hyphens.`;
    }
  }

  const durationDays = body.durationDays;
  if (!isInteger(durationDays) || durationDays < CODE_LIMITS.minDurationDays || durationDays > CODE_LIMITS.maxDurationDays) {
    return `durationDays is a whole number of days from ${CODE_LIMITS.minDurationDays} to ${CODE_LIMITS.maxDurationDays}.`;
  }

  const maxRedemptions = body.maxRedemptions ?? 1;
  if (!isInteger(maxRedemptions) || maxRedemptions < 1 || maxRedemptions > CODE_LIMITS.maxRedemptions) {
    return `maxRedemptions is a whole number from 1 to ${CODE_LIMITS.maxRedemptions}.`;
  }

  const expiresAt = body.expiresAt ?? null;
  if (expiresAt !== null && (!isInteger(expiresAt) || expiresAt <= now)) {
    return "expiresAt is a time in the future, in epoch milliseconds, or null.";
  }

  return { label, code, durationDays, maxRedemptions, expiresAt };
}

export function isUsableDuration(days: unknown): days is number {
  return isInteger(days) && days >= CODE_LIMITS.minDurationDays && days <= CODE_LIMITS.maxDurationDays;
}

/** A stored code for the owner's list; `durationDays` 0 when the document names no usable one. Null when it is not a code. */
export function parseStoredCode(data: unknown): FriendCode | null {
  if (!data || typeof data !== "object") return null;
  const value = data as Record<string, unknown>;
  if (typeof value.code !== "string" || typeof value.codeHash !== "string") return null;
  const number = (field: unknown, fallback: number) => (typeof field === "number" && Number.isFinite(field) ? field : fallback);
  return {
    code: value.code,
    codeHash: value.codeHash,
    label: typeof value.label === "string" ? value.label : "",
    durationDays: isUsableDuration(value.durationDays) ? value.durationDays : 0,
    maxRedemptions: number(value.maxRedemptions, 0),
    redemptions: number(value.redemptions, 0),
    expiresAt: typeof value.expiresAt === "number" ? value.expiresAt : null,
    disabled: value.disabled === true,
    createdAt: number(value.createdAt, 0),
    createdBy: typeof value.createdBy === "string" ? value.createdBy : "",
  };
}

/** A stored code on the redemption path: one with no usable duration is no code at all, never Plus with no end. */
export function parseFriendCode(data: unknown): FriendCode | null {
  const stored = parseStoredCode(data);
  return stored && isUsableDuration(stored.durationDays) ? stored : null;
}
