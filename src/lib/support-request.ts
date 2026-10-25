// FILE: src/lib/support-request.ts
//
// A message from the contact form. Pure and import-free, so the form checks it
// before sending and the server (src/lib/server/support.ts) checks it again
// before keeping it, with the same rules.

export const SUPPORT_TOPICS = [
  { value: "help", label: "Something isn't working" },
  { value: "billing", label: "Cadence Plus or billing" },
  { value: "account", label: "My account or data" },
  { value: "content", label: "A lesson, answer or sound" },
  { value: "idea", label: "An idea" },
] as const;

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]["value"];

export const SUPPORT_PLATFORMS = ["web", "desktop", "ios"] as const;
export type SupportPlatform = (typeof SUPPORT_PLATFORMS)[number];

export interface SupportRequest {
  email: string;
  topic: SupportTopic;
  message: string;
  name?: string;
  platform?: SupportPlatform;
}

export const SUPPORT_LIMITS = { name: 80, email: 254, message: 4000, minMessage: 10 } as const;

export type SupportStatus = "open" | "answered" | "closed";
export const SUPPORT_STATUSES: readonly SupportStatus[] = ["open", "answered", "closed"];

export function topicLabel(topic: string): string {
  return SUPPORT_TOPICS.find((entry) => entry.value === topic)?.label ?? "Other";
}

const EMAIL = /^[^\s@<>"]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,}$/;

/** Drops control characters other than tabs and line breaks, which a pasted message may carry. */
export function cleanSupportText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").trim();
}

export type SupportCheck = { ok: true; request: SupportRequest } | { ok: false; field: keyof SupportRequest; message: string };

/** Validates raw input from the form or a request body. */
export function checkSupportRequest(input: unknown): SupportCheck {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (key: string) => (typeof raw[key] === "string" ? cleanSupportText(raw[key] as string) : "");

  const email = text("email").toLowerCase();
  if (email.length > SUPPORT_LIMITS.email || !EMAIL.test(email)) {
    return { ok: false, field: "email", message: "Enter an email we can reply to." };
  }

  const topic = SUPPORT_TOPICS.find((choice) => choice.value === raw.topic)?.value;
  if (!topic) return { ok: false, field: "topic", message: "Choose what it's about." };

  const message = text("message");
  if (message.length < SUPPORT_LIMITS.minMessage) return { ok: false, field: "message", message: "Add a little more detail." };
  if (message.length > SUPPORT_LIMITS.message) {
    return { ok: false, field: "message", message: `Keep it under ${SUPPORT_LIMITS.message} characters.` };
  }

  const name = text("name").replace(/[\r\n\t]+/g, " ").slice(0, SUPPORT_LIMITS.name) || undefined;
  const platform = SUPPORT_PLATFORMS.find((value) => value === raw.platform);
  return { ok: true, request: { email, topic, message, ...(name ? { name } : {}), ...(platform ? { platform } : {}) } };
}

/** A reply typed on the owner's dashboard. */
export const REPLY_LIMITS = { min: 2, max: 8000 } as const;

export function checkReply(input: unknown): { ok: true; message: string } | { ok: false; message: string } {
  const message = typeof input === "string" ? cleanSupportText(input) : "";
  if (message.length < REPLY_LIMITS.min) return { ok: false, message: "Write a reply first." };
  if (message.length > REPLY_LIMITS.max) return { ok: false, message: `Keep the reply under ${REPLY_LIMITS.max} characters.` };
  return { ok: true, message };
}
