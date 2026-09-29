// FILE: mobile/src/pairing/errors.ts
//
// Every way connecting to a computer can fail, turned into a sentence a person
// can act on. "Cadence is not running on your computer" beats a spinner, and
// "you are on a different Wi-Fi" beats "Network request failed".
//
// Pure and exhaustive on purpose: tests/pairing/errors.test.ts checks that every
// reason produces a title, a body and a suggested next step.
import type { PairingErrorCode, ParseFailure } from "@/pairing/protocol";

/** Why the phone currently cannot talk to the computer. */
export type ConnectionFailure =
  /** Nothing answered at any address we know. */
  | "server_unreachable"
  /** The phone has no network at all. */
  | "offline"
  /** The phone is on cellular; a LAN server cannot be reached from there. */
  | "cellular_only"
  /** Something answered, but it is a different Cadence install. */
  | "wrong_server"
  /** The server unpaired this phone. */
  | "device_revoked"
  /** The device token aged out. */
  | "token_expired"
  /** App and server speak different protocol versions. */
  | "server_too_new"
  | "server_too_old"
  /** iOS local network permission was refused. */
  | "local_network_denied"
  /** The camera was refused, so the QR cannot be scanned. */
  | "camera_denied"
  /** A code was typed or scanned but the server would not take it. */
  | "code_expired"
  | "code_already_used"
  | "code_not_found"
  | "code_malformed"
  /** Scanned something that is not a Cadence QR. */
  | "not_a_pairing_code"
  /** Anything we did not anticipate. */
  | "unknown";

export interface FailureMessage {
  title: string;
  body: string;
  /** Label for the primary button, or null when there is nothing useful to do. */
  action: string | null;
  /** What the primary button should do. */
  actionKind: "retry" | "rescan" | "settings" | "none";
}

const MESSAGES: Record<ConnectionFailure, FailureMessage> = {
  server_unreachable: {
    title: "Cadence is not running on your computer",
    body: "Open Cadence on your computer, or start it with “pnpm serve”. Then try again.",
    action: "Try again",
    actionKind: "retry",
  },
  offline: {
    title: "This phone is not on Wi-Fi",
    body: "Join the same Wi-Fi network as your computer, then try again.",
    action: "Open Settings",
    actionKind: "settings",
  },
  cellular_only: {
    title: "You are on mobile data",
    body: "Cadence on your computer can only be reached over Wi-Fi. Join the same Wi-Fi network as your computer.",
    action: "Open Settings",
    actionKind: "settings",
  },
  wrong_server: {
    title: "That is a different computer",
    body: "Something answered at this address, but it is not the computer this phone was paired with. If you moved to a new computer, pair again.",
    action: "Pair again",
    actionKind: "rescan",
  },
  device_revoked: {
    title: "This phone was unpaired",
    body: "Your computer no longer recognises this phone. Scan a new code to connect again.",
    action: "Pair again",
    actionKind: "rescan",
  },
  token_expired: {
    title: "This connection expired",
    body: "Pairings last a year. Scan a new code on your computer to connect again.",
    action: "Pair again",
    actionKind: "rescan",
  },
  server_too_new: {
    title: "Update Cadence on your phone",
    body: "Cadence on your computer is newer than this app. Update the app from the App Store.",
    action: null,
    actionKind: "none",
  },
  server_too_old: {
    title: "Update Cadence on your computer",
    body: "This app is newer than Cadence on your computer. Update Cadence there, then try again.",
    action: "Try again",
    actionKind: "retry",
  },
  local_network_denied: {
    title: "Cadence cannot see your local network",
    body: "iOS is blocking Cadence from finding your computer. Turn on Local Network for Cadence in Settings, then try again.",
    action: "Open Settings",
    actionKind: "settings",
  },
  camera_denied: {
    title: "Cadence cannot use the camera",
    body: "Allow camera access to scan the code, or type the 12-character code shown on your computer instead.",
    action: "Open Settings",
    actionKind: "settings",
  },
  code_expired: {
    title: "That code has expired",
    body: "Codes last two minutes. Show a new one on your computer and scan it.",
    action: "Scan again",
    actionKind: "rescan",
  },
  code_already_used: {
    title: "That code was already used",
    body: "Each code works once. Show a new one on your computer and scan it.",
    action: "Scan again",
    actionKind: "rescan",
  },
  code_not_found: {
    title: "That code did not match",
    body: "Check the code on your computer and try again, or show a new one.",
    action: "Try again",
    actionKind: "retry",
  },
  code_malformed: {
    title: "That code does not look right",
    body: "A Cadence code is 12 characters, like ABCD-EFGH-JKMN. Check what is on your computer.",
    action: "Try again",
    actionKind: "retry",
  },
  not_a_pairing_code: {
    title: "That is not a Cadence code",
    body: "Point the camera at the square code on your computer's Cadence screen.",
    action: "Scan again",
    actionKind: "rescan",
  },
  unknown: {
    title: "Cadence could not connect",
    body: "Something went wrong reaching your computer. Check that Cadence is running there and try again.",
    action: "Try again",
    actionKind: "retry",
  },
};

export function describeFailure(failure: ConnectionFailure): FailureMessage {
  return MESSAGES[failure] ?? MESSAGES.unknown;
}

/** Map a server error code from a claim or an API call onto a failure. */
export function failureFromServerCode(code: PairingErrorCode | string | null): ConnectionFailure {
  switch (code) {
    case "code_expired":
      return "code_expired";
    case "code_already_used":
      return "code_already_used";
    case "code_not_found":
      return "code_not_found";
    case "invalid_request":
      return "code_malformed";
    case "device_revoked":
      return "device_revoked";
    case "token_expired":
      return "token_expired";
    case "protocol_version_mismatch":
      // The server does not know which side is older, so it is reported as the
      // case the person can actually fix from the phone.
      return "server_too_old";
    default:
      return "unknown";
  }
}

/** Map a QR parse failure onto a failure. */
export function failureFromParseFailure(reason: ParseFailure): ConnectionFailure {
  switch (reason) {
    case "not_a_pairing_uri":
      return "not_a_pairing_code";
    case "malformed":
      return "code_malformed";
    case "server_too_new":
      return "server_too_new";
    case "server_too_old":
      return "server_too_old";
    default:
      return "unknown";
  }
}

/**
 * Map a thrown fetch error onto a failure. React Native gives us almost nothing
 * to work with here — a failed LAN request, a refused local-network permission
 * and a dead server all surface as "Network request failed" — so the network
 * state the caller observed does the disambiguating.
 */
export function failureFromTransportError(
  error: unknown,
  context: { hasNetwork: boolean; isWifi: boolean; localNetworkDenied?: boolean },
): ConnectionFailure {
  if (context.localNetworkDenied) {
    return "local_network_denied";
  }

  if (!context.hasNetwork) {
    return "offline";
  }

  if (!context.isWifi) {
    return "cellular_only";
  }

  if (error instanceof Error && error.name === "AbortError") {
    return "server_unreachable";
  }

  return "server_unreachable";
}
