// FILE: src/lib/server/account.ts
//
// Data export and account deletion (docs/PLATFORM.md section 11).
//
// Export: the user document and every subcollection under it, the summary,
// today's and recent usage, and the connected apps, as one JSON document.
//
// Deletion runs as idempotent steps recorded in deletions/{uid}, outside the
// user's own tree so the record survives the purge; the daily job retries any
// step that failed:
//
//   1. RevenueCat   DELETE /v1/subscribers/{uid}
//   2. Stripe       cancel any live Cadence subscription now and remove our
//                   uid from the customer's metadata; the customer and its
//                   invoices stay (tax records)
//   3. Brevo        delete the contact
//   4. Firestore    users/{uid} recursively, usage/{uid}, OAuth grants and
//                   tokens, rate-limit counters, queued mail about them
//   5. Auth         deleteUser
//
// The "deletion scheduled" email is queued to the address first, and "account
// deleted" when the last step is done; both are addressed by email, not uid,
// since the uid stops resolving.
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { auth as defaultAuth, db as defaultDb } from "./firebase";
import { deleteContact } from "./email/brevo";
import { MAIL_QUEUE, mailKey, queueMail } from "./email/queue";
import { deleteAllForUid, listGrantsForUid } from "../oauth/store";
import { deleteRevenueCatSubscriber } from "./billing/revenuecat";
import { isStripeKeyConfigured, stripe } from "./billing/stripe-client";
import { readAccount } from "./entitlement";
import { deleteRedemptionsFor } from "./codes/store";
import { SUPPORT_COLLECTION } from "./support";

export const DELETION_STEPS = ["revenuecat", "stripe", "brevo", "firestore", "auth"] as const;
export type DeletionStep = (typeof DELETION_STEPS)[number];

function plain(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate().toISOString();
    if (Array.isArray(value)) return value.map(plain);
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

async function dumpDocument(ref: FirebaseFirestore.DocumentReference, depth = 0): Promise<Record<string, unknown>> {
  const snapshot = await ref.get();
  const out: Record<string, unknown> = { data: snapshot.exists ? plain(snapshot.data()) : null };
  if (depth > 3) return out;
  const collections = await ref.listCollections();
  for (const collection of collections) {
    const docs = await collection.limit(2000).get();
    out[collection.id] = Object.fromEntries(await Promise.all(docs.docs.map(async (doc) => [doc.id, await dumpDocument(doc.ref, depth + 1)] as const)));
  }
  return out;
}

export async function exportAccount(uid: string, options: { db?: Firestore } = {}) {
  const firestore = options.db ?? defaultDb();
  const user = await dumpDocument(firestore.collection("users").doc(uid));
  // Never export secrets about the account: security hashes stay server-side.
  const data = (user.data ?? {}) as Record<string, unknown>;
  delete data.security;
  const usage = await firestore.collection("usage").doc(uid).collection("days").limit(400).get();
  const connections = await listGrantsForUid(uid).catch(() => []);
  return {
    format: 1,
    exportedAt: new Date().toISOString(),
    uid,
    account: user,
    usage: Object.fromEntries(usage.docs.map((doc) => [doc.id, plain(doc.data())])),
    connectedApps: connections,
  };
}

export interface DeletionDeps {
  db?: Firestore;
  deleteSubscriber?: (uid: string) => Promise<unknown>;
  detachStripe?: (customerId: string) => Promise<void>;
  deleteBrevoContact?: (email: string) => Promise<void>;
  deleteAuthUser?: (uid: string) => Promise<void>;
  revokeOAuth?: (uid: string) => Promise<void>;
  now?: number;
}

async function detachStripeCustomer(customerId: string) {
  if (!isStripeKeyConfigured()) return;
  const client = stripe();
  const subscriptions = await client.subscriptions.list({ customer: customerId, status: "all", limit: 20 });
  for (const sub of subscriptions.data) {
    if (["active", "trialing", "past_due", "unpaid", "incomplete"].includes(sub.status) && sub.metadata?.app === "cadence") {
      await client.subscriptions.cancel(sub.id);
    }
  }
  await client.customers.update(customerId, { metadata: { firebase_uid: "", deleted_cadence_account: "true" } });
}

async function deleteWhere(firestore: Firestore, collection: string, field: string, value: string) {
  for (;;) {
    const snapshot = await firestore.collection(collection).where(field, "==", value).limit(400).get();
    if (snapshot.empty) return;
    const batch = firestore.batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

/** Starts deletion: records it, queues the first email, then runs the steps. */
export async function requestDeletion(uid: string, email: string | null, deps: DeletionDeps = {}): Promise<{ status: "completed" | "pending"; failed: DeletionStep[]; mailKeys: string[] }> {
  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const user = readAccount((await firestore.collection("users").doc(uid).get()).data());
  const ref = firestore.collection("deletions").doc(uid);
  const existing = await ref.get();
  if (!existing.exists) {
    await ref.set({ email, stripeCustomerId: user.stripeCustomerId, hadPlus: user.isPlus, requestedAt: now, done: [], status: "pending" });
  }
  const mailKeys: string[] = [];
  if (email) {
    const key = mailKey("deletion-scheduled", uid);
    if (await queueMail(key, { template: "deletion-scheduled", to: email, props: { completesBy: now + 24 * 3600_000, hadPlus: user.isPlus } }, { db: firestore, now })) mailKeys.push(key);
  }
  const result = await runDeletion(uid, deps);
  return { ...result, mailKeys: [...mailKeys, ...result.mailKeys] };
}

/** Runs the steps not done yet. Safe to call again; the daily job does. */
export async function runDeletion(uid: string, deps: DeletionDeps = {}): Promise<{ status: "completed" | "pending"; failed: DeletionStep[]; mailKeys: string[] }> {
  const firestore = deps.db ?? defaultDb();
  const ref = firestore.collection("deletions").doc(uid);
  const record = (await ref.get()).data();
  if (!record) return { status: "completed", failed: [], mailKeys: [] };
  const done = new Set<string>(Array.isArray(record.done) ? record.done : []);
  const email = typeof record.email === "string" ? record.email : null;
  const failed: DeletionStep[] = [];

  const steps: Record<DeletionStep, () => Promise<unknown>> = {
    revenuecat: () => (deps.deleteSubscriber ?? deleteRevenueCatSubscriber)(uid),
    stripe: async () => {
      if (typeof record.stripeCustomerId === "string") await (deps.detachStripe ?? detachStripeCustomer)(record.stripeCustomerId);
    },
    brevo: async () => {
      if (email) await (deps.deleteBrevoContact ?? ((address: string) => deleteContact(address)))(email);
    },
    firestore: async () => {
      await firestore.recursiveDelete(firestore.collection("users").doc(uid));
      await firestore.recursiveDelete(firestore.collection("usage").doc(uid));
      await (deps.revokeOAuth ?? deleteAllForUid)(uid);
      await deleteWhere(firestore, "rateLimits", "uid", uid);
      await deleteWhere(firestore, MAIL_QUEUE, "uid", uid);
      await deleteWhere(firestore, SUPPORT_COLLECTION, "uid", uid);
      await deleteRedemptionsFor(uid, firestore);
    },
    auth: async () => {
      try {
        await (deps.deleteAuthUser ?? ((id: string) => defaultAuth().deleteUser(id)))(uid);
      } catch (error) {
        if ((error as { code?: string })?.code !== "auth/user-not-found") throw error;
      }
    },
  };

  for (const step of DELETION_STEPS) {
    if (done.has(step)) continue;
    try {
      await steps[step]();
      done.add(step);
      await ref.update({ done: FieldValue.arrayUnion(step) });
    } catch (error) {
      failed.push(step);
      console.error(`Account deletion step ${step} failed:`, error instanceof Error ? error.message : error);
      // Later steps depend on earlier ones only loosely, but Auth goes last:
      // a learner who still exists in Auth can sign in and see the state.
      if (step === "firestore") break;
    }
  }

  if (failed.length > 0) {
    await ref.update({ status: "pending", lastAttemptAt: Date.now(), failed });
    return { status: "pending", failed, mailKeys: [] };
  }

  const mailKeys: string[] = [];
  if (email) {
    const key = mailKey("account-deleted", uid);
    if (await queueMail(key, { template: "account-deleted", to: email, props: { completedAt: Date.now() } }, { db: firestore })) mailKeys.push(key);
  }
  // Keep only what proves the deletion ran; no address once the email is queued.
  await ref.set({ status: "completed", completedAt: Date.now(), done: [...done] });
  return { status: "completed", failed: [], mailKeys };
}
