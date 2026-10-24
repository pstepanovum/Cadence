// FILE: src/lib/server/newsletter.ts
//
// The newsletter, Brevo list 5, explicit opt-in only, through Brevo's double
// opt-in: Brevo mails our newsletter-confirm design (its DOI template, id in
// BREVO_DOI_TEMPLATE_ID), adds the contact to list 5 only after the click, and
// sends the browser to our redirect, which carries a signed token so we can
// send the welcome once and record the choice on a matching account.
//
// Account email (list 4) is separate and never used for marketing.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

import { appOrigin } from "./env";
import { auth as defaultAuth, db as defaultDb } from "./firebase";
import { BREVO_LISTS, contactLists, startDoubleOptIn, type ContactAttributes } from "./email/brevo";
import { mailKey, queueMail } from "./email/queue";

type Env = Record<string, string | undefined>;

function secret(env: Env): string {
  const value = env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("EMAIL_UNSUBSCRIBE_SECRET is not set.");
  return value;
}

export function confirmToken(email: string, env: Env = process.env): string {
  const payload = Buffer.from(email.toLowerCase()).toString("base64url");
  return `${payload}.${createHmac("sha256", secret(env)).update(`newsletter-confirm:${payload}`).digest("base64url")}`;
}

export function verifyConfirmToken(token: unknown, env: Env = process.env): string | null {
  if (typeof token !== "string" || token.length > 800) return null;
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(createHmac("sha256", secret(env)).update(`newsletter-confirm:${payload}`).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return Buffer.from(payload, "base64url").toString("utf8");
}

export function doiTemplateId(env: Env = process.env): number | null {
  const id = Number(env.BREVO_DOI_TEMPLATE_ID);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function subscribe(email: string, attributes: ContactAttributes, env: Env = process.env): Promise<void> {
  const templateId = doiTemplateId(env);
  if (!templateId) throw new Error("BREVO_DOI_TEMPLATE_ID is not set.");
  await startDoubleOptIn({ email, templateId, redirectionUrl: `${appOrigin(env)}/api/newsletter/confirmed?token=${encodeURIComponent(confirmToken(email, env))}`, attributes });
}

/**
 * After Brevo's confirmation redirect: checks the contact really is on list 5,
 * queues the welcome once, and marks a matching account's preference.
 */
export async function confirmSubscription(email: string, options: { db?: Firestore; lists?: (email: string) => Promise<number[] | null> } = {}): Promise<{ confirmed: boolean; mailKey: string | null }> {
  const lists = await (options.lists ?? contactLists)(email);
  if (!lists?.includes(BREVO_LISTS.newsletter)) return { confirmed: false, mailKey: null };
  const firestore = options.db ?? defaultDb();
  const key = mailKey("newsletter-welcome", createHash("sha256").update(email).digest("hex").slice(0, 24));
  const queued = await queueMail(key, { template: "newsletter-welcome", to: email, props: {} }, { db: firestore });
  try {
    const user = await defaultAuth().getUserByEmail(email);
    await firestore.collection("users").doc(user.uid).set({ emailPrefs: { newsletter: true } }, { merge: true });
  } catch {
    // Not every subscriber has an account.
  }
  return { confirmed: true, mailKey: queued ? key : null };
}
