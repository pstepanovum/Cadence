// FILE: src/lib/firebase/providers.ts
//
// Google and Apple sign-in in the browser, and the account's sign-in methods
// afterwards. A popup first; where popups are blocked or unreliable (Safari
// with its storage partitioning, phones, in-app browsers) a full-page
// redirect, finished by `completeRedirect()` on the page it returns to.
//
// Same email, another provider: Firebase refuses the new credential with
// auth/account-exists-with-different-credential. The credential is kept in
// sessionStorage (it has to survive a redirect), the person signs in the way
// they did before, and it is then linked to that account
// (src/lib/platform/sign-in-methods.ts holds the shared rules).
"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthCredential,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  unlink,
  updatePassword,
  type AuthProvider,
  type User,
  type UserCredential,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  canLinkPending,
  canRemoveMethod,
  isSignInMethod,
  pendingLinkFromError,
  providerButtons,
  type PendingLink,
  type SignInMethod,
} from "@/lib/platform/sign-in-methods";

export type ProviderMethod = Extract<SignInMethod, "apple.com" | "google.com">;

/**
 * Google is always offered on the web. Apple on the web needs a Services ID
 * and key in the Firebase Apple provider (native iOS does not), so it shows
 * only once NEXT_PUBLIC_APPLE_WEB_SIGNIN=1 is set at build time.
 */
export const WEB_PROVIDERS = providerButtons("web", {
  apple: process.env.NEXT_PUBLIC_APPLE_WEB_SIGNIN === "1",
  google: true,
}) as ProviderMethod[];

const PENDING_KEY = "cadence.pendingLink";
const REDIRECT_KEY = "cadence.authRedirect";

function providerFor(method: ProviderMethod): AuthProvider {
  if (method === "google.com") {
    const google = new GoogleAuthProvider();
    google.setCustomParameters({ prompt: "select_account" });
    return google;
  }
  const apple = new OAuthProvider("apple.com");
  apple.addScope("email");
  apple.addScope("name");
  return apple;
}

function credentialFromError(method: ProviderMethod, cause: unknown): OAuthCredential | null {
  const error = cause as Parameters<typeof GoogleAuthProvider.credentialFromError>[0];
  return method === "google.com" ? GoogleAuthProvider.credentialFromError(error) : OAuthProvider.credentialFromError(error);
}

/**
 * Phones, iPads and Safari get the redirect straight away: popups there are
 * either blocked or lose their result to storage partitioning.
 */
export function prefersRedirect(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): boolean {
  if (/iPhone|iPad|iPod|Android|Mobile/i.test(userAgent)) return true;
  return /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/i.test(userAgent);
}

const POPUP_FAILED = new Set(["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/web-storage-unsupported"]);

function session(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The provider waiting to be linked

interface StoredPending extends PendingLink {
  credential: object;
}

export function readPendingLink(): PendingLink | null {
  const raw = session()?.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPending;
    return isSignInMethod(parsed.method) ? { method: parsed.method, email: typeof parsed.email === "string" ? parsed.email : null } : null;
  } catch {
    return null;
  }
}

function writePendingLink(link: PendingLink, credential: OAuthCredential) {
  session()?.setItem(PENDING_KEY, JSON.stringify({ ...link, credential: credential.toJSON() }));
}

export function clearPendingLink() {
  session()?.removeItem(PENDING_KEY);
}

function pendingCredential(): OAuthCredential | null {
  const raw = session()?.getItem(PENDING_KEY);
  if (!raw) return null;
  try {
    return OAuthCredential.fromJSON((JSON.parse(raw) as StoredPending).credential);
  } catch {
    return null;
  }
}

/**
 * Links the waiting provider after a successful sign-in, but only to the
 * account the conflict named (canLinkPending): on a shared browser the next
 * person to sign in must never receive someone else's Google or Apple. A
 * mismatch drops it and the sign-in goes ahead; the method can still be added
 * in Account > Sign-in methods.
 */
async function afterSignIn(user: User): Promise<void> {
  const waiting = readPendingLink();
  const credential = pendingCredential();
  clearPendingLink();
  if (!credential || !waiting) return;
  if (!canLinkPending(waiting, user.email)) return;
  try {
    await linkWithCredential(user, credential);
  } catch (cause) {
    const code = (cause as { code?: string } | null)?.code;
    if (code !== "auth/provider-already-linked") throw cause;
  }
}

// ---------------------------------------------------------------------------
// Signing in

export type ProviderOutcome =
  | { status: "signed-in"; user: User; isNewUser: boolean }
  | { status: "link-needed"; pending: PendingLink }
  | { status: "redirecting" }
  | { status: "cancelled" };

const CANCELLED = new Set(["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"]);

async function signedIn(result: UserCredential): Promise<ProviderOutcome> {
  await afterSignIn(result.user);
  return { status: "signed-in", user: result.user, isNewUser: getAdditionalUserInfo(result)?.isNewUser ?? false };
}

function conflict(method: ProviderMethod, cause: unknown): ProviderOutcome | null {
  const link = pendingLinkFromError(cause, method);
  const credential = link ? credentialFromError(method, cause) : null;
  if (!link || !credential) return null;
  writePendingLink(link, credential);
  return { status: "link-needed", pending: link };
}

export async function signInWithProvider(method: ProviderMethod, intent: "signin" | "signup"): Promise<ProviderOutcome> {
  const auth = getFirebaseAuth();
  const provider = providerFor(method);
  const redirect = async (): Promise<ProviderOutcome> => {
    session()?.setItem(REDIRECT_KEY, JSON.stringify({ kind: intent, method }));
    await signInWithRedirect(auth, provider);
    return { status: "redirecting" };
  };
  if (prefersRedirect()) return redirect();
  try {
    return await signedIn(await signInWithPopup(auth, provider));
  } catch (cause) {
    const code = (cause as { code?: string } | null)?.code ?? "";
    if (CANCELLED.has(code)) return { status: "cancelled" };
    if (POPUP_FAILED.has(code)) return redirect();
    const pending = conflict(method, cause);
    if (pending) return pending;
    throw cause;
  }
}

/**
 * Finishes a redirect that started on this page (sign-in or adding a
 * method). Null when the page was not opened by one.
 */
export async function completeRedirect(): Promise<(ProviderOutcome & { kind: string }) | null> {
  const store = session();
  const raw = store?.getItem(REDIRECT_KEY);
  if (!raw) return null;
  store?.removeItem(REDIRECT_KEY);
  const started = JSON.parse(raw) as { kind: string; method: ProviderMethod };
  try {
    const result = await getRedirectResult(getFirebaseAuth());
    if (!result) return { status: "cancelled", kind: started.kind };
    return { ...(await signedIn(result)), kind: started.kind };
  } catch (cause) {
    const pending = conflict(started.method, cause);
    if (pending) return { ...pending, kind: started.kind };
    throw cause;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const { user } = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  await afterSignIn(user);
  return user;
}

export async function createAccountWithEmail(email: string, password: string): Promise<User> {
  const { user } = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  await afterSignIn(user);
  return user;
}

// ---------------------------------------------------------------------------
// The account's methods

function currentUser(): User {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in again, then try once more.");
  return user;
}

export async function signedInUser(): Promise<User | null> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  return auth.currentUser;
}

export function providerIds(user: User): string[] {
  return user.providerData.map((info) => info.providerId);
}

/** Adds Google or Apple to the signed-in account. */
export async function linkProvider(method: ProviderMethod): Promise<"linked" | "redirecting" | "cancelled"> {
  const user = currentUser();
  const provider = providerFor(method);
  const redirect = async () => {
    session()?.setItem(REDIRECT_KEY, JSON.stringify({ kind: "link", method }));
    await linkWithRedirect(user, provider);
    return "redirecting" as const;
  };
  if (prefersRedirect()) return redirect();
  try {
    await linkWithPopup(user, provider);
    return "linked";
  } catch (cause) {
    const code = (cause as { code?: string } | null)?.code ?? "";
    if (CANCELLED.has(code)) return "cancelled";
    if (POPUP_FAILED.has(code)) return redirect();
    throw cause;
  }
}

export async function addPassword(password: string): Promise<void> {
  const user = currentUser();
  if (!user.email) throw new Error("This account has no email address to sign in with.");
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch (cause) {
    // Some backends (the Auth emulator among them) refuse to link a password
    // for the account's own email; setting one on the signed-in user adds
    // the same "password" method.
    if ((cause as { code?: string } | null)?.code !== "auth/email-already-in-use") throw cause;
    await updatePassword(user, password);
  }
  await user.reload();
}

export async function removeMethod(method: SignInMethod): Promise<void> {
  const user = currentUser();
  if (!canRemoveMethod(providerIds(user), method)) throw new Error("Keep at least one way to sign in.");
  await unlink(user, method);
}

/** A fresh sign-in before something sensitive: the password, or Google or Apple in a popup. */
export async function reauthenticate(method: SignInMethod, password?: string): Promise<boolean> {
  const user = currentUser();
  if (method === "password") {
    if (!user.email || !password) throw new Error("Enter your password.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return true;
  }
  try {
    await reauthenticateWithPopup(user, providerFor(method));
    return true;
  } catch (cause) {
    if (CANCELLED.has((cause as { code?: string } | null)?.code ?? "")) return false;
    throw cause;
  }
}

export async function changePassword(current: string, next: string): Promise<void> {
  await reauthenticate("password", current);
  await updatePassword(currentUser(), next);
}
