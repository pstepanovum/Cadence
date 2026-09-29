// FILE: mobile/src/pairing/address.ts
//
// Parsing an address a person typed. Kept out of the screen so it can be
// tested, because the ways people write down "192.168.1.42:3000" are many.

export interface ParsedAddress {
  host: string;
  port: number;
}

/** Matches the port the server prints when nothing else is configured. */
export const DEFAULT_SERVER_PORT = 3000;

/**
 * Accepts what people actually type: with or without a scheme, with or without
 * a port, with a trailing slash, with stray whitespace. Returns null when there
 * is nothing dialable in there.
 */
export function parseAddress(raw: string): ParsedAddress | null {
  const trimmed = raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");

  if (!trimmed) {
    return null;
  }

  // An IPv6 literal has to be bracketed to be told apart from its own colons.
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(trimmed);
  if (bracketed) {
    const port = bracketed[2] ? Number(bracketed[2]) : DEFAULT_SERVER_PORT;
    return isValidPort(port) ? { host: bracketed[1], port } : null;
  }

  const parts = trimmed.split(":");

  if (parts.length > 2) {
    return null;
  }

  const host = parts[0];

  if (!host || /[\s/?#]/.test(host)) {
    return null;
  }

  if (parts.length === 1) {
    return { host, port: DEFAULT_SERVER_PORT };
  }

  const port = Number(parts[1]);
  return isValidPort(port) ? { host, port } : null;
}

function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}
