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

/**
 * The paired Cadence server, when it is connected, published separately so a
 * phone signed in to the cloud can still run AI on its own server at home
 * (docs/PLATFORM.md, section 6: the AI transport and the account transport).
 */
let localAi: Transport | null = null;

export function setLocalAiTransport(next: Transport | null): void {
  localAi = next;
}

export function getLocalAiTransport(): Transport | null {
  return localAi;
}

/**
 * Where an AI request (scoring, speech, transcription, the coach) goes: the
 * paired server when it is connected, otherwise the account transport. The
 * engine router decides beforehand whether the cloud may be used at all, and
 * the server checks again.
 */
export function requireAiTransport(): Transport {
  return localAi ?? requireTransport();
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

/**
 * Called when a paired server refuses this phone's token during normal use
 * (the computer unpaired it, or the pairing aged out). The connection provider
 * listens and re-checks the pairing, which clears it when it is really gone;
 * otherwise every call would keep failing until the next foreground sweep.
 */
let pairingRefused: (() => void) | null = null;

export function onPairingRefused(listener: (() => void) | null): void {
  pairingRefused = listener;
}

export function notePairingRefused(): void {
  pairingRefused?.();
}
