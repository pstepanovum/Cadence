// FILE: src/lib/firebase/auth-errors.ts
//
// Firebase Auth error codes turned into sentences a learner can act on. Pure,
// so it is tested in tests/auth/auth-errors.test.ts.

const MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password do not match an account.",
  "auth/wrong-password": "That email and password do not match an account.",
  "auth/user-not-found": "That email and password do not match an account.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead, with your password, Google or Apple.",
  "auth/weak-password": "Choose a password with at least 6 characters.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/expired-action-code": "This link has expired. Request a new one.",
  "auth/invalid-action-code": "This link is no longer valid. Request a new one.",
  "auth/unauthorized-continue-uri": "This site is not allowed to send reset links yet.",
  "auth/operation-not-allowed": "That way of signing in isn't available yet. Use another one.",
  "auth/unauthorized-domain": "This address isn't allowed to sign in yet. Use the main Cadence site.",
  "auth/credential-already-in-use": "That sign-in is already used by another Cadence account.",
  "auth/provider-already-linked": "That way of signing in is already on your account.",
  "auth/requires-recent-login": "For your security, sign in again, then try once more.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this site and try again.",
  "auth/invalid-idp-response": "Google or Apple didn't confirm the sign-in. Try again.",
};

export function describeAuthError(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && MESSAGES[code]) {
      return MESSAGES[code];
    }
  }

  if (error instanceof Error && error.message && !error.message.startsWith("Firebase:")) {
    return error.message;
  }

  return fallback;
}
