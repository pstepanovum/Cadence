// FILE: src/lib/server/password-reset.ts
//
// Cadence's own password reset. Firebase's reset links and emails are not
// used at all: with email enumeration protection on, the Admin SDK's reset-link generator
// fails for real accounts in production ("Unable to create the email action
// link"), and its emails are Firebase's, not ours.
//
//   issue     an account that signs in with a password gets a random 32-byte
//             token (base64url); only its SHA-256 is stored, in
//             passwordResets/{hash}, for 60 minutes and one use, and every
//             earlier unused token of that account stops working. An account
//             that signs in only with Apple or Google gets a token-free note
//             saying so. An unknown or disabled address gets nothing, and the
//             route answers the same either way.
//   check     the reset page asks whether a token still works, and shows the
//             masked address or why not (expired, used, unknown).
//   confirm   one transaction checks the hash is unexpired and unused and
//             marks it used; then the password is set, the address marked
//             verified (finishing a reset proves the person reads that
//             inbox), and every refresh token revoked, so every signed-in
//             device is signed out.
//
// passwordResets is server-only (firestore.rules deny every client); the daily
// job deletes records a day after they expire, and a TTL policy on expireAt
// is the backstop.
import { createHash, randomBytes } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";

import { isPasswordAcceptable } from "../../components/auth/password-rules";
import { maskAddress } from "./email/brevo";
import { auth as defaultAuth, db as defaultDb } from "./firebase";

export const RESET_COLLECTION = "passwordResets";
export const RESET_TTL_MS = 60 * 60 * 1000;
const KEEP_AFTER_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type SocialProvider = "apple" | "google";

/** The account facts a reset needs, from Firebase Authentication. */
export interface ResetUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  disabled: boolean;
  /** Firebase provider ids: "password", "apple.com", "google.com". */
  providers: string[];
}

export interface ResetAuth {
  getUserByEmail(email: string): Promise<ResetUser | null>;
  getUser(uid: string): Promise<ResetUser | null>;
  /** Sets the password and marks the address verified. */
  setPassword(uid: string, password: string): Promise<void>;
  /** Revokes every refresh token; returns the new tokensValidAfter time (ms). */
  revokeSessions(uid: string): Promise<number | null>;
}

export interface ResetDeps {
  db?: Firestore;
  auth?: ResetAuth;
  now?: number;
}

function toResetUser(user: import("firebase-admin/auth").UserRecord): ResetUser {
  return { uid: user.uid, email: user.email ?? null, emailVerified: user.emailVerified, disabled: user.disabled, providers: user.providerData.map((p) => p.providerId) };
}

/** Firebase Admin, as the reset needs it. */
export function firebaseResetAuth(): ResetAuth {
  const missing = (error: unknown) => /user-not-found/.test(String((error as { code?: unknown })?.code ?? ""));
  return {
    async getUserByEmail(email) {
      try {
        return toResetUser(await defaultAuth().getUserByEmail(email));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async getUser(uid) {
      try {
        return toResetUser(await defaultAuth().getUser(uid));
      } catch (error) {
        if (missing(error)) return null;
        throw error;
      }
    },
    async setPassword(uid, password) {
      await defaultAuth().updateUser(uid, { password, emailVerified: true });
    },
    async revokeSessions(uid) {
      await defaultAuth().revokeRefreshTokens(uid);
      const after = (await defaultAuth().getUser(uid)).tokensValidAfterTime;
      return after ? Date.parse(after) : null;
    },
  };
}

// Tokens -----------------------------------------------------------------------

export function newResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** 32 bytes, base64url, no padding: exactly 43 characters. */
export function isResetTokenShape(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function resetPageUrl(token: string, origin: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

/** Apple and Google among an account's providers, in a stable order. */
export function socialProviders(providers: readonly string[]): SocialProvider[] {
  const out: SocialProvider[] = [];
  if (providers.includes("apple.com")) out.push("apple");
  if (providers.includes("google.com")) out.push("google");
  return out;
}

// Issue ------------------------------------------------------------------------

export type ResetPlan =
  | { kind: "none" }
  | { kind: "social"; email: string; providers: SocialProvider[] }
  | { kind: "password"; uid: string; email: string; token: string };

export async function issuePasswordReset(email: string, deps: ResetDeps = {}): Promise<ResetPlan> {
  const auth = deps.auth ?? firebaseResetAuth();
  const user = await auth.getUserByEmail(email);
  if (!user || user.disabled || !user.email) return { kind: "none" };
  if (!user.providers.includes("password")) {
    const providers = socialProviders(user.providers);
    return providers.length ? { kind: "social", email: user.email, providers } : { kind: "none" };
  }

  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const token = newResetToken();
  const collection = firestore.collection(RESET_COLLECTION);
  await firestore.runTransaction(async (tx) => {
    const earlier = await tx.get(collection.where("uid", "==", user.uid));
    for (const doc of earlier.docs) {
      const data = doc.data();
      if (data.usedAt === null && data.invalidatedAt === null) tx.update(doc.ref, { invalidatedAt: now });
    }
    tx.create(collection.doc(hashResetToken(token)), {
      uid: user.uid,
      email: user.email,
      createdAt: now,
      expiresAt: now + RESET_TTL_MS,
      usedAt: null,
      invalidatedAt: null,
      expireAt: Timestamp.fromMillis(now + RESET_TTL_MS + KEEP_AFTER_EXPIRY_MS),
    });
  });
  return { kind: "password", uid: user.uid, email: user.email, token };
}

// Check ------------------------------------------------------------------------

export type ResetState = { state: "valid"; email: string } | { state: "expired" | "used" | "invalid" };

function stateOf(data: FirebaseFirestore.DocumentData | undefined, now: number): ResetState {
  if (!data) return { state: "invalid" };
  if (data.usedAt !== null || data.invalidatedAt !== null) return { state: "used" };
  if (typeof data.expiresAt !== "number" || data.expiresAt <= now) return { state: "expired" };
  return { state: "valid", email: maskAddress(String(data.email ?? "")) };
}

export async function checkPasswordReset(token: unknown, deps: ResetDeps = {}): Promise<ResetState> {
  if (!isResetTokenShape(token)) return { state: "invalid" };
  const firestore = deps.db ?? defaultDb();
  const snapshot = await firestore.collection(RESET_COLLECTION).doc(hashResetToken(token)).get();
  return stateOf(snapshot.data(), deps.now ?? Date.now());
}

// Confirm ----------------------------------------------------------------------

export type ConfirmResult =
  | { ok: true; uid: string; email: string; tokensValidAfter: number | null }
  | { ok: false; reason: "invalid" | "expired" | "used" | "weak_password" };

export async function completePasswordReset(token: unknown, password: unknown, deps: ResetDeps = {}): Promise<ConfirmResult> {
  if (!isResetTokenShape(token)) return { ok: false, reason: "invalid" };
  const firestore = deps.db ?? defaultDb();
  const auth = deps.auth ?? firebaseResetAuth();
  const now = deps.now ?? Date.now();
  const ref = firestore.collection(RESET_COLLECTION).doc(hashResetToken(token));

  const first = await ref.get();
  const before = stateOf(first.data(), now);
  if (before.state !== "valid") return { ok: false, reason: before.state };
  const uid = String(first.data()?.uid ?? "");
  const user = await auth.getUser(uid);
  // Tokens are only issued to password accounts; one that no longer has a password provider is refused.
  if (!user || user.disabled || !user.email || !user.providers.includes("password")) return { ok: false, reason: "invalid" };
  if (typeof password !== "string" || !isPasswordAcceptable(password, user.email)) return { ok: false, reason: "weak_password" };

  const claimed = await firestore.runTransaction(async (tx) => {
    const state = stateOf((await tx.get(ref)).data(), now);
    if (state.state !== "valid") return state.state;
    tx.update(ref, { usedAt: now });
    return "valid" as const;
  });
  if (claimed !== "valid") return { ok: false, reason: claimed };

  try {
    await auth.setPassword(uid, password);
  } catch (error) {
    // The password did not change, so the link may be tried again.
    await ref.update({ usedAt: null }).catch(() => undefined);
    throw error;
  }
  const tokensValidAfter = await auth.revokeSessions(uid);
  return { ok: true, uid, email: user.email, tokensValidAfter };
}

/** The daily job: records a day past their expiry go. */
export async function purgeExpiredResets(deps: ResetDeps = {}): Promise<number> {
  const firestore = deps.db ?? defaultDb();
  const now = deps.now ?? Date.now();
  const stale = await firestore.collection(RESET_COLLECTION).where("expiresAt", "<", now - KEEP_AFTER_EXPIRY_MS).limit(500).get();
  for (const doc of stale.docs) await doc.ref.delete();
  return stale.size;
}
