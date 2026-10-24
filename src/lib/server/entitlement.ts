// FILE: src/lib/server/entitlement.ts
//
// Cadence Plus, server side. The truth is users/{uid}.plusSources.<source>,
// written only by verified webhooks (src/lib/server/billing/*), and the
// resolved users/{uid}.plus = resolvePlus(plusSources) written in the same
// transaction. Every gate reads `plus` and checks its period against the
// clock, so a record whose webhook never came still runs out on time.
import { FieldValue, Timestamp, type DocumentReference, type DocumentData, type Firestore, type Transaction } from "firebase-admin/firestore";

import {
  LAPSED_RETENTION_DAYS,
  dataTier,
  hasPlus,
  resolvePlus,
  type DataTier,
  type PlusRecord,
  type PlusSource,
} from "../platform/engine-routing";
import { db as defaultDb } from "./firebase";

/** What a webhook stores per source: the spec's record plus where it came from. */
export interface StoredPlusRecord extends PlusRecord {
  /** Time of the billing event this record reflects, to drop out-of-order deliveries. */
  eventAt: number;
  /** In a trial period right now. */
  trial?: boolean;
  /** RevenueCat sandbox (TestFlight, App Review). */
  sandbox?: boolean;
}

export interface AccountState {
  exists: boolean;
  email: string | null;
  displayName: string | null;
  plus: PlusRecord | null;
  plusSources: Partial<Record<PlusSource, StoredPlusRecord>>;
  isPlus: boolean;
  tier: DataTier;
  stripeCustomerId: string | null;
  createdAt: number | null;
  detailPurgeAt: number | null;
  emailPrefs: EmailPrefs;
  deletion: { requestedAt: number; status: string } | null;
}

export interface EmailPrefs {
  /** Streak at risk, weekly summary, badges, inactive nudge. Off until the learner turns them on. */
  reminders: boolean;
  /** Set by the newsletter double opt-in. */
  newsletter: boolean;
}

function millis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readPlusRecord(value: unknown): StoredPlusRecord | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.source !== "stripe" && v.source !== "app_store") return null;
  return {
    active: v.active === true,
    source: v.source,
    productId: typeof v.productId === "string" ? v.productId : "",
    expiresAt: millis(v.expiresAt),
    willRenew: v.willRenew === true,
    updatedAt: millis(v.updatedAt) ?? 0,
    eventAt: millis(v.eventAt) ?? millis(v.updatedAt) ?? 0,
    ...(v.trial === true ? { trial: true } : {}),
    ...(v.sandbox === true ? { sandbox: true } : {}),
  };
}

export function readAccount(data: DocumentData | undefined, now = Date.now()): AccountState {
  const sources: Partial<Record<PlusSource, StoredPlusRecord>> = {};
  const rawSources = (data?.plusSources ?? {}) as Record<string, unknown>;
  for (const key of ["stripe", "app_store"] as const) {
    const record = readPlusRecord(rawSources[key]);
    if (record) sources[key] = record;
  }
  const plus = readPlusRecord(data?.plus) ?? resolvePlus(sources, now);
  const isPlus = hasPlus(plus, now);
  const prefs = (data?.emailPrefs ?? {}) as Record<string, unknown>;
  const deletion = data?.deletion as Record<string, unknown> | undefined;
  return {
    exists: Boolean(data),
    email: typeof data?.email === "string" ? data.email : null,
    displayName: typeof data?.displayName === "string" ? data.displayName : null,
    plus,
    plusSources: sources,
    isPlus,
    tier: dataTier(true, isPlus),
    stripeCustomerId: typeof data?.stripeCustomerId === "string" ? data.stripeCustomerId : null,
    createdAt: millis(data?.createdAt),
    detailPurgeAt: millis(data?.detailPurgeAt),
    emailPrefs: { reminders: prefs.reminders === true, newsletter: prefs.newsletter === true },
    deletion: deletion && typeof deletion.status === "string" ? { requestedAt: millis(deletion.requestedAt) ?? 0, status: deletion.status } : null,
  };
}

export async function getAccount(uid: string, firestore: Firestore = defaultDb()): Promise<AccountState> {
  const snapshot = await firestore.collection("users").doc(uid).get();
  return readAccount(snapshot.exists ? snapshot.data() : undefined);
}

export interface PlusChange {
  before: PlusRecord | null;
  after: PlusRecord | null;
  /** False when the incoming record was older than the stored one and was dropped. */
  applied: boolean;
  becameActive: boolean;
  becameInactive: boolean;
}

/**
 * Writes one source's record and the resolved `plus`, inside the caller's
 * transaction (which has already read `userData`). A record older than the
 * stored one for that source is dropped, since Stripe and RevenueCat both
 * deliver out of order. Lapsing schedules the detail purge 90 days out;
 * becoming active again cancels it. A missing user document is never
 * created; callers check `accountGone` first and record the event as ignored.
 */
export function writePlusSource(
  tx: Transaction,
  userRef: DocumentReference,
  userData: DocumentData | undefined,
  record: StoredPlusRecord,
  now = Date.now(),
  /** Other top-level fields to write in the same update, e.g. stripeCustomerId. */
  extra: Record<string, unknown> = {},
): PlusChange {
  const account = readAccount(userData, now);
  const before = account.plus;
  const stored = account.plusSources[record.source];

  // Never create the account from a webhook: the document exists from the
  // first sign-in, so a missing one is a deleted account (or a stranger's uid)
  // and writing would bring its billing back after "account deleted".
  if (!userData) {
    return { before, after: before, applied: false, becameActive: false, becameInactive: false };
  }

  if (stored && stored.eventAt > record.eventAt) {
    return { before, after: before, applied: false, becameActive: false, becameInactive: false };
  }

  const sources = { ...account.plusSources, [record.source]: record };
  const after = resolvePlus(sources, now);
  const wasActive = hasPlus(before, now);
  const isActive = hasPlus(after, now);

  const update: Record<string, unknown> = {
    [`plusSources.${record.source}`]: record,
    plus: after,
    updatedAt: FieldValue.serverTimestamp(),
    ...extra,
  };
  if (isActive) {
    update.detailPurgeAt = FieldValue.delete();
  } else if (wasActive) {
    update.detailPurgeAt = now + LAPSED_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  }

  tx.update(userRef, update);

  return { before, after, applied: true, becameActive: isActive && !wasActive, becameInactive: wasActive && !isActive };
}

/**
 * True when a webhook's uid has no live account: no user document, or a
 * deletion recorded for it (deletions/{uid} outlives the purge). Read inside
 * the webhook's transaction, before any write.
 */
export async function accountGone(tx: Transaction, firestore: Firestore, uid: string, userExists: boolean): Promise<boolean> {
  if (!userExists) return true;
  const deletion = await tx.get(firestore.collection("deletions").doc(uid));
  return deletion.exists;
}
