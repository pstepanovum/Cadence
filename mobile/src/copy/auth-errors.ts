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

/** What the screen knows about the build, for errors that depend on it. */
export interface AuthErrorContext {
  /** `host:port` of the Auth emulator a test build signs in to. */
  emulator?: string | null;
}

/**
 * The person closed the Apple or Google sheet, or the browser popup. Not an
 * error: nothing is shown and nothing buzzes.
 */
export function isCancelledSignIn(cause: unknown): boolean {
  switch (authErrorCode(cause)) {
    case "ERR_REQUEST_CANCELED": // expo-apple-authentication
    case "ERR_CANCELED":
    case "SIGN_IN_CANCELLED": // Google Sign-In
    case "-5":
    case "12501":
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return true;
    default:
      return false;
  }
}

/**
 * Firebase errors carry a stable `code` ("auth/invalid-credential") and a
 * message written for developers. Say what to do instead.
 */
export function describeAuthError(cause: unknown, fallback: string, context: AuthErrorContext = {}): string {
  switch (authErrorCode(cause)) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account. Check them and try again.";
    case "auth/invalid-email":
      return "That does not look like an email address.";
    case "auth/email-already-in-use":
      return "There is already an account with that email. Sign in instead, with your password, Apple or Google.";
    case "auth/weak-password":
      return "Choose a longer password.";
    case "auth/password-does-not-meet-requirements":
      // The project's password policy: 8 to 128 characters.
      return "Choose a password of 8 to 128 characters.";
    case "auth/missing-password":
      return "Enter your password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
    case "auth/timeout":
      // A test build signs in to an emulator on the Mac that built it; when
      // that is not running, the problem is not the person's connection.
      return context.emulator
        ? `This is a test build: it signs in to a local Firebase emulator at ${context.emulator}, which isn't answering. Start the emulators on this Mac, or install the App Store or TestFlight build.`
        : "Cadence couldn't reach the sign-in service. Check your internet connection and try again.";
    case "auth/user-disabled":
      return "This account has been turned off.";
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "That way of signing in isn't available yet. Use another one.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid":
    case "auth/app-not-authorized":
      return "This build of Cadence can't talk to the sign-in service. Update the app, or use your own Cadence server for now.";
    case "auth/credential-already-in-use":
      return "That sign-in is already used by another Cadence account.";
    case "auth/provider-already-linked":
      return "That way of signing in is already on your account.";
    case "auth/requires-recent-login":
      return "For your security, sign in again, then try once more.";
    case "auth/missing-or-invalid-nonce":
    case "auth/invalid-idp-response":
      return "Apple or Google didn't confirm the sign-in. Try again.";
    default:
      return fallback;
  }
}
