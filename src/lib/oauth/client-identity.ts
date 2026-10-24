// FILE: src/lib/oauth/client-identity.ts
//
// The impersonation guard for dynamically registered clients, shared with
// the owner's other apps' authorization servers.
/**
 * Guards the one piece of the consent screen an attacker controls: the client
 * name.
 *
 * Dynamic registration is open, so anyone can register a client named after a
 * well-known product whose redirect URI is their own server, then send a person
 * a link to approve it. The consent screen would name that product, one click would
 * hand them a token for the learner's progress, and PKCE does not help because
 * the attacker starts the flow and holds the verifier.
 *
 * A client that names a known product must therefore send its codes to that
 * product's own domain. A client with an unrecognised name is still allowed,
 * and the consent screen shows where its code will go so the person can judge.
 */

import { isLoopbackHostname } from "./config";

type KnownProduct = {
  label: string;
  /** Normalised tokens that, if present in a client name, claim this product. */
  tokens: string[];
  /** Hostnames allowed to receive codes, matched exactly or as a subdomain. */
  hosts: string[];
  /** Private-use URI schemes the product's native app registers. */
  schemes?: string[];
};

const KNOWN_PRODUCTS: KnownProduct[] = [
  { label: "Claude", tokens: ["claude", "anthropic"], hosts: ["claude.ai", "claude.com", "anthropic.com"] },
  { label: "ChatGPT", tokens: ["chatgpt", "openai"], hosts: ["chatgpt.com", "openai.com"] },
  { label: "Muse", tokens: ["muse", "metaai"], hosts: ["meta.ai"] },
  { label: "Cursor", tokens: ["cursor"], hosts: ["cursor.com", "cursor.sh"], schemes: ["cursor"] },
  {
    label: "Visual Studio Code",
    tokens: ["vscode", "visualstudiocode"],
    hosts: ["vscode.dev"],
    schemes: ["vscode", "vscode-insiders"],
  },
  // The owner's own MCP bundle, which registers as "Pavel Stepanov Apps" and
  // redirects to https://pstepanov.dev/api/admin/custom-mcp/oauth/callback.
  { label: "pstepanov.dev", tokens: ["pstepanov", "pavelstepanov"], hosts: ["pstepanov.dev"] },
];

/**
 * Characters that change how text renders without being visible: bidi
 * overrides and isolates can reverse a name on screen, and
 * zero-width characters split a name so it no longer matches a token.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

const BIDI_CONTROL = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

/** Latin lookalikes from Cyrillic and Greek, so "Сlaude" with a Cyrillic С still matches. */
const CONFUSABLES: Record<string, string> = {
  "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "һ": "h", "ӏ": "l",
  "α": "a", "ε": "e", "ο": "o", "ρ": "p", "ν": "v", "τ": "t", "ι": "i", "κ": "k", "χ": "x", "μ": "u",
};

/** Cleans a client name for storage and display. */
export function sanitizeClientName(raw: string, fallback = "MCP Client") {
  const cleaned = raw.normalize("NFKC").replace(INVISIBLE, "").replace(/\s+/g, " ").trim().slice(0, 80);
  return cleaned || fallback;
}

/** Folds a name to lowercase ASCII letters and digits for product matching. */
function fold(name: string) {
  return [...name.normalize("NFKC").replace(INVISIBLE, "").toLowerCase()]
    .map((char) => CONFUSABLES[char] ?? char)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function hostMatches(hostname: string, allowed: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === allowed || host.endsWith(`.${allowed}`);
}

/**
 * Returns an explanation when a client claims to be a known product but would
 * send its authorization code somewhere that product does not own, or null
 * when the pairing is acceptable.
 *
 * Loopback redirects are always acceptable: a code sent to localhost lands on
 * the person's own machine, never on a server an attacker controls.
 */
export function findImpersonation(clientName: string, redirectUri: string): string | null {
  const folded = fold(clientName);
  // A right-to-left override renders a name backwards. The override is
  // stripped before a name is stored or shown, but a name that carried one was
  // built to be read backwards, so it is matched both ways round.
  const readings = BIDI_CONTROL.test(clientName) ? [folded, [...folded].reverse().join("")] : [folded];
  const product = KNOWN_PRODUCTS.find((candidate) =>
    candidate.tokens.some((token) => readings.some((reading) => reading.includes(token))),
  );

  if (!product) {
    return null;
  }

  let parsed: URL;

  try {
    parsed = new URL(redirectUri);
  } catch {
    return `This client calls itself ${product.label} but its redirect URI is not a valid URL.`;
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    if (isLoopbackHostname(parsed.hostname)) {
      return null;
    }

    if (parsed.protocol === "https:" && product.hosts.some((allowed) => hostMatches(parsed.hostname, allowed))) {
      return null;
    }

    return `This client calls itself ${product.label}, but it would send the authorization code to ${parsed.hostname}, which ${product.label} does not use. It may be impersonating ${product.label}.`;
  }

  const scheme = parsed.protocol.replace(/:$/, "");

  if (product.schemes?.includes(scheme)) {
    return null;
  }

  return `This client calls itself ${product.label}, but it would send the authorization code to a "${scheme}:" address that ${product.label} does not use. It may be impersonating ${product.label}.`;
}

/** The part of a redirect URI the person should look at before approving. */
export function describeRedirectTarget(redirectUri: string) {
  try {
    const parsed = new URL(redirectUri);

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return { destination: parsed.hostname, loopback: isLoopbackHostname(parsed.hostname) };
    }

    return { destination: `${parsed.protocol}//`, loopback: false };
  } catch {
    return { destination: redirectUri, loopback: false };
  }
}
