// FILE: src/lib/server/billing/revenuecat.ts
//
// POST /api/webhooks/revenuecat, and the two RevenueCat REST calls the server
// makes (reading a subscriber for TRANSFER, deleting one on account deletion).
//
// The webhook authenticates with `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`,
// set in the RevenueCat dashboard, compared in constant time. Sandbox events
// (TestFlight, App Review) are accepted and marked sandbox: App Review must be
// able to unlock Plus.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

import { readAccount, writePlusSource, type StoredPlusRecord } from "../entitlement";
import { isRecordActive } from "../../platform/engine-routing";
import { db as defaultDb } from "../firebase";
import { mailKey, queueMailInTx, type QueueInput } from "../email/queue";
import type { TemplateId } from "../email/templates/index";
import { isFirebaseUid, recordFromSubscriber, revenueCatEffect, touchesPlus, type RevenueCatEvent } from "./revenuecat-map";
import { recordInTx, seenInTx } from "./webhook-events";
import type { WebhookResult } from "./stripe-webhook";

const API = "https://api.revenuecat.com/v1/subscribers/";
const TIMEOUT_MS = 8000;

type Env = Record<string, string | undefined>;

/** Constant-time check of the Authorization header against the shared secret. */
export function isAuthorizedRevenueCat(header: string | null, env: Env = process.env): boolean {
  const secret = env.REVENUECAT_WEBHOOK_SECRET?.trim();
  if (!secret || !header) return false;
  const given = header.replace(/^\s*Bearer\s+/i, "").trim();
  // Hash both sides so lengths match and timing says nothing about the secret.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export interface RevenueCatApi {
  /** The subscriber's App Store record, or null when it cannot be read. */
  subscriberRecord(uid: string, now: number): Promise<StoredPlusRecord | null>;
}

function apiKey(env: Env = process.env) {
  return env.REVENUECAT_API_KEY?.trim() || "";
}

export const liveRevenueCatApi: RevenueCatApi = {
  async subscriberRecord(uid, now) {
    const key = apiKey();
    if (!key) return null;
    const response = await fetch(`${API}${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return recordFromSubscriber(null, now);
    if (!response.ok) throw new Error(`RevenueCat answered ${response.status}.`);
    return recordFromSubscriber(await response.json(), now);
  },
};

/** DELETE /v1/subscribers/{uid}, for account deletion. A missing subscriber is done already. */
export async function deleteRevenueCatSubscriber(uid: string, deps: { fetch?: typeof fetch; env?: Env } = {}): Promise<"deleted" | "absent" | "not_configured"> {
  const key = apiKey(deps.env);
  if (!key) return "not_configured";
  const response = await (deps.fetch ?? fetch)(`${API}${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 404) return "absent";
  if (!response.ok) throw new Error(`RevenueCat answered ${response.status} to the delete.`);
  return "deleted";
}

export function parseRevenueCatBody(body: unknown): RevenueCatEvent | null {
  const event = (body as { event?: unknown } | null)?.event as Record<string, unknown> | undefined;
  if (!event || typeof event.id !== "string" || !event.id || typeof event.type !== "string") return null;
  return event as unknown as RevenueCatEvent;
}

export async function handleRevenueCatEvent(event: RevenueCatEvent, deps: { db?: Firestore; api?: RevenueCatApi; now?: number } = {}): Promise<WebhookResult> {
  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const sandbox = event.environment === "SANDBOX";

  // TRANSFER names the people; their state is read back from RevenueCat first,
  // outside the transaction.
  let transfers: { uid: string; record: StoredPlusRecord | null }[] = [];
  if (event.type === "TRANSFER") {
    const uids = [...new Set([...(event.transferred_from ?? []), ...(event.transferred_to ?? [])])].filter(isFirebaseUid).slice(0, 10);
    const api = deps.api ?? liveRevenueCatApi;
    transfers = await Promise.all(
      uids.map(async (uid) => {
        const live = await api.subscriberRecord(uid, now);
        // Without the REST key, the people it moved away from lose it; the receiver is updated by the next event.
        const fallback = (event.transferred_from ?? []).includes(uid)
          ? ({ active: false, source: "app_store", productId: "", expiresAt: null, willRenew: false, updatedAt: now, eventAt: event.event_timestamp_ms ?? now } satisfies StoredPlusRecord)
          : null;
        return { uid, record: live ? { ...live, eventAt: event.event_timestamp_ms ?? now } : fallback };
      }),
    );
  }

  return firestore.runTransaction(async (tx) => {
    if (await seenInTx(tx, firestore, "revenuecat", event.id)) {
      return { status: 200, body: { received: true, duplicate: true }, mailKeys: [] };
    }

    const done = (outcome: string, uid: string | null, extra: Record<string, unknown> = {}): WebhookResult => {
      recordInTx(tx, firestore, "revenuecat", event.id, { type: event.type, uid, outcome, ...(sandbox ? { sandbox: true } : {}) }, now);
      return { status: 200, body: { received: true, ...extra }, mailKeys: [] };
    };

    if (event.type === "TEST") return done("test", null, { test: true });

    if (event.type === "TRANSFER") {
      const refs = transfers.filter((t) => t.record).map((t) => ({ ...t, ref: firestore.collection("users").doc(t.uid) }));
      const snapshots = await Promise.all(refs.map((t) => tx.get(t.ref)));
      refs.forEach((t, index) => {
        const data = snapshots[index].exists ? snapshots[index].data() : undefined;
        if (data) writePlusSource(tx, t.ref, data, t.record as StoredPlusRecord, now);
      });
      return done("transferred", null, { transferred: refs.length });
    }

    const uid = event.app_user_id;
    if (!isFirebaseUid(uid)) {
      console.warn(`RevenueCat ${event.type} for an anonymous app user; the app must call Purchases.logIn(uid).`);
      return done("ignored: anonymous app user", null, { ignored: "anonymous app user" });
    }
    if (!touchesPlus(event)) return done("ignored: not the plus entitlement", uid, { ignored: "not the plus entitlement" });

    const userRef = firestore.collection("users").doc(uid);
    const snapshot = await tx.get(userRef);
    const data = snapshot.exists ? snapshot.data() : undefined;
    const account = readAccount(data, now);
    const stripeActive = isRecordActive(account.plusSources.stripe, now);
    const effect = revenueCatEffect(event, account.plusSources.app_store ?? null, now, stripeActive);

    let applied = true;
    if (effect.record) applied = writePlusSource(tx, userRef, data, effect.record, now, { rcAppUserId: uid }).applied;

    const mailKeys: string[] = [];
    if (applied) {
      for (const email of effect.emails) {
        const key = mailKey("revenuecat", event.id, email.template);
        queueMailInTx(tx, firestore, key, { template: email.template, uid, props: email.props } as QueueInput<TemplateId>, now);
        mailKeys.push(key);
      }
    }

    recordInTx(tx, firestore, "revenuecat", event.id, { type: event.type, uid, outcome: applied ? "applied" : "stale", ...(sandbox ? { sandbox: true } : {}) }, now);
    return { status: 200, body: { received: true, applied }, mailKeys };
  });
}
