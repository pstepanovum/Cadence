// FILE: src/lib/server/lifecycle.ts
//
// The lifecycle sequence's hourly run (POST /api/jobs/lifecycle, Cloud
// Scheduler every hour; see docs/DEPLOY.md). Hourly because each account's
// mail goes out in its own evening, and evenings move round the clock.
//
// For every account made in the last LIFECYCLE_WINDOW_DAYS it reads the
// account, its progress summary and its zone, asks lifecycle-plan.ts what is
// due, and queues that one email. Exactly once per step and account: the
// per-user email log users/{uid}/emailLog/lifecycle-<step> is created in the
// same transaction as the mailQueue entry, so a second run, an overlapping
// run, or a retry finds the log and stops. The account also keeps the sent
// steps in `lifecycle.sent`, so the next run needs no extra read to know them.
// The queue checks consent and Plus again at delivery.
import { FieldValue, Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";

import { readAccount } from "./entitlement";
import { db as defaultDb } from "./firebase";
import { deliverSoon, mailKey, queueMailInTx, type DeliverDeps } from "./email/queue";
import { readOffer, type Offer } from "./email/offer";
import { cleanTimeZone, lifecycleStepDue, LIFECYCLE_STEPS, LIFECYCLE_WINDOW_DAYS, type LifecycleStep } from "./lifecycle-plan";
import { readSummary } from "./sync";
import type { ProgressSummary } from "../platform/progress-model";

const DAY_MS = 86_400_000;
export const EMAIL_LOG = "emailLog";

export interface LifecycleReport {
  scanned: number;
  queued: Record<string, number>;
  skipped: Record<string, number>;
  offer: boolean;
}

/** The props an email is queued with: what the account has done so far, and the offer. */
export function lifecycleProps(step: LifecycleStep, input: { name?: string; summary: ProgressSummary; offer: Offer | null; today: string }): Record<string, unknown> {
  const base = input.name ? { name: input.name } : {};
  switch (step.template) {
    case "lifecycle-habit": {
      const lessons = Object.values(input.summary.lessonsCompleted ?? {}).reduce((sum, n) => sum + (typeof n === "number" ? n : 0), 0);
      const last = input.summary.streak.lastDay;
      // A streak counts only if it reached yesterday or today.
      const yesterday = new Date(Date.parse(`${input.today}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
      const streak = last === input.today || last === yesterday ? input.summary.streak.current : 0;
      return { ...base, streak, minutes: Math.round(input.summary.totalMinutes ?? 0), lessons };
    }
    case "sale-offer":
    case "sale-reminder":
      return input.offer ? { ...base, code: input.offer.code, label: input.offer.label, endsAt: input.offer.endsAt } : base;
    default:
      return base;
  }
}

async function zoneOf(firestore: Firestore, doc: DocumentSnapshot): Promise<string | null> {
  const own = cleanTimeZone(doc.data()?.timeZone);
  if (own) return own;
  // Older accounts: the zone a phone reported with its push token.
  const devices = await doc.ref.collection("devices").limit(5).get();
  for (const device of devices.docs) {
    const zone = cleanTimeZone((device.data().push as { timeZone?: unknown } | undefined)?.timeZone);
    if (zone && zone !== "UTC") return zone;
  }
  return null;
}

/** Queues one step for one account, once. False when the log says it already went. */
export async function queueLifecycleStep(firestore: Firestore, uid: string, step: LifecycleStep, props: Record<string, unknown>, now: number): Promise<{ queued: boolean; key: string }> {
  const userRef = firestore.collection("users").doc(uid);
  const logRef = userRef.collection(EMAIL_LOG).doc(`lifecycle-${step.id}`);
  const key = mailKey("lifecycle", uid, step.id);
  const queued = await firestore.runTransaction(async (tx) => {
    if ((await tx.get(logRef)).exists) return false;
    tx.create(logRef, { kind: "lifecycle", step: step.id, template: step.template, mailKey: key, queuedAt: now });
    queueMailInTx(tx, firestore, key, { template: step.template, uid, props: props as never }, now);
    tx.set(userRef, { lifecycle: { sent: FieldValue.arrayUnion(step.id), lastAt: now } }, { merge: true });
    return true;
  });
  return { queued, key };
}

export async function runLifecycleJob(options: { db?: Firestore; now?: number; env?: Record<string, string | undefined>; deliver?: boolean; deliverDeps?: DeliverDeps } = {}): Promise<LifecycleReport> {
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const offer = readOffer(options.env ?? process.env, now);
  const report: LifecycleReport = { scanned: 0, queued: {}, skipped: {}, offer: Boolean(offer) };
  const tally = (bucket: Record<string, number>, key: string) => (bucket[key] = (bucket[key] ?? 0) + 1);

  const recent = await firestore
    .collection("users")
    .where("createdAt", ">=", Timestamp.fromMillis(now - LIFECYCLE_WINDOW_DAYS * DAY_MS))
    .limit(5000)
    .get();

  const summaries = new Map<string, DocumentSnapshot>();
  for (let start = 0; start < recent.docs.length; start += 300) {
    const refs = recent.docs.slice(start, start + 300).map((doc) => doc.ref.collection("progress").doc("summary"));
    if (refs.length) for (const snapshot of await firestore.getAll(...refs)) summaries.set(snapshot.ref.parent.parent?.id ?? "", snapshot);
  }

  const keys: string[] = [];
  for (const doc of recent.docs) {
    report.scanned += 1;
    const data = doc.data();
    const account = readAccount(data, now);
    if (account.createdAt === null || account.deletion) {
      tally(report.skipped, "no account");
      continue;
    }
    const summary = readSummary(summaries.get(doc.id)?.data());
    const sentList = (data.lifecycle as { sent?: unknown } | undefined)?.sent;
    const sent = new Set(Array.isArray(sentList) ? sentList.filter((id): id is string => typeof id === "string") : []);
    const timeZone = await zoneOf(firestore, doc);
    const decision = lifecycleStepDue({
      now,
      createdAt: account.createdAt,
      timeZone,
      isPlus: account.isPlus,
      lastActiveAt: summary.lastActiveAt,
      prefs: { lifecycle: account.emailPrefs.lifecycle, newsletter: account.emailPrefs.newsletter },
      sent,
      offerRunning: Boolean(offer),
    });
    if (!decision.step) {
      tally(report.skipped, decision.reason);
      continue;
    }
    const step = decision.step;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone ?? "UTC" }).format(new Date(now));
    const props = lifecycleProps(step, { name: account.displayName ?? undefined, summary, offer, today });
    const result = await queueLifecycleStep(firestore, doc.id, step, props, now);
    if (result.queued) {
      tally(report.queued, step.template);
      keys.push(result.key);
    } else tally(report.skipped, "already sent");
  }

  if (options.deliver !== false && keys.length) await deliverSoon(keys, { db: firestore, ...options.deliverDeps });
  return report;
}

export { LIFECYCLE_STEPS };
