// FILE: src/lib/server/users/logic.ts
//
// The owner's list of Cadence accounts (GET /api/admin/users): the rules that
// need no database. Query parsing, the opaque page cursor, the plan each
// account is on, and the row the dashboard sees.
//
// The plan is read from the same resolved record every Plus gate reads
// (readAccount over users/{uid}.plus and plusSources), never guessed anew:
// no Plus is "free"; Plus from a friend code is "code"; a trial is "trial";
// a period with no end is "lifetime"; anything else paid is "plus".
import type { AccountState } from "../entitlement";
import { hasPlus } from "../../platform/engine-routing";

export const USERS_LIMITS = { defaultLimit: 50, maxLimit: 100, queryLength: 100 } as const;

export type PlanFilter = "all" | "free" | "paid";
export type Plan = "free" | "plus" | "trial" | "code" | "lifetime";
export type Platform = "ios" | "android" | "web";

export interface UsersQuery {
  /** Lowercased, trimmed; empty for none. */
  q: string;
  cursor: Cursor | null;
  limit: number;
  plan: PlanFilter;
}

/** Where the previous page stopped: its last account's createdAt (exact, as seconds and nanoseconds) and id. */
export interface Cursor {
  s: number;
  n: number;
  id: string;
}

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: number | null;
  lastActiveAt: number | null;
  plan: Plan;
  planUntil: number | null;
  platform: Platform | null;
  alsoUses: string[];
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify([cursor.s, cursor.n, cursor.id]), "utf8").toString("base64url");
}

export function decodeCursor(value: string): Cursor | null {
  if (!value || value.length > 400 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 3) return null;
    const [s, n, id] = parsed as unknown[];
    if (!Number.isInteger(s) || !Number.isInteger(n) || (n as number) < 0 || (n as number) > 999_999_999) return null;
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    return { s: s as number, n: n as number, id };
  } catch {
    return null;
  }
}

/** The query string, or a sentence saying what is wrong. */
export function parseUsersQuery(params: URLSearchParams): UsersQuery | string {
  const rawQ = params.get("q") ?? "";
  if (rawQ.length > USERS_LIMITS.queryLength) return `q is at most ${USERS_LIMITS.queryLength} characters.`;
  const q = rawQ.normalize("NFKC").trim().toLowerCase();

  const rawLimit = params.get("limit");
  let limit: number = USERS_LIMITS.defaultLimit;
  if (rawLimit !== null && rawLimit !== "") {
    if (!/^\d{1,3}$/.test(rawLimit)) return `limit is a whole number from 1 to ${USERS_LIMITS.maxLimit}.`;
    limit = Number(rawLimit);
    if (limit < 1 || limit > USERS_LIMITS.maxLimit) return `limit is a whole number from 1 to ${USERS_LIMITS.maxLimit}.`;
  }

  const rawPlan = params.get("plan") || "all";
  if (rawPlan !== "all" && rawPlan !== "free" && rawPlan !== "paid") return 'plan is "all", "free" or "paid".';

  const rawCursor = params.get("cursor");
  let cursor: Cursor | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
    if (!cursor) return "cursor is not one this server gave.";
  }
  return { q, cursor, limit, plan: rawPlan };
}

/** The plan, from the record every Plus gate reads, and when its current period ends. */
export function classifyPlan(account: Pick<AccountState, "plus">, now: number): { plan: Plan; planUntil: number | null } {
  const plus = account.plus as (AccountState["plus"] & { trial?: boolean }) | null;
  if (!plus || !hasPlus(plus, now)) return { plan: "free", planUntil: null };
  const planUntil = plus.expiresAt;
  if (plus.source === "code") return { plan: "code", planUntil };
  if (plus.trial === true) return { plan: "trial", planUntil };
  if (plus.expiresAt === null) return { plan: "lifetime", planUntil: null };
  return { plan: "plus", planUntil };
}

export function matchesPlanFilter(plan: Plan, filter: PlanFilter): boolean {
  if (filter === "all") return true;
  return filter === "free" ? plan === "free" : plan !== "free";
}

/** Case-insensitive substring of the email or the name. An empty query matches everyone. */
export function matchesQuery(row: { email: string | null; name: string | null }, q: string): boolean {
  if (!q) return true;
  return [row.email, row.name].some((field) => typeof field === "string" && field.normalize("NFKC").toLowerCase().includes(q));
}

/** A device document's platform as the dashboard names it; the desktop app and unknown ones are null. */
export function toPlatform(value: unknown): Platform | null {
  return value === "ios" || value === "android" || value === "web" ? value : null;
}

/** The platform of the device seen most recently (users/{uid}/devices). */
export function latestPlatform(devices: readonly { platform: unknown; at: number | null }[]): Platform | null {
  let best: { platform: Platform; at: number } | null = null;
  for (const device of devices) {
    const platform = toPlatform(device.platform);
    if (!platform) continue;
    const at = device.at ?? 0;
    if (!best || at > best.at) best = { platform, at };
  }
  return best?.platform ?? null;
}

/** The best activity signal: the app's own (progress summary, device syncs), else Firebase Auth's last token refresh or sign-in. */
export function lastActive(appSignals: readonly (number | null | undefined)[], authSignals: readonly (number | null | undefined)[]): number | null {
  const newest = (values: readonly (number | null | undefined)[]) => values.reduce<number | null>((best, value) => (typeof value === "number" && Number.isFinite(value) && value > 0 && (best === null || value > best) ? value : best), null);
  return newest(appSignals) ?? newest(authSignals);
}

/** A date string from Firebase Auth's user metadata, as epoch milliseconds. */
export function authTime(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
