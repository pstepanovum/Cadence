// FILE: src/lib/server/email/brevo.ts
//
// Brevo, through its REST API with BREVO_API_KEY (Secret Manager). Two parts:
//
//   sendEmail        POST /v3/smtp/email, one rendered template to one person
//   contacts         list 4 (account email, every account) and list 5
//                    (newsletter, only after double opt-in), and deletion
//
// EMAIL_DRY_RUN=1 sends nothing and logs only the template subject and a
// masked recipient, never the body, which may hold a reset link. The key is
// read per call and never logged or echoed in an error.
import type { RenderedEmail } from "./layout";
import { isEmailAddress, senders, type Mailbox } from "./senders";

export const BREVO_API = "https://api.brevo.com/v3";

/**
 * Where calls go. BREVO_API_URL points them at a local stub in end-to-end
 * tests; only a loopback http address is accepted, so a misconfigured
 * server can never send mail or contacts anywhere but Brevo.
 */
export function brevoApiBase(env: Env = process.env): string {
  const override = env.BREVO_API_URL?.trim();
  if (override && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[\w/.-]*)?$/.test(override)) return override.replace(/\/$/, "");
  return BREVO_API;
}
const TIMEOUT_MS = 10_000;

/** Brevo list ids, fixed by the owner. */
export const BREVO_LISTS = { users: 4, newsletter: 5 } as const;

type Env = Record<string, string | undefined>;

export type EmailErrorKind = "not_configured" | "invalid" | "unauthorized" | "rate_limited" | "rejected" | "unavailable" | "timeout";

export class EmailError extends Error {
  readonly kind: EmailErrorKind;
  readonly status?: number;
  constructor(kind: EmailErrorKind, message: string, status?: number) {
    super(message);
    this.name = "EmailError";
    this.kind = kind;
    this.status = status;
  }

  get retryable(): boolean {
    return this.kind === "rate_limited" || this.kind === "unavailable" || this.kind === "timeout";
  }
}

export interface OutgoingEmail {
  to: Mailbox;
  email: RenderedEmail;
  tags?: string[];
  /** Required for marketing and reminder mail: the one-click unsubscribe target. */
  unsubscribeUrl?: string;
  /** Brevo drops a second send with the same key, so a retry cannot mail twice. */
  idempotencyKey?: string;
  /** Prepended to the subject, e.g. "[TEST] " for the test sender. */
  subjectPrefix?: string;
  /** Overrides the support reply-to: a support request replies to the person who wrote it. */
  replyTo?: Mailbox;
}

export interface BrevoDeps {
  fetch?: typeof fetch;
  env?: Env;
  log?: (line: string) => void;
}

export function maskAddress(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 1)}***@${domain}`;
}

export function isDryRun(env: Env = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.EMAIL_DRY_RUN?.trim() ?? "");
}

export function isBrevoConfigured(env: Env = process.env): boolean {
  return Boolean(env.BREVO_API_KEY?.trim()) || isDryRun(env);
}

const HEADER_UNSAFE = /[\r\n]/;

export function brevoPayload(message: OutgoingEmail, env: Env = process.env) {
  const { email } = message;
  const needsUnsubscribe = email.category !== "transactional";
  if (!isEmailAddress(message.to.email)) throw new EmailError("invalid", "The recipient address is not valid.");
  const subject = `${message.subjectPrefix ?? ""}${email.subject}`;
  if (HEADER_UNSAFE.test(subject) || !subject.trim()) throw new EmailError("invalid", "The subject is empty or holds a line break.");
  if (needsUnsubscribe && !/^(https:\/\/|http:\/\/localhost)/.test(message.unsubscribeUrl ?? "")) {
    throw new EmailError("invalid", `A ${email.category} email needs an unsubscribe link.`);
  }

  const headers: Record<string, string> = {};
  if (needsUnsubscribe && message.unsubscribeUrl) {
    if (HEADER_UNSAFE.test(message.unsubscribeUrl)) throw new EmailError("invalid", "The unsubscribe link holds a line break.");
    headers["List-Unsubscribe"] = `<${message.unsubscribeUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (message.idempotencyKey) headers.idempotencyKey = message.idempotencyKey.slice(0, 128);

  const name = message.to.name?.replace(/[\r\n"<>]/g, " ").trim().slice(0, 80);
  const tags = [...new Set((message.tags ?? []).map((tag) => tag.replace(/[^A-Za-z0-9:_.-]/g, "-").slice(0, 60)).filter(Boolean))].slice(0, 10);
  const { from, replyTo: defaultReplyTo } = senders(env);
  let replyTo = defaultReplyTo;
  if (message.replyTo) {
    if (!isEmailAddress(message.replyTo.email)) throw new EmailError("invalid", "The reply-to address is not valid.");
    const replyName = message.replyTo.name?.replace(/[\r\n"<>]/g, " ").trim().slice(0, 80);
    replyTo = replyName ? { email: message.replyTo.email, name: replyName } : { email: message.replyTo.email };
  }

  return {
    sender: from,
    replyTo,
    to: [name ? { email: message.to.email, name } : { email: message.to.email }],
    subject,
    htmlContent: email.html,
    textContent: email.text,
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(tags.length ? { tags } : {}),
  };
}

async function call(path: string, init: { method: string; body?: unknown }, deps: BrevoDeps): Promise<Response> {
  const env = deps.env ?? process.env;
  const key = env.BREVO_API_KEY?.trim();
  if (!key) throw new EmailError("not_configured", "BREVO_API_KEY is not set.");
  try {
    return await (deps.fetch ?? fetch)(`${brevoApiBase(env)}${path}`, {
      method: init.method,
      headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (caught) {
    const name = (caught as { name?: string })?.name;
    if (name === "TimeoutError" || name === "AbortError") throw new EmailError("timeout", "Brevo did not answer in time.");
    throw new EmailError("unavailable", "Couldn't reach Brevo.");
  }
}

async function failure(response: Response): Promise<EmailError> {
  const detail = await response
    .json()
    .then((raw: unknown) => {
      const body = (raw ?? {}) as { code?: unknown; message?: unknown };
      return [body.code, body.message].filter((part) => typeof part === "string").join(": ");
    })
    .catch(() => "");
  const described = `Brevo answered ${response.status}${detail ? ` (${detail.slice(0, 200)})` : ""}.`;
  if (response.status === 401 || response.status === 403) return new EmailError("unauthorized", described, response.status);
  if (response.status === 429) return new EmailError("rate_limited", described, response.status);
  if (response.status >= 500) return new EmailError("unavailable", described, response.status);
  return new EmailError("rejected", described, response.status);
}

export async function sendEmail(message: OutgoingEmail, deps: BrevoDeps = {}): Promise<{ messageId: string | null; dryRun: boolean }> {
  const env = deps.env ?? process.env;
  const payload = brevoPayload(message, env);
  if (isDryRun(env)) {
    (deps.log ?? console.log)(`[email dry run] ${message.email.category} "${payload.subject}" to ${maskAddress(message.to.email)}`);
    return { messageId: null, dryRun: true };
  }
  const response = await call("/smtp/email", { method: "POST", body: payload }, deps);
  if (!response.ok) throw await failure(response);
  const body = (await response.json().catch(() => null)) as { messageId?: unknown } | null;
  return { messageId: typeof body?.messageId === "string" ? body.messageId : null, dryRun: false };
}

// Contacts ---------------------------------------------------------------------

export type ContactAttributes = Partial<Record<"PLAN" | "PLATFORM" | "CEFR_LEVEL" | "FIRSTNAME", string>>;

function cleanAttributes(attributes: ContactAttributes): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim().slice(0, 60);
  }
  return out;
}

/** Adds or updates a contact on the given lists. Account email only ever uses list 4. */
export async function upsertContact(email: string, listIds: number[], attributes: ContactAttributes = {}, deps: BrevoDeps = {}): Promise<void> {
  if (!isEmailAddress(email)) throw new EmailError("invalid", "The contact address is not valid.");
  if (isDryRun(deps.env ?? process.env)) return;
  const response = await call("/contacts", { method: "POST", body: { email, listIds, attributes: cleanAttributes(attributes), updateEnabled: true } }, deps);
  if (!response.ok) throw await failure(response);
}

/**
 * Starts Brevo's double opt-in for the newsletter: Brevo mails the DOI
 * template (our newsletter-confirm design, uploaded by
 * scripts/email/brevo-doi-template.ts) and adds the contact to list 5 only
 * after the click, then sends the browser to `redirectionUrl`.
 */
export async function startDoubleOptIn(
  input: { email: string; templateId: number; redirectionUrl: string; attributes?: ContactAttributes },
  deps: BrevoDeps = {},
): Promise<void> {
  if (!isEmailAddress(input.email)) throw new EmailError("invalid", "The contact address is not valid.");
  if (isDryRun(deps.env ?? process.env)) return;
  const response = await call(
    "/contacts/doubleOptinConfirmation",
    {
      method: "POST",
      body: {
        email: input.email,
        includeListIds: [BREVO_LISTS.newsletter],
        templateId: input.templateId,
        redirectionUrl: input.redirectionUrl,
        attributes: cleanAttributes(input.attributes ?? {}),
      },
    },
    deps,
  );
  if (!response.ok) throw await failure(response);
}

/** The lists a contact is on, or null when Brevo has no such contact. */
export async function contactLists(email: string, deps: BrevoDeps = {}): Promise<number[] | null> {
  if (!isEmailAddress(email)) return null;
  const response = await call(`/contacts/${encodeURIComponent(email)}`, { method: "GET" }, deps);
  if (response.status === 404) return null;
  if (!response.ok) throw await failure(response);
  const body = (await response.json().catch(() => null)) as { listIds?: unknown } | null;
  return Array.isArray(body?.listIds) ? body.listIds.filter((id): id is number => typeof id === "number") : [];
}

export async function removeFromList(email: string, listId: number, deps: BrevoDeps = {}): Promise<void> {
  if (!isEmailAddress(email) || isDryRun(deps.env ?? process.env)) return;
  const response = await call(`/contacts/lists/${listId}/contacts/remove`, { method: "POST", body: { emails: [email] } }, deps);
  if (!response.ok && response.status !== 404 && response.status !== 400) throw await failure(response);
}

/** Deletes the contact entirely, for account deletion. A missing contact is fine. */
export async function deleteContact(email: string, deps: BrevoDeps = {}): Promise<void> {
  if (!isEmailAddress(email) || isDryRun(deps.env ?? process.env)) return;
  const response = await call(`/contacts/${encodeURIComponent(email)}`, { method: "DELETE" }, deps);
  if (!response.ok && response.status !== 404) throw await failure(response);
}
