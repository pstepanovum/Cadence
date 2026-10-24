// FILE: src/lib/server/account-events.ts
//
// Account email that follows from what the server can see, never from what a
// client claims:
//
//   first sign-in of a new account   welcome (and verify-email when unverified),
//                                    and the address joins Brevo list 4
//                                    (account email only, never marketing)
//   a device we have not seen        new-sign-in
//   the sign-in email changed        email-changed, to the old and the new address
//   the password changed             password-changed (Firebase moves
//                                    tokensValidAfterTime when it does)
//   many failed sign-ins             suspicious-activity, at most once a day
//
// What we remember is in users/{uid}.security: the last email, the last
// tokensValidAfterTime, and hashes of device labels (never the user agent).
import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

import { appOrigin } from "./env";
import { auth as defaultAuth, db as defaultDb } from "./firebase";
import { BREVO_LISTS, sendEmail, upsertContact } from "./email/brevo";
import { mailKey, queueMail, type QueueInput } from "./email/queue";
import { renderTemplate, type TemplateId } from "./email/templates/index";

const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000;
const MAX_DEVICES = 20;

/** "Safari on macOS", "Cadence on iOS": enough to recognise, nothing to fingerprint. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  const app = /CadenceDesktop/.test(ua)
    ? "Cadence desktop"
    : /Cadence|Expo|okhttp|CFNetwork/.test(ua)
      ? "Cadence app"
      : /Edg\//.test(ua)
        ? "Edge"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "A browser";
  return `${app} on ${os}`;
}

export function deviceHash(label: string, uid: string): string {
  return createHash("sha256").update(`${uid}|${label}`).digest("hex").slice(0, 24);
}

export interface SignInContext {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  userAgent: string | null;
  /** Seconds; a sign-in already noted (lastSignInAt at or after it) is skipped. */
  authTime?: number;
  now?: number;
}

export interface SignInDeps {
  db?: Firestore;
  getUser?: (uid: string) => Promise<{ creationTime: number; tokensValidAfter: number | null; email: string | null }>;
  addContact?: (email: string) => Promise<void>;
  sendVerification?: (email: string) => Promise<void>;
}

async function loadUser(uid: string) {
  const user = await defaultAuth().getUser(uid);
  return {
    creationTime: Date.parse(user.metadata.creationTime),
    tokensValidAfter: user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : null,
    email: user.email ?? null,
  };
}

/** Runs after a real sign-in. Returns the mailQueue keys it queued. */
export async function noteSignIn(context: SignInContext, deps: SignInDeps = {}): Promise<string[]> {
  const firestore = deps.db ?? defaultDb();
  const now = context.now ?? Date.now();
  const userRef = firestore.collection("users").doc(context.uid);
  const [snapshot, record] = await Promise.all([userRef.get(), (deps.getUser ?? loadUser)(context.uid)]);
  const security = (snapshot.data()?.security ?? null) as { email?: string; tokensValidAfter?: number; devices?: string[]; lastSignInAt?: number } | null;
  if (context.authTime && security?.lastSignInAt && security.lastSignInAt >= context.authTime * 1000) return [];
  const email = record.email ?? context.email;
  const label = deviceLabel(context.userAgent);
  const device = deviceHash(label, context.uid);
  const keys: string[] = [];
  const queue = async <Id extends TemplateId>(key: string, input: QueueInput<Id>) => {
    if (await queueMail(key, input, { db: firestore, now })) keys.push(key);
  };

  if (!security) {
    if (now - record.creationTime < NEW_ACCOUNT_MS) {
      await queue(mailKey("welcome", context.uid), { template: "welcome", uid: context.uid, props: { name: snapshot.data()?.displayName ?? undefined } });
      if (email) {
        await (deps.addContact ?? ((address: string) => upsertContact(address, [BREVO_LISTS.users], { PLAN: "free" })))(email).catch((error) =>
          console.error("Could not add the account to Brevo:", error instanceof Error ? error.message : error),
        );
        if (!context.emailVerified) {
          await (deps.sendVerification ?? sendVerificationEmail)(email).catch((error) =>
            console.error("Could not send the verify-email message:", error instanceof Error ? error.message : error),
          );
        }
      }
    }
  } else {
    if (security.email && email && security.email.toLowerCase() !== email.toLowerCase()) {
      const props = { oldEmail: security.email, newEmail: email, changedAt: now };
      await queue(mailKey("email-changed", context.uid, String(now), "old"), { template: "email-changed", to: security.email, props: { ...props, audience: "old" } });
      await queue(mailKey("email-changed", context.uid, String(now), "new"), { template: "email-changed", uid: context.uid, props: { ...props, audience: "new" } });
    }
    if (typeof security.tokensValidAfter === "number" && record.tokensValidAfter && record.tokensValidAfter > security.tokensValidAfter) {
      await queue(mailKey("password-changed", context.uid, String(record.tokensValidAfter)), { template: "password-changed", uid: context.uid, props: { email: email ?? "", changedAt: record.tokensValidAfter } });
    }
    if (!(security.devices ?? []).includes(device)) {
      await queue(mailKey("new-sign-in", context.uid, device), { template: "new-sign-in", uid: context.uid, props: { device: label, at: now } });
    }
  }

  const devices = [device, ...(security?.devices ?? []).filter((d) => d !== device)].slice(0, MAX_DEVICES);
  await userRef.set({ security: { email, tokensValidAfter: record.tokensValidAfter, devices, lastSignInAt: now } }, { merge: true });
  return keys;
}

/**
 * The reset page reports a finished reset with the address; an email goes out
 * only if Firebase really moved tokensValidAfterTime since we last looked, so
 * nobody can trigger it for an account they do not control.
 */
export async function notePasswordChanged(email: string, deps: SignInDeps = {}): Promise<string[]> {
  const firestore = deps.db ?? defaultDb();
  let uid: string;
  try {
    uid = (await defaultAuth().getUserByEmail(email)).uid;
  } catch {
    return [];
  }
  const record = await (deps.getUser ?? loadUser)(uid);
  const userRef = firestore.collection("users").doc(uid);
  const security = ((await userRef.get()).data()?.security ?? {}) as { tokensValidAfter?: number };
  if (!record.tokensValidAfter || (typeof security.tokensValidAfter === "number" && record.tokensValidAfter <= security.tokensValidAfter)) return [];
  if (Date.now() - record.tokensValidAfter > 15 * 60 * 1000) return [];
  const key = mailKey("password-changed", uid, String(record.tokensValidAfter));
  const queued = await queueMail(key, { template: "password-changed", uid, props: { email: record.email ?? email, changedAt: record.tokensValidAfter } }, { db: firestore });
  await userRef.set({ security: { tokensValidAfter: record.tokensValidAfter } }, { merge: true });
  return queued ? [key] : [];
}

/**
 * Firebase's one-time action code from a generated link, placed on our own
 * page, so learners never see Firebase's default handler.
 */
export function ownActionLink(firebaseLink: string, page: "/reset-password" | "/verify-email", origin = appOrigin()): string {
  const source = new URL(firebaseLink);
  const code = source.searchParams.get("oobCode");
  const mode = source.searchParams.get("mode");
  if (!code) throw new Error("The generated link has no action code.");
  const target = new URL(page, origin);
  if (mode) target.searchParams.set("mode", mode);
  target.searchParams.set("oobCode", code);
  return target.toString();
}

/** Generates Firebase's verification code and sends it in our own template, linking to our page. */
export async function sendVerificationEmail(email: string): Promise<void> {
  const link = await defaultAuth().generateEmailVerificationLink(email, { url: `${appOrigin()}/dashboard` });
  await sendEmail({ to: { email }, email: renderTemplate("verify-email", { email, verifyUrl: ownActionLink(link, "/verify-email") }), tags: ["verify-email"] });
}
