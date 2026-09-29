// Turning thrown values into something a learner can act on.
//
// Kept free of React and React Native imports so it can be unit tested with the
// plain `node --test` runner (see mobile/tests/errors.test.ts).

/**
 * Every way the platform tells us "the request never reached a server". React
 * Native's fetch, expo-file-system's downloader and the pairing layer all word
 * this differently, and none of their wordings mean anything to a learner —
 * "UnexpectedException ... Promise.swift:56" is a real one.
 */
const OFFLINE_PATTERNS = [
  /network request failed/i,
  /failed to fetch/i,
  /fetch failed/i,
  /network error/i,
  /could not connect/i,
  /connection refused/i,
  /cannot connect to host/i,
  /appears to be offline/i,
  /connection appears to be offline/i,
  /software caused connection abort/i,
  /unexpectedexception/i,
  /econnrefused|enotfound|ehostunreach|enetdown|enetunreach/i,
];

const TIMEOUT_PATTERNS = [/timed? ?out/i, /\baborted\b/i, /request timeout/i];

const NOT_CONNECTED_PATTERNS = [/not connected to a server/i, /no transport/i];

export const OFFLINE_MESSAGE =
  "Cadence can't reach the server. Check your connection and try again.";
export const TIMEOUT_MESSAGE = "The server took too long to answer. Try again in a moment.";
export const NOT_CONNECTED_MESSAGE =
  "Cadence is not connected to a server yet. Connect from your profile, then try again.";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message;
    if (typeof value === "string") return value;
  }
  return "";
}

/**
 * `describeError(cause, fallback)` is what every screen shows when something
 * throws. It never returns an empty string and never returns a stack frame.
 */
export function describeError(error: unknown, fallback = "Something went wrong."): string {
  if (error === null || error === undefined) return fallback;

  const raw = messageOf(error).trim();
  if (!raw) return fallback;

  if (NOT_CONNECTED_PATTERNS.some((pattern) => pattern.test(raw))) return NOT_CONNECTED_MESSAGE;
  if (OFFLINE_PATTERNS.some((pattern) => pattern.test(raw))) return OFFLINE_MESSAGE;
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(raw))) return TIMEOUT_MESSAGE;

  // Anything that still smells like a stack frame or a native file reference is
  // the platform talking to itself, not to the learner.
  if (/\.(swift|kt|java|m|mm|cpp):\d+/.test(raw) || /\bat\s+\S+:\d+:\d+/.test(raw)) {
    return fallback;
  }

  return raw;
}
