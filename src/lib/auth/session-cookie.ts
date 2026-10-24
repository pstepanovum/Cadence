// FILE: src/lib/auth/session-cookie.ts
//
// The cloud session cookie. `__session` is the one cookie name Firebase
// Hosting and App Hosting pass through to the server, so it works behind them
// as well as on any other host.
export const SESSION_COOKIE = "__session";

/** Fourteen days, the longest session cookie Firebase will mint. */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

/** An ID token older than this cannot start a session; the user signs in again. */
export const RECENT_SIGN_IN_SECONDS = 5 * 60;

export function getSessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

/** True when the token's sign-in happened within the last five minutes. */
export function isRecentSignIn(authTimeSeconds: number, nowMs: number) {
  return nowMs / 1000 - authTimeSeconds <= RECENT_SIGN_IN_SECONDS;
}
