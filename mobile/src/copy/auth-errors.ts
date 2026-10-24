// FILE: mobile/src/copy/auth-errors.ts
//
// Sign-in failures in words a learner can act on. Kept free of React, React
// Native and the Firebase SDK so it can be unit tested with the plain
// `node --test` runner (see mobile/tests/auth-errors.test.ts).

/** The SDK's stable error code, such as "auth/invalid-credential", if any. */
export function authErrorCode(cause: unknown): string | null {
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String((cause as { code: unknown }).code)
    : null;
}

/**
 * Firebase errors carry a stable `code` ("auth/invalid-credential") and a
 * message written for developers. Say what to do instead.
 */
export function describeAuthError(cause: unknown, fallback: string): string {
  switch (authErrorCode(cause)) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account. Check them and try again.";
    case "auth/invalid-email":
      return "That does not look like an email address.";
    case "auth/email-already-in-use":
      return "There is already an account with that email. Sign in instead.";
    case "auth/weak-password":
      return "Choose a longer password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Could not reach the sign-in service. Check your connection and try again.";
    case "auth/user-disabled":
      return "This account has been turned off.";
    default:
      return fallback;
  }
}
