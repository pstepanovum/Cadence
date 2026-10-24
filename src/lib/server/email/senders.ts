// FILE: src/lib/server/email/senders.ts
//
// Who Cadence email comes from:
//
//   every category   Cadence <hello@cadence.pstepanov.dev>
//   replies          Cadence support <support@cadence.pstepanov.dev>
//
// EMAIL_FROM and EMAIL_REPLY_TO override them ("Name <address>" or a bare
// address) for a test domain; every address must be a verified Brevo sender.

export interface Mailbox {
  email: string;
  name?: string;
}

export const DEFAULT_FROM: Mailbox = { email: "hello@cadence.pstepanov.dev", name: "Cadence" };
export const DEFAULT_REPLY_TO: Mailbox = { email: "support@cadence.pstepanov.dev", name: "Cadence support" };

const ADDRESS = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

export function isEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && ADDRESS.test(value);
}

export function parseMailbox(value: string | undefined, fallbackName?: string): Mailbox | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  const named = /^(.*?)\s*<([^<>]+)>$/.exec(text);
  const email = (named ? named[2] : text).trim();
  if (!ADDRESS.test(email)) return undefined;
  const name = (named ? named[1] : "").replace(/^"|"$/g, "").replace(/[\r\n]/g, " ").trim() || fallbackName;
  return name ? { email, name } : { email };
}

export function senders(env: Record<string, string | undefined> = process.env): { from: Mailbox; replyTo: Mailbox } {
  return {
    from: parseMailbox(env.EMAIL_FROM, "Cadence") ?? DEFAULT_FROM,
    replyTo: parseMailbox(env.EMAIL_REPLY_TO, "Cadence support") ?? DEFAULT_REPLY_TO,
  };
}
