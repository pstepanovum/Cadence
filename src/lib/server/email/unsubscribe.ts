// FILE: src/lib/server/email/unsubscribe.ts
//
// Signed unsubscribe links: `<payload>.<signature>`, base64url, where the
// payload is `v1:<list>:<subject>` and the signature HMAC-SHA256 over it with
// EMAIL_UNSUBSCRIBE_SECRET. The subject is a uid (reminders) or an email
// address (newsletter, which people can join without an account). A token can
// only ever turn one list off for one subject, so it does not expire: an old
// email's link has to keep working.
import { createHmac, timingSafeEqual } from "node:crypto";

import type { EmailList } from "./layout";

export const EMAIL_LISTS: readonly EmailList[] = ["reminders", "newsletter"];
export const UNSUBSCRIBE_PATH = "/api/email/unsubscribe";

type Env = Record<string, string | undefined>;

export class UnsubscribeNotConfiguredError extends Error {}

function secretFrom(env: Env): string {
  const secret = env.EMAIL_UNSUBSCRIBE_SECRET?.trim();
  if (!secret || secret.length < 32) throw new UnsubscribeNotConfiguredError("EMAIL_UNSUBSCRIBE_SECRET is not set.");
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

const SUBJECT = /^[A-Za-z0-9_.+@-]{1,254}$/;

export function unsubscribeToken(subject: string, list: EmailList, env: Env = process.env): string {
  if (!SUBJECT.test(subject)) throw new Error("Not a valid subject.");
  if (!EMAIL_LISTS.includes(list)) throw new Error("Not a list.");
  const payload = Buffer.from(`v1:${list}:${subject}`).toString("base64url");
  return `${payload}.${sign(payload, secretFrom(env))}`;
}

export function verifyUnsubscribeToken(token: unknown, env: Env = process.env): { subject: string; list: EmailList } | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secretFrom(env)));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const decoded = Buffer.from(payload, "base64url").toString("utf8");
  const match = /^v1:(reminders|newsletter):(.+)$/.exec(decoded);
  if (!match || !SUBJECT.test(match[2])) return null;
  return { list: match[1] as EmailList, subject: match[2] };
}

export function unsubscribeUrl(subject: string, list: EmailList, origin: string, env: Env = process.env): string {
  return `${origin}${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(unsubscribeToken(subject, list, env))}`;
}
