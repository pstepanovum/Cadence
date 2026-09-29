// FILE: mobile/src/api/transport.ts
//
// Where API calls go, and what they authenticate with.
//
// The API layer is plain functions, not hooks, so it cannot read React context.
// The connection provider publishes the current transport here and the client
// reads it. One writer, many readers, and the shape is small enough that the
// indirection stays obvious.
import { config } from "@/lib/config";

export type TransportMode = "local" | "cloud";

export interface Transport {
  mode: TransportMode;
  /** Absolute origin: the paired computer in local mode, the hosted API in cloud. */
  baseUrl: string;
  /** Present only in local mode. */
  deviceToken: string | null;
}

let active: Transport | null = null;

export function setTransport(next: Transport | null): void {
  active = next;
}

export function getTransport(): Transport | null {
  return active;
}

/** Thrown when a screen asks for data before any server is available. */
export class NoTransportError extends Error {
  constructor() {
    super("Cadence is not connected to a server yet.");
    this.name = "NoTransportError";
  }
}

export function requireTransport(): Transport {
  if (active) {
    return active;
  }

  // Cloud mode's origin is fixed at build time, so it can be reconstructed
  // without the provider having published anything — which keeps the existing
  // cloud flow working even before the connection provider has mounted.
  if (config.apiUrl) {
    return { mode: "cloud", baseUrl: config.apiUrl, deviceToken: null };
  }

  throw new NoTransportError();
}
