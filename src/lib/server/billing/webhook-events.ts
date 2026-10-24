// FILE: src/lib/server/billing/webhook-events.ts
//
// Idempotency for billing webhooks: webhookEvents/{source}:{eventId} is read
// and created inside the same transaction as the state change it causes, so a
// replay (Stripe and RevenueCat both retry, and the harness replays on
// purpose) finds the record and changes nothing. expireAt drives the TTL
// policy (30 days, longer than either provider retries).
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";

export const WEBHOOK_EVENTS = "webhookEvents";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

export type WebhookSource = "stripe" | "revenuecat";

export function eventRef(firestore: Firestore, source: WebhookSource, eventId: string) {
  const safe = eventId.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 200);
  return firestore.collection(WEBHOOK_EVENTS).doc(`${source}:${safe}`);
}

/** Reads the event record; call before any write in the transaction. True when already seen. */
export async function seenInTx(tx: Transaction, firestore: Firestore, source: WebhookSource, eventId: string): Promise<boolean> {
  const snapshot = await tx.get(eventRef(firestore, source, eventId));
  return snapshot.exists;
}

export function recordInTx(
  tx: Transaction,
  firestore: Firestore,
  source: WebhookSource,
  eventId: string,
  details: { type: string; uid: string | null; outcome: string; sandbox?: boolean },
  now = Date.now(),
): void {
  tx.create(eventRef(firestore, source, eventId), {
    ...details,
    receivedAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(now + KEEP_MS),
  });
}
