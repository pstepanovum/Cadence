// FILE: mobile/src/platform/sign-in-methods.ts
//
// The ways to sign in to a Cadence account (email and password, Google,
// Apple), in the order each surface shows them, and the rules every client
// follows when adding or removing one: an account always keeps at least one,
// and a second provider with the same email joins the existing account rather
// than making a new one. Pure TypeScript, no Firebase SDK, so the web app and
// the phone hold one identical copy and it is unit tested.
//
// Twin: src/lib/platform/sign-in-methods.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * Firebase's provider ids for the methods Cadence offers. Anything else on
 * an account (phone, anonymous, a provider added in the console) is kept but
 * never offered or removed here.
 */
export type SignInMethod = "apple.com" | "google.com" | "password";

export const SIGN_IN_METHODS: readonly SignInMethod[] = ["apple.com", "google.com", "password"];

export type SignInSurface = "ios" | "android" | "web";

export function isSignInMethod(value: unknown): value is SignInMethod {
  return value === "apple.com" || value === "google.com" || value === "password";
}

/** The name a person knows the method by. */
export function methodLabel(method: SignInMethod): string {
  switch (method) {
    case "apple.com":
      return "Apple";
    case "google.com":
      return "Google";
    case "password":
      return "Email and password";
  }
}

/** The wording on a sign-in button, per Apple's and Google's button guidelines. */
export function continueLabel(method: SignInMethod, intent: "signin" | "signup"): string {
  switch (method) {
    case "apple.com":
      return intent === "signup" ? "Sign up with Apple" : "Sign in with Apple";
    case "google.com":
      return intent === "signup" ? "Sign up with Google" : "Sign in with Google";
    case "password":
      return intent === "signup" ? "Sign up with email" : "Sign in with email";
  }
}

/**
 * The provider buttons a surface shows, in order: Apple, then Google, on
 * every surface, so the web and the phone look alike. On iOS, Google is never
 * offered without Apple beside it (App Store guideline 4.8 asks for Sign in
 * with Apple wherever another third-party sign-in is offered). Email is
 * always last and is not a button here: the email form follows the buttons.
 */
export function providerButtons(surface: SignInSurface, available: { apple: boolean; google: boolean }): SignInMethod[] {
  if (surface === "ios" && !available.apple) return [];
  const out: SignInMethod[] = [];
  if (available.apple) out.push("apple.com");
  if (available.google) out.push("google.com");
  return out;
}

/** The methods on an account that Cadence knows about, in display order. */
export function linkedMethods(providerIds: readonly string[]): SignInMethod[] {
  return SIGN_IN_METHODS.filter((method) => providerIds.includes(method));
}

/**
 * Whether a method may be removed. An account must keep a way in: the last
 * method (counting providers Cadence does not offer, which also sign in) can
 * never be removed.
 */
export function canRemoveMethod(providerIds: readonly string[], method: SignInMethod): boolean {
  if (!providerIds.includes(method)) return false;
  return new Set(providerIds).size > 1;
}

/** Methods this surface can add to the account: offered and not linked yet. */
export function addableMethods(providerIds: readonly string[], offered: readonly SignInMethod[]): SignInMethod[] {
  return SIGN_IN_METHODS.filter((method) => offered.includes(method) && !providerIds.includes(method));
}

/**
 * Signing in with a provider whose email already belongs to an account made
 * another way. Firebase refuses the new credential with
 * `auth/account-exists-with-different-credential`; the person signs in the
 * way they did before, and the new provider is then linked to that account.
 */
export interface PendingLink {
  /** The provider the person just tried. */
  method: SignInMethod;
  email: string | null;
}

export const ACCOUNT_EXISTS_CODE = "auth/account-exists-with-different-credential";

/**
 * Reads the conflict out of a Firebase error, or null when the error is
 * something else. The SDK puts the email under `customData.email`.
 */
export function pendingLinkFromError(cause: unknown, attempted: SignInMethod): PendingLink | null {
  if (typeof cause !== "object" || cause === null) return null;
  const record = cause as { code?: unknown; customData?: { email?: unknown } };
  if (record.code !== ACCOUNT_EXISTS_CODE) return null;
  const email = typeof record.customData?.email === "string" ? record.customData.email : null;
  return { method: attempted, email };
}

/**
 * Which methods to suggest for signing in to the existing account. With email
 * enumeration protection on, Firebase no longer says which methods an email
 * has, so `known` is often empty; then every other offered method is
 * suggested.
 */
export function suggestedMethods(pending: PendingLink, offered: readonly SignInMethod[], known: readonly string[] = []): SignInMethod[] {
  const others = offered.filter((method) => method !== pending.method);
  const fromKnown = others.filter((method) => known.includes(method));
  return fromKnown.length > 0 ? fromKnown : others;
}

/** The one line shown while a link is waiting for the person to sign in. */
export function pendingLinkMessage(pending: PendingLink): string {
  const who = pending.email ? `${pending.email} already has a Cadence account` : "This email already has a Cadence account";
  return `${who}. Sign in the way you did before, and ${methodLabel(pending.method)} will be added to it.`;
}
