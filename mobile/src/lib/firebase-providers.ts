// FILE: mobile/src/lib/firebase-providers.ts
//
// Every way into a Cadence account on the phone, and the account's sign-in
// methods afterwards: native Sign in with Apple (expo-apple-authentication,
// with a hashed nonce) and Google Sign-In (@react-native-google-signin), each
// turned into a Firebase credential; email and password; linking a provider
// that shares an email with an existing account; adding and removing methods
// (never the last one) and changing the password.
//
// A test build (a demo- project on the Auth emulator) cannot reach Apple or
// Google, so it signs in with the emulator's fake identity tokens instead: a
// prompt asks for an email and the emulator accepts an unsigned token for it.
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  linkWithCredential,
  OAuthProvider,
  reauthenticateWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  unlink,
  updatePassword,
  updateProfile,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, Platform } from "react-native";

import { authErrorCode } from "@/copy/auth-errors";
import { config } from "@/lib/config";
import { requireFirebaseAuth } from "@/lib/firebase";
import {
  canLinkPending,
  canRemoveMethod,
  methodLabel,
  pendingLinkFromError,
  providerButtons,
  type PendingLink,
  type SignInMethod,
} from "@/platform/sign-in-methods";

export type ProviderMethod = Extract<SignInMethod, "apple.com" | "google.com">;

/** Thrown when Apple or Google is not set up in this build. */
export class ProviderUnavailableError extends Error {}

// ---------------------------------------------------------------------------
// Which buttons this build shows

const googleConfigured = Platform.OS === "ios" ? !!config.google.iosClientId : !!config.google.webClientId;

/**
 * The provider buttons, in order (Apple first on iOS, Google never without
 * Apple there). A test build offers both through the emulator's fake tokens.
 */
export function useProviderButtons(): ProviderMethod[] {
  const [apple, setApple] = useState(Platform.OS === "ios" && config.testBuild);
  useEffect(() => {
    if (Platform.OS !== "ios" || config.testBuild) return;
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((available) => {
        if (active) setApple(available);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const surface = Platform.OS === "ios" ? "ios" : "android";
  const google = config.testBuild || googleConfigured;
  return providerButtons(surface, { apple, google }) as ProviderMethod[];
}

// ---------------------------------------------------------------------------
// Getting a credential from Apple or Google

/** Asks for the fake account a test build signs in with; null when cancelled. */
function promptTestAccount(method: ProviderMethod): Promise<string | null> {
  return new Promise((resolve) => {
    Alert.prompt(
      `Test ${methodLabel(method)} account`,
      `This test build signs in to the local emulator at ${config.authEmulator ?? "this Mac"}. Enter any email for a fake ${methodLabel(method)} account.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(null) },
        { text: "Continue", onPress: (value?: string) => resolve(value?.trim() || null) },
      ],
      "plain-text",
      "",
      "email-address",
    );
  });
}

function testCredential(method: ProviderMethod, email: string): AuthCredential {
  // The emulator accepts an unsigned ID token: a JSON object of claims.
  const idToken = JSON.stringify({ sub: `${method}:${email.toLowerCase()}`, email, email_verified: true });
  return method === "google.com" ? GoogleAuthProvider.credential(idToken) : new OAuthProvider("apple.com").credential({ idToken, rawNonce: "test" });
}

interface ProviderResult {
  credential: AuthCredential;
  /** Apple sends the name once, on the first sign-in. */
  displayName: string | null;
}

async function appleCredential(): Promise<ProviderResult | null> {
  if (Platform.OS !== "ios") throw new ProviderUnavailableError("Sign in with Apple is available on iPhone.");
  // Firebase checks that the identity token carries the SHA-256 of a nonce
  // only this request knows, so a token cannot be replayed.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  try {
    const result = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!result.identityToken) throw new Error("Apple didn't return a sign-in token. Try again.");
    const name = [result.fullName?.givenName, result.fullName?.familyName].filter(Boolean).join(" ").trim();
    return { credential: new OAuthProvider("apple.com").credential({ idToken: result.identityToken, rawNonce }), displayName: name || null };
  } catch (cause) {
    if (authErrorCode(cause) === "ERR_REQUEST_CANCELED") return null;
    throw cause;
  }
}

async function googleCredential(): Promise<ProviderResult | null> {
  if (!googleConfigured) throw new ProviderUnavailableError("Google sign-in isn't set up in this build.");
  let google: typeof import("@react-native-google-signin/google-signin");
  try {
    // Loaded on demand: Expo Go has no native Google module, and importing it
    // there would take the whole sign-in screen down.
    google = await import("@react-native-google-signin/google-signin");
  } catch {
    throw new ProviderUnavailableError("Google sign-in isn't available in this build.");
  }
  google.GoogleSignin.configure({
    iosClientId: config.google.iosClientId ?? undefined,
    webClientId: config.google.webClientId ?? undefined,
  });
  if (Platform.OS === "android") await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const response = await google.GoogleSignin.signIn();
  if (!google.isSuccessResponse(response)) return null;
  const idToken = response.data.idToken;
  if (!idToken) throw new Error("Google didn't return a sign-in token. Try again.");
  return { credential: GoogleAuthProvider.credential(idToken), displayName: response.data.user.name ?? null };
}

/** A credential for Apple or Google, or null when the person cancelled. */
async function providerCredential(method: ProviderMethod): Promise<ProviderResult | null> {
  if (config.testBuild) {
    const email = await promptTestAccount(method);
    return email ? { credential: testCredential(method, email), displayName: null } : null;
  }
  return method === "apple.com" ? appleCredential() : googleCredential();
}

/** Signs the phone out of Google too, so the next sign-in offers the account chooser. */
export async function signOutOfProviders(): Promise<void> {
  if (!googleConfigured || config.testBuild) return;
  try {
    const google = await import("@react-native-google-signin/google-signin");
    await google.GoogleSignin.signOut();
  } catch {
    // Nothing to sign out of.
  }
}

// ---------------------------------------------------------------------------
// A provider waiting to be linked to an existing account

interface Pending extends PendingLink {
  credential: AuthCredential;
}

let pending: Pending | null = null;
const listeners = new Set<() => void>();

function setPending(next: Pending | null) {
  pending = next;
  for (const listener of listeners) listener();
}

/**
 * The provider that hit an existing account with the same email, until the
 * person signs in the way they did before and it is linked.
 */
export function usePendingLink(): PendingLink | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
  );
}

export function clearPendingLink(): void {
  setPending(null);
}

/**
 * Runs after every sign-in: links the waiting provider, if any, but only to
 * the account the conflict named (canLinkPending). Another email means
 * another account, which must never receive this Apple or Google; the link is
 * dropped and the sign-in stands.
 */
async function afterSignIn(user: User, displayName: string | null = null): Promise<void> {
  if (displayName && !user.displayName) await updateProfile(user, { displayName }).catch(() => {});
  const waiting = pending;
  if (!waiting) return;
  setPending(null);
  if (!canLinkPending(waiting, user.email)) return;
  try {
    await linkWithCredential(user, waiting.credential);
  } catch (cause) {
    // Already on the account is fine; anything else should not undo the
    // sign-in that just worked.
    if (authErrorCode(cause) !== "auth/provider-already-linked") throw new LinkAfterSignInError(waiting.method, cause);
  }
}

/** Signed in, but the waiting provider could not be added. */
export class LinkAfterSignInError extends Error {
  readonly method: SignInMethod;
  constructor(method: SignInMethod, cause: unknown) {
    super(`Signed in, but ${methodLabel(method)} couldn't be added to this account.`, { cause });
    this.method = method;
  }
}

// ---------------------------------------------------------------------------
// Signing in

export type ProviderSignIn = "signed-in" | "cancelled" | "link-needed";

/**
 * Signs in with Apple or Google. When the email already has an account made
 * another way, nothing is signed in: the credential waits (usePendingLink)
 * and "link-needed" tells the screen to ask for the earlier method.
 */
export async function signInWithProvider(method: ProviderMethod): Promise<ProviderSignIn> {
  const result = await providerCredential(method);
  if (!result) return "cancelled";
  const auth = requireFirebaseAuth();
  try {
    const { user } = await signInWithCredential(auth, result.credential);
    await afterSignIn(user, result.displayName);
    return "signed-in";
  } catch (cause) {
    const link = pendingLinkFromError(cause, method);
    if (!link) throw cause;
    setPending({ ...link, credential: result.credential });
    return "link-needed";
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { user } = await signInWithEmailAndPassword(requireFirebaseAuth(), email, password);
  await afterSignIn(user);
}

export async function createAccountWithEmail(email: string, password: string): Promise<void> {
  const { user } = await createUserWithEmailAndPassword(requireFirebaseAuth(), email, password);
  await afterSignIn(user);
}

// ---------------------------------------------------------------------------
// Managing the account's methods

function currentUser(): User {
  const user = requireFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in again, then try once more.");
  return user;
}

/** The provider ids on the signed-in account. */
export function currentProviderIds(): string[] {
  const user = requireFirebaseAuth().currentUser;
  return user ? user.providerData.map((info) => info.providerId) : [];
}

/** Adds Apple or Google to the signed-in account. False when cancelled. */
export async function linkProvider(method: ProviderMethod): Promise<boolean> {
  const result = await providerCredential(method);
  if (!result) return false;
  const user = currentUser();
  await linkWithCredential(user, result.credential);
  if (result.displayName && !user.displayName) await updateProfile(user, { displayName: result.displayName }).catch(() => {});
  return true;
}

/** Adds a password to an account that signs in with Apple or Google. */
export async function addPassword(password: string): Promise<void> {
  const user = currentUser();
  if (!user.email) throw new Error("This account has no email address to sign in with.");
  try {
    await linkWithCredential(user, EmailAuthProvider.credential(user.email, password));
  } catch (cause) {
    // Some backends (the Auth emulator among them) refuse to link a password
    // for the account's own email; setting one on the signed-in user adds
    // the same "password" method.
    if (authErrorCode(cause) !== "auth/email-already-in-use") throw cause;
    await updatePassword(user, password);
    await signInAgain(user.email, password);
  }
  await user.reload();
}

/**
 * A new password revokes every session, and the server checks revocation
 * against the token's sign-in time, so the phone signs in again with it
 * rather than being signed out on its next request.
 */
async function signInAgain(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(requireFirebaseAuth(), email, password);
}

/** Removes a method, never the last one. */
export async function removeMethod(method: SignInMethod): Promise<void> {
  const user = currentUser();
  if (!canRemoveMethod(user.providerData.map((info) => info.providerId), method)) {
    throw new Error("Keep at least one way to sign in.");
  }
  await unlink(user, method);
}

/**
 * Proves it is still the account's owner before something sensitive, with
 * the password or with Apple or Google. False when cancelled.
 */
export async function reauthenticate(method: SignInMethod, password?: string): Promise<boolean> {
  const user = currentUser();
  if (method === "password") {
    if (!user.email || !password) throw new Error("Enter your password.");
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return true;
  }
  const result = await providerCredential(method);
  if (!result) return false;
  await reauthenticateWithCredential(user, result.credential);
  return true;
}

export async function changePassword(current: string, next: string): Promise<void> {
  await reauthenticate("password", current);
  const user = currentUser();
  await updatePassword(user, next);
  if (user.email) await signInAgain(user.email, next);
}
