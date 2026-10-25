// FILE: src/lib/server/support.ts
//
// Support requests from the contact form, and the owner's answers.
//
//   supportRequests/{id}   what was written, who wrote it (and their uid when
//                          signed in), status open | answered | closed, and
//                          every reply sent from the dashboard
//
// Admin SDK only; firestore.rules deny every client, so the form is the only
// way in and nobody can read a request back through it. Each request queues
// one `support-request` email to the support inbox with the writer as
// reply-to, and each dashboard reply queues one `support-reply` to the writer,
// both through mailQueue (exactly once per key, retried by the mail job).
import { FieldValue, type Firestore } from "firebase-admin/firestore";

import { SUPPORT_STATUSES, checkReply, type SupportRequest, type SupportStatus } from "../support-request";
import { mailKey, queueMail } from "./email/queue";
import { supportInbox } from "./email/senders";
import { db as defaultDb } from "./firebase";

export const SUPPORT_COLLECTION = "supportRequests";

export interface SupportReply {
  message: string;
  at: number;
  by: string;
}

export interface StoredSupportRequest extends SupportRequest {
  id: string;
  uid?: string;
  userAgent?: string;
  status: SupportStatus;
  createdAt: number;
  updatedAt: number;
  answeredAt?: number;
  replies: SupportReply[];
}

export interface SubmitMeta {
  uid?: string;
  userAgent?: string;
  now?: number;
  db?: Firestore;
}

/** Keeps a checked request and queues it for the support inbox. Returns its id and the mail key to deliver. */
export async function submitSupportRequest(request: SupportRequest, meta: SubmitMeta = {}): Promise<{ id: string; mailKey: string }> {
  const firestore = meta.db ?? defaultDb();
  const now = meta.now ?? Date.now();
  const userAgent = (meta.userAgent ?? "").slice(0, 300);
  const ref = firestore.collection(SUPPORT_COLLECTION).doc();
  await ref.create({
    ...request,
    ...(meta.uid ? { uid: meta.uid } : {}),
    ...(userAgent ? { userAgent } : {}),
    status: "open",
    createdAt: now,
    updatedAt: now,
    replies: [],
  });

  const key = mailKey("support", ref.id);
  await queueMail(
    key,
    {
      template: "support-request",
      to: supportInbox().email,
      replyTo: request.name ? { email: request.email, name: request.name } : { email: request.email },
      props: {
        requestId: ref.id,
        topic: request.topic,
        email: request.email,
        message: request.message,
        at: now,
        ...(request.name ? { name: request.name } : {}),
        ...(meta.uid ? { uid: meta.uid } : {}),
        ...(request.platform ? { platform: request.platform } : {}),
        ...(userAgent ? { userAgent } : {}),
      },
    },
    { db: firestore, now },
  );
  return { id: ref.id, mailKey: key };
}

function readRequest(id: string, data: Record<string, unknown>): StoredSupportRequest {
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  const status = SUPPORT_STATUSES.includes(data.status as SupportStatus) ? (data.status as SupportStatus) : "open";
  const replies = Array.isArray(data.replies)
    ? data.replies
        .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
        .map((entry) => ({ message: text(entry.message) ?? "", at: number(entry.at), by: text(entry.by) ?? "" }))
    : [];
  return {
    id,
    email: text(data.email) ?? "",
    topic: (text(data.topic) ?? "help") as SupportRequest["topic"],
    message: text(data.message) ?? "",
    ...(text(data.name) ? { name: text(data.name) } : {}),
    ...(text(data.platform) ? { platform: text(data.platform) as SupportRequest["platform"] } : {}),
    ...(text(data.uid) ? { uid: text(data.uid) } : {}),
    ...(text(data.userAgent) ? { userAgent: text(data.userAgent) } : {}),
    status,
    createdAt: number(data.createdAt),
    updatedAt: number(data.updatedAt),
    ...(typeof data.answeredAt === "number" ? { answeredAt: data.answeredAt } : {}),
    replies,
  };
}

/** Newest first, optionally one status only. */
export async function listSupportRequests(options: { status?: SupportStatus; limit?: number; db?: Firestore } = {}): Promise<StoredSupportRequest[]> {
  const firestore = options.db ?? defaultDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  let query = firestore.collection(SUPPORT_COLLECTION).orderBy("createdAt", "desc").limit(limit);
  if (options.status) query = firestore.collection(SUPPORT_COLLECTION).where("status", "==", options.status).orderBy("createdAt", "desc").limit(limit);
  const snapshot = await query.get();
  return snapshot.docs.map((doc) => readRequest(doc.id, doc.data()));
}

export async function getSupportRequest(id: string, firestore: Firestore = defaultDb()): Promise<StoredSupportRequest | null> {
  const snapshot = await firestore.collection(SUPPORT_COLLECTION).doc(id).get();
  return snapshot.exists ? readRequest(snapshot.id, snapshot.data() ?? {}) : null;
}

/** False when there is no such request. */
export async function setSupportStatus(id: string, status: SupportStatus, options: { now?: number; db?: Firestore } = {}): Promise<boolean> {
  const firestore = options.db ?? defaultDb();
  try {
    await firestore.collection(SUPPORT_COLLECTION).doc(id).update({ status, updatedAt: options.now ?? Date.now() });
    return true;
  } catch (error) {
    if ((error as { code?: unknown })?.code === 5) return false;
    throw error;
  }
}

export type ReplyResult = { ok: true; request: StoredSupportRequest; mailKey: string } | { ok: false; reason: "not_found" | "invalid"; message: string };

/**
 * Sends an answer to the writer: recorded on the request, which becomes
 * `answered`, and queued as one `support-reply` whose reply-to is the support
 * inbox. The key carries the reply's position, so a retried call that already
 * landed queues nothing twice.
 */
export async function replyToSupportRequest(id: string, input: unknown, options: { by?: string; now?: number; db?: Firestore } = {}): Promise<ReplyResult> {
  const checked = checkReply(input);
  if (!checked.ok) return { ok: false, reason: "invalid", message: checked.message };
  const firestore = options.db ?? defaultDb();
  const now = options.now ?? Date.now();
  const by = (options.by ?? "owner").slice(0, 120);
  const ref = firestore.collection(SUPPORT_COLLECTION).doc(id);

  const outcome = await firestore.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return null;
    const current = readRequest(id, snapshot.data() ?? {});
    const reply: SupportReply = { message: checked.message, at: now, by };
    tx.update(ref, { replies: FieldValue.arrayUnion(reply), status: "answered", answeredAt: now, updatedAt: now });
    return { request: { ...current, status: "answered" as const, answeredAt: now, updatedAt: now, replies: [...current.replies, reply] }, index: current.replies.length };
  });
  if (!outcome) return { ok: false, reason: "not_found", message: "No such request." };

  const key = mailKey("support-reply", id, String(outcome.index));
  await queueMail(
    key,
    {
      template: "support-reply",
      to: outcome.request.email,
      replyTo: supportInbox(),
      props: {
        topic: outcome.request.topic,
        message: checked.message,
        original: outcome.request.message.slice(0, 400),
        ...(outcome.request.name ? { name: outcome.request.name } : {}),
      },
    },
    { db: firestore, now },
  );
  return { ok: true, request: outcome.request, mailKey: key };
}
