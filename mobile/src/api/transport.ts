// FILE: mobile/src/api/transport.ts
//
// Where API calls go, and what they authenticate with.
//
// The API layer is plain functions, not hooks, so it cannot read React context.
// The connection provider publishes the current transport here and the client
// reads it. One writer, many readers, and the shape is small enough that the
// indirection stays obvious.
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

/** Thrown when a screen asks for data before any server is available. */
export class NoTransportError extends Error {
  constructor() {
    super("Cadence is not connected to a server yet.");
    this.name = "NoTransportError";
  }
}

export function requireTransport(): Transport {
  // No guessing: the provider publishes the cloud transport itself. Falling
  // back to the hosted API here sent local-mode calls to the cloud, with a
  // leftover sign-in, whenever the paired computer was asleep.
  if (!active) {
    throw new NoTransportError();
  }
  return active;
}
