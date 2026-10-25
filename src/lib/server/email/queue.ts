// FILE: src/lib/server/email/queue.ts
//
// Email is never sent inline from a webhook or a request: it is queued at
// mailQueue/{key} (often in the same transaction as the state change that
// caused it) and delivered afterwards, by the route's after() hook and by the
// every-five-minutes job for anything that failed. The key makes each message
// exactly-once: `stripe:<eventId>:plus-welcome`, `welcome:<uid>`. Brevo also
// gets the key as its idempotency key, so a delivery retried after a timeout
// cannot send twice either.
//
// Opt-in templates (reminders, newsletter) are checked again at delivery
// against the learner's current choice, and get their unsubscribe link then.
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";

import { appOrigin } from "../env";
import { auth as defaultAuth, db as defaultDb, isAlreadyExists } from "../firebase";
import { EmailError, sendEmail, type BrevoDeps } from "./brevo";
import { TEMPLATES, isTemplateId, renderTemplate, type TemplateId, type TemplateProps } from "./templates/index";
import { unsubscribeUrl } from "./unsubscribe";

export const MAIL_QUEUE = "mailQueue";
const MAX_ATTEMPTS = 6;
const LEASE_MS = 2 * 60 * 1000;
const KEEP_MS = 60 * 24 * 60 * 60 * 1000;

/** Props as queued: an opt-in template's unsubscribe link is added at delivery. */
export type QueuedProps<Id extends TemplateId> = Omit<TemplateProps[Id], "unsubscribeUrl"> & { unsubscribeUrl?: string };

export interface QueueInput<Id extends TemplateId> {
  template: Id;
  props: QueuedProps<Id>;
  /** The account it is about. The address is looked up at delivery unless `to` is given. */
  uid?: string;
  /** A fixed address: the old address on an email change, a newsletter signup. */
  to?: string;
  /** Replies go here instead of the support inbox (a support request replies to its writer). */
  replyTo?: { email: string; name?: string };
}

export function mailKey(...parts: string[]): string {
  return parts.join(":").replace(/[^A-Za-z0-9:_.@+-]/g, "-").slice(0, 400);
}

function record<Id extends TemplateId>(input: QueueInput<Id>, now: number) {
  return {
    template: input.template,
    // Firestore refuses undefined; optional props simply go missing.
    props: JSON.parse(JSON.stringify(input.props ?? {})) as Record<string, unknown>,
    uid: input.uid ?? null,
    to: input.to ?? null,
    ...(input.replyTo ? { replyTo: input.replyTo.name ? { email: input.replyTo.email, name: input.replyTo.name } : { email: input.replyTo.email } } : {}),
    status: "pending",
    attempts: 0,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: Timestamp.fromMillis(now + KEEP_MS),
  };
}

/** Queues inside a transaction. The caller's own idempotency guards the create. */
export function queueMailInTx<Id extends TemplateId>(tx: Transaction, firestore: Firestore, key: string, input: QueueInput<Id>, now = Date.now()): void {
  tx.create(firestore.collection(MAIL_QUEUE).doc(key), record(input, now));
}

/** Queues on its own. False when a message with this key was already queued. */
export async function queueMail<Id extends TemplateId>(key: string, input: QueueInput<Id>, options: { db?: Firestore; now?: number } = {}): Promise<boolean> {
  const firestore = options.db ?? defaultDb();
  try {
    await firestore.collection(MAIL_QUEUE).doc(key).create(record(input, options.now ?? Date.now()));
    return true;
  } catch (error) {
    if (isAlreadyExists(error)) return false;
    throw error;
  }
}

export type DeliveryOutcome = "sent" | "skipped" | "retry" | "failed" | "busy" | "missing";

export interface DeliverDeps extends BrevoDeps {
  db?: Firestore;
  getEmail?: (uid: string) => Promise<string | null>;
  now?: number;
}

async function lookupEmail(uid: string): Promise<string | null> {
  try {
    const user = await defaultAuth().getUser(uid);
    return user.disabled ? null : (user.email ?? null);
  } catch {
    return null;
  }
}

/** Delivers one queued message. Safe to call twice at once: a lease lets one through. */
export async function deliverMail(key: string, deps: DeliverDeps = {}): Promise<DeliveryOutcome> {
  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const ref = firestore.collection(MAIL_QUEUE).doc(key);

  const claimed = await firestore.runTransaction(async (tx): Promise<(Record<string, unknown> & { attempts: number }) | null | false> => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    const leased = data.status === "sending" && typeof data.leaseUntil === "number" && data.leaseUntil > now;
    if ((data.status !== "pending" && data.status !== "sending") || leased) return false;
    tx.update(ref, { status: "sending", leaseUntil: now + LEASE_MS, attempts: FieldValue.increment(1) });
    return { ...(data as Record<string, unknown>), attempts: (typeof data.attempts === "number" ? data.attempts : 0) + 1 };
  });
  if (claimed === null) return "missing";
  if (claimed === false) return "busy";

  const finish = (status: string, extra: Record<string, unknown> = {}) => ref.update({ status, leaseUntil: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp(), ...extra });

  const template = claimed.template;
  if (!isTemplateId(template)) {
    await finish("failed", { error: "unknown template" });
    return "failed";
  }
  const entry = TEMPLATES[template];
  const uid = typeof claimed.uid === "string" ? claimed.uid : null;
  const props = { ...(claimed.props as Record<string, unknown>) };

  // Opt-in mail is checked against the learner's choice now, not when queued.
  if (entry.list === "reminders") {
    if (!uid) {
      await finish("skipped", { reason: "no account" });
      return "skipped";
    }
    const user = await firestore.collection("users").doc(uid).get();
    if ((user.data()?.emailPrefs as Record<string, unknown> | undefined)?.reminders !== true) {
      await finish("skipped", { reason: "reminders off" });
      return "skipped";
    }
  }

  const to = typeof claimed.to === "string" ? claimed.to : uid ? await (deps.getEmail ?? lookupEmail)(uid) : null;
  if (!to) {
    await finish("skipped", { reason: "no address" });
    return "skipped";
  }

  try {
    if (entry.list) {
      const subject = entry.list === "reminders" ? (uid as string) : to;
      props.unsubscribeUrl = unsubscribeUrl(subject, entry.list, appOrigin(deps.env), deps.env);
    }
    const email = renderTemplate(template, props as never);
    const replyTo = claimed.replyTo as { email?: unknown; name?: unknown } | undefined;
    await sendEmail(
      {
        to: { email: to },
        email,
        tags: [template],
        idempotencyKey: key,
        unsubscribeUrl: props.unsubscribeUrl as string | undefined,
        ...(typeof replyTo?.email === "string" ? { replyTo: { email: replyTo.email, ...(typeof replyTo.name === "string" ? { name: replyTo.name } : {}) } } : {}),
      },
      deps,
    );
    await finish("sent", { sentAt: now });
    return "sent";
  } catch (error) {
    const retryable = error instanceof EmailError ? error.retryable || error.kind === "not_configured" : true;
    const message = error instanceof Error ? error.message.slice(0, 300) : "send failed";
    if (retryable && claimed.attempts < MAX_ATTEMPTS) {
      await finish("pending", { error: message });
      return "retry";
    }
    await finish("failed", { error: message });
    return "failed";
  }
}

/** Delivers what is waiting, oldest first; the job calls this every five minutes. */
export async function deliverPending(options: DeliverDeps & { limit?: number } = {}): Promise<Record<DeliveryOutcome, number>> {
  const firestore = options.db ?? defaultDb();
  const tally: Record<DeliveryOutcome, number> = { sent: 0, skipped: 0, retry: 0, failed: 0, busy: 0, missing: 0 };
  const limit = options.limit ?? 100;
  const [pending, sending] = await Promise.all([
    firestore.collection(MAIL_QUEUE).where("status", "==", "pending").limit(limit).get(),
    firestore.collection(MAIL_QUEUE).where("status", "==", "sending").limit(limit).get(),
  ]);
  for (const doc of [...pending.docs, ...sending.docs]) {
    tally[await deliverMail(doc.id, options)] += 1;
  }
  return tally;
}

/** Delivers the given keys, swallowing errors: the job retries what this misses. */
export async function deliverSoon(keys: string[], deps: DeliverDeps = {}): Promise<void> {
  for (const key of keys) {
    try {
      await deliverMail(key, deps);
    } catch (error) {
      console.error(`Mail ${key} not delivered yet:`, error instanceof Error ? error.message : error);
    }
  }
}
