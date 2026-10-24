// FILE: src/lib/server/rate-limit.ts
//
// Fixed-window counters in rateLimits/{key}, shared by every instance (Cloud
// Run gives no affinity, so an in-memory counter would be per instance and
// useless). One transaction per limited call: read the window, refuse or count.
// Each document carries expireAt for the TTL policy the owner turns on at
// deploy time (docs/DEPLOY.md), so old windows clean themselves up.
//
// Subjects (an IP, an email, a uid) are hashed into the key: the collection
// never holds an address in the clear. A uid subject is also stored as a field
// so account deletion can find and remove that person's counters.
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { db as defaultDb } from "./firebase";

export interface RateLimitRule {
  /** A short name for the limit, part of the key: "mcp-hour", "reset-ip". */
  name: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
}

export function windowStart(nowMs: number, windowSeconds: number): number {
  const size = windowSeconds * 1000;
  return Math.floor(nowMs / size) * size;
}

export function rateLimitKey(rule: RateLimitRule, subject: string): string {
  const digest = createHash("sha256").update(subject).digest("hex").slice(0, 40);
  return `${rule.name}:${digest}`;
}

/** The pure decision, given what the window holds now. */
export function decide(stored: { windowStart: number; count: number } | null, rule: RateLimitRule, nowMs: number): RateLimitResult & { next: { windowStart: number; count: number } } {
  const start = windowStart(nowMs, rule.windowSeconds);
  const current = stored && stored.windowStart === start ? stored.count : 0;
  if (current >= rule.limit) {
    const retry = Math.max(1, Math.ceil((start + rule.windowSeconds * 1000 - nowMs) / 1000));
    return { allowed: false, count: current, limit: rule.limit, retryAfterSeconds: retry, next: { windowStart: start, count: current } };
  }
  return { allowed: true, count: current + 1, limit: rule.limit, retryAfterSeconds: 0, next: { windowStart: start, count: current + 1 } };
}

export async function hitRateLimit(
  rule: RateLimitRule,
  subject: string,
  options: { uid?: string; now?: number; db?: Firestore } = {},
): Promise<RateLimitResult> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const ref = firestore.collection("rateLimits").doc(rateLimitKey(rule, subject));

  return firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const data = snapshot.data();
    const stored =
      data && typeof data.windowStart === "number" && typeof data.count === "number"
        ? { windowStart: data.windowStart, count: data.count }
        : null;
    const result = decide(stored, rule, now);
    if (result.allowed) {
      tx.set(ref, {
        windowStart: result.next.windowStart,
        count: result.next.count,
        ...(options.uid ? { uid: options.uid } : {}),
        expireAt: Timestamp.fromMillis(result.next.windowStart + rule.windowSeconds * 1000 * 2),
      });
    }
    return { allowed: result.allowed, count: result.count, limit: result.limit, retryAfterSeconds: result.retryAfterSeconds };
  });
}

/** Checks several rules in order; the first refusal wins and later ones are not counted. */
export async function hitAll(
  checks: { rule: RateLimitRule; subject: string; uid?: string }[],
  options: { now?: number; db?: Firestore } = {},
): Promise<RateLimitResult> {
  let last: RateLimitResult = { allowed: true, count: 0, limit: 0, retryAfterSeconds: 0 };
  for (const check of checks) {
    last = await hitRateLimit(check.rule, check.subject, { ...options, uid: check.uid });
    if (!last.allowed) return last;
  }
  return last;
}

// The limits, in one place so docs/DEPLOY.md and the tests can name them.
export const LIMITS = {
  mcpFreeHour: { name: "mcp-free-hour", limit: 30, windowSeconds: 3600 },
  mcpFreeDay: { name: "mcp-free-day", limit: 200, windowSeconds: 86400 },
  mcpPlusHour: { name: "mcp-plus-hour", limit: 120, windowSeconds: 3600 },
  mcpPlusDay: { name: "mcp-plus-day", limit: 2000, windowSeconds: 86400 },
  authIpHour: { name: "auth-ip-hour", limit: 20, windowSeconds: 3600 },
  authEmailHour: { name: "auth-email-hour", limit: 5, windowSeconds: 3600 },
  newsletterIpHour: { name: "newsletter-ip-hour", limit: 10, windowSeconds: 3600 },
  newsletterEmailDay: { name: "newsletter-email-day", limit: 3, windowSeconds: 86400 },
  oauthRegisterIpHour: { name: "oauth-register-ip-hour", limit: 20, windowSeconds: 3600 },
  oauthTokenIpMinute: { name: "oauth-token-ip-minute", limit: 60, windowSeconds: 60 },
  syncUserMinute: { name: "sync-user-minute", limit: 60, windowSeconds: 60 },
  exportUserHour: { name: "export-user-hour", limit: 5, windowSeconds: 3600 },
} as const satisfies Record<string, RateLimitRule>;
