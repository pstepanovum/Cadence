// FILE: src/lib/server/quota.ts
//
// Cloud AI cost guards, even for Plus:
//
//   per learner   usage/{uid}/days/{YYYY-MM-DD}, charged in a transaction
//                 before the provider is called (checkQuota, PLUS_DAILY_LIMITS),
//                 refunded when the provider then fails.
//   global        system/aiBudget/days/{YYYY-MM-DD}: every instance adds its
//                 estimated spend; past AI_DAILY_BUDGET_USD the day is
//                 `tripped` and every cloud AI route answers 503 until midnight
//                 UTC. Read at most every 30 s per instance.
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import {
  EMPTY_USAGE,
  PLUS_DAILY_LIMITS,
  checkQuota,
  quotaLeft,
  usageCost,
  type AiCapability,
  type DailyUsage,
  type UsageRequest,
} from "../platform/engine-routing";
import { db as defaultDb } from "./firebase";

const USAGE_KEEP_MS = 35 * 24 * 60 * 60 * 1000;
const BREAKER_CACHE_MS = 30 * 1000;

export function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function readUsage(data: FirebaseFirestore.DocumentData | undefined): DailyUsage {
  const n = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return data ? { audioSeconds: n(data.audioSeconds), ttsCharacters: n(data.ttsCharacters), coachTurns: n(data.coachTurns) } : { ...EMPTY_USAGE };
}

function usageRef(firestore: Firestore, uid: string, day: string) {
  return firestore.collection("usage").doc(uid).collection("days").doc(day);
}

export type ChargeResult = { allowed: true; after: DailyUsage; cost: DailyUsage } | { allowed: false; exceeded: (keyof DailyUsage)[]; used: DailyUsage };

/** Charges one request against today's ceilings, or refuses it. */
export async function chargeUsage(
  uid: string,
  capability: AiCapability,
  request: UsageRequest,
  options: { db?: Firestore; now?: number; limits?: DailyUsage } = {},
): Promise<ChargeResult> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const ref = usageRef(firestore, uid, utcDay(now));
  const cost = usageCost(capability, request);
  return firestore.runTransaction(async (tx) => {
    const used = readUsage((await tx.get(ref)).data());
    const check = checkQuota(used, cost, options.limits ?? PLUS_DAILY_LIMITS);
    if (!check.allowed) return { allowed: false, exceeded: check.exceeded, used };
    tx.set(ref, { ...check.after, updatedAt: FieldValue.serverTimestamp(), expireAt: Timestamp.fromMillis(now + USAGE_KEEP_MS) });
    return { allowed: true, after: check.after, cost };
  });
}

/** Gives a charge back after the provider failed, so a learner never pays for an error. */
export async function refundUsage(uid: string, cost: DailyUsage, options: { db?: Firestore; now?: number } = {}): Promise<void> {
  const firestore = options.db ?? defaultDb();
  const ref = usageRef(firestore, uid, utcDay(options.now ?? Date.now()));
  await ref
    .update({
      audioSeconds: FieldValue.increment(-cost.audioSeconds),
      ttsCharacters: FieldValue.increment(-cost.ttsCharacters),
      coachTurns: FieldValue.increment(-cost.coachTurns),
    })
    .catch(() => undefined);
}

export async function todaysUsage(uid: string, options: { db?: Firestore; now?: number } = {}): Promise<DailyUsage> {
  const firestore = options.db ?? defaultDb();
  return readUsage((await usageRef(firestore, uid, utcDay(options.now ?? Date.now())).get()).data());
}

export function quotaSummary(used: DailyUsage) {
  return {
    limits: PLUS_DAILY_LIMITS,
    used,
    left: {
      audioSeconds: quotaLeft("score", used),
      ttsCharacters: quotaLeft("tts", used),
      coachTurns: quotaLeft("coach", used),
    },
  };
}

// Global circuit breaker -------------------------------------------------------

/**
 * Rough spend per request, in US dollars, to trip the breaker well before a
 * bill surprises anyone. Deliberately on the high side of list prices.
 */
export function estimateCostUsd(capability: AiCapability, cost: DailyUsage): number {
  switch (capability) {
    case "score":
      return cost.audioSeconds * 0.00005; // Cloud Run CPU seconds for the phoneme model
    case "transcribe":
      return cost.audioSeconds * 0.0002;
    case "tts":
      return cost.ttsCharacters * 0.000016; // Neural2 list price
    case "coach":
      return 0.0004;
    case "grammar_feedback":
    case "placement":
      return 0.002 + cost.audioSeconds * 0.0002;
  }
}

export function dailyBudgetUsd(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

let breakerCache: { day: string; tripped: boolean; at: number } | null = null;

export function resetBreakerCache(): void {
  breakerCache = null;
}

function budgetRef(firestore: Firestore, day: string) {
  return firestore.collection("system").doc("aiBudget").collection("days").doc(day);
}

export async function isBreakerTripped(options: { db?: Firestore; now?: number } = {}): Promise<boolean> {
  const now = options.now ?? Date.now();
  const day = utcDay(now);
  if (breakerCache && breakerCache.day === day && now - breakerCache.at < BREAKER_CACHE_MS) return breakerCache.tripped;
  const snapshot = await budgetRef(options.db ?? defaultDb(), day).get();
  const tripped = snapshot.data()?.tripped === true;
  breakerCache = { day, tripped, at: now };
  return tripped;
}

/** Adds a request's estimated spend and trips the breaker once the day's budget is passed. */
export async function recordSpend(capability: AiCapability, cost: DailyUsage, options: { db?: Firestore; now?: number; budgetUsd?: number } = {}): Promise<void> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const ref = budgetRef(firestore, utcDay(now));
  const usd = estimateCostUsd(capability, cost);
  const budget = options.budgetUsd ?? dailyBudgetUsd();
  try {
    const tripped = await firestore.runTransaction(async (tx) => {
      const data = (await tx.get(ref)).data() ?? {};
      const total = (typeof data.estimatedUsd === "number" ? data.estimatedUsd : 0) + usd;
      const trip = total >= budget;
      tx.set(
        ref,
        {
          estimatedUsd: total,
          requests: FieldValue.increment(1),
          byCapability: { [capability]: FieldValue.increment(1) },
          ...(trip && data.tripped !== true ? { tripped: true, trippedAt: now } : {}),
          expireAt: Timestamp.fromMillis(now + USAGE_KEEP_MS),
        },
        { merge: true },
      );
      return trip;
    });
    if (tripped) breakerCache = { day: utcDay(now), tripped: true, at: now };
  } catch (error) {
    console.error("Could not record AI spend:", error instanceof Error ? error.message : error);
  }
}
