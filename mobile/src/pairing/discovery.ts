// FILE: mobile/src/pairing/discovery.ts
//
// Finding the computer again, and knowing when we have lost it.
//
// After the first pairing the phone should not have to be told the address
// again. Three things make that work, in order:
//
//   1. the address that worked last time
//   2. the computer's Bonjour name, e.g. "pavels-macbook-pro.local"
//   3. the IP that was in the QR
//
// (2) is the one that survives the laptop getting a new DHCP lease, and it
// costs no mDNS library: macOS and most Linux desktops already publish a
// `.local` record for themselves, and iOS resolves it natively once the person
// has allowed local network access. That is also why the Bonjour and local
// network keys have to be in Info.plist even though we browse no services.
//
// Everything in this file is pure: no fetch, no timers, no React. The runtime
// lives in context.tsx and calls into here.
import type { ConnectionFailure } from "@/pairing/errors";
import { buildBaseUrl, type ServerInfo } from "@/pairing/protocol";

export interface StoredConnection {
  /** Identity of the computer we paired with. Checked on every reconnect. */
  serverId: string;
  serverName: string;
  /** The LAN IP from the QR. */
  host: string;
  port: number;
  /** The `.local` name, when the computer had one. */
  mdnsHost: string | null;
  scheme: "http" | "https";
  /** The last address that actually answered. Tried first next time. */
  lastGoodBaseUrl: string | null;
}

export type ConnectionState =
  | { status: "unpaired" }
  /** Working through the candidate addresses. */
  | { status: "connecting"; attempt: number; candidate: string | null }
  | {
      status: "connected";
      baseUrl: string;
      serverName: string;
      /** False while the Python engines are still loading their models. */
      enginesReady: boolean;
    }
  | { status: "offline"; failure: ConnectionFailure; retryInMs: number | null };

export interface NetworkContext {
  hasNetwork: boolean;
  isWifi: boolean;
}

export type DiscoveryEvent =
  | { type: "paired"; connection: StoredConnection }
  | { type: "connect_requested" }
  | { type: "probing"; candidate: string }
  | { type: "probe_succeeded"; baseUrl: string; info: ServerInfo }
  | { type: "probe_failed"; failure: ConnectionFailure }
  | { type: "network_changed"; network: NetworkContext }
  | { type: "unpaired" };

/**
 * Where to look, best first. Duplicates are dropped so a computer whose
 * `.local` name resolves to the same address it had at pairing time is not
 * probed twice.
 */
export function buildCandidates(connection: StoredConnection): string[] {
  const candidates: string[] = [];

  if (connection.lastGoodBaseUrl) {
    candidates.push(connection.lastGoodBaseUrl);
  }

  if (connection.mdnsHost) {
    candidates.push(
      buildBaseUrl({
        scheme: connection.scheme,
        host: connection.mdnsHost,
        port: connection.port,
      }),
    );
  }

  candidates.push(
    buildBaseUrl({ scheme: connection.scheme, host: connection.host, port: connection.port }),
  );

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

/**
 * Is the thing that answered the computer we paired with?
 *
 * Without TLS there is no certificate to pin, so identity is the random
 * serverId the computer generated once and printed in the QR. An impostor on
 * the same Wi-Fi that happened to take over the IP will not have it, and the
 * phone refuses to send its device token to anything that reports a different
 * one. See docs/PAIRING_PROTOCOL.md for what this does and does not protect.
 */
export function isExpectedServer(connection: StoredConnection, info: ServerInfo): boolean {
  return info.serverId === connection.serverId;
}

/**
 * Backoff between reconnect sweeps: quick at first, because the usual cause is
 * a laptop that just woke up, then slowing to once a minute so a phone left on
 * a different network is not burning battery.
 */
export function retryDelayMs(attempt: number): number {
  const schedule = [1_000, 2_000, 5_000, 10_000, 30_000];
  return schedule[Math.min(attempt, schedule.length - 1)] ?? 60_000;
}

/**
 * How many times to sweep the whole candidate list before telling the person
 * the computer is not there. One sweep is not enough — a laptop waking from
 * sleep takes a beat — but four is past the point of a spinner being honest.
 */
export const MAX_SILENT_ATTEMPTS = 3;

export function reduce(state: ConnectionState, event: DiscoveryEvent): ConnectionState {
  switch (event.type) {
    case "paired":
      return {
        status: "connected",
        baseUrl:
          event.connection.lastGoodBaseUrl ??
          buildBaseUrl({
            scheme: event.connection.scheme,
            host: event.connection.host,
            port: event.connection.port,
          }),
        serverName: event.connection.serverName,
        enginesReady: false,
      };

    case "unpaired":
      return { status: "unpaired" };

    case "connect_requested":
      if (state.status === "unpaired") {
        return state;
      }
      return { status: "connecting", attempt: 0, candidate: null };

    case "probing":
      return {
        status: "connecting",
        attempt: state.status === "connecting" ? state.attempt : 0,
        candidate: event.candidate,
      };

    case "probe_succeeded":
      return {
        status: "connected",
        baseUrl: event.baseUrl,
        serverName: event.info.serverName,
        enginesReady: event.info.enginesReady,
      };

    case "probe_failed": {
      // A revoked or expired token is final: retrying cannot fix it, and a
      // countdown would just be a lie.
      if (event.failure === "device_revoked" || event.failure === "token_expired") {
        return { status: "offline", failure: event.failure, retryInMs: null };
      }

      if (event.failure === "server_too_new" || event.failure === "wrong_server") {
        return { status: "offline", failure: event.failure, retryInMs: null };
      }

      const attempt = state.status === "connecting" ? state.attempt + 1 : 1;

      if (attempt < MAX_SILENT_ATTEMPTS) {
        return { status: "connecting", attempt, candidate: null };
      }

      return {
        status: "offline",
        failure: event.failure,
        retryInMs: retryDelayMs(attempt),
      };
    }

    case "network_changed": {
      if (state.status === "unpaired") {
        return state;
      }

      if (!event.network.hasNetwork) {
        return { status: "offline", failure: "offline", retryInMs: null };
      }

      if (!event.network.isWifi) {
        return { status: "offline", failure: "cellular_only", retryInMs: null };
      }

      // Back on Wi-Fi, possibly a different one: start a fresh sweep rather
      // than trusting the address that worked on the old network.
      return { status: "connecting", attempt: 0, candidate: null };
    }

    default:
      return state;
  }
}

/** Record the address that worked so the next launch tries it first. */
export function rememberGoodAddress(
  connection: StoredConnection,
  baseUrl: string,
): StoredConnection {
  if (connection.lastGoodBaseUrl === baseUrl) {
    return connection;
  }
  return { ...connection, lastGoodBaseUrl: baseUrl };
}
