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

/**
 * Products every deployment guards. Further products (the assistants the
 * owner connects) come from OAUTH_KNOWN_CLIENTS, a JSON array of the same
 * shape, so the list can grow without a code change:
 *   [{"label":"Example","tokens":["example"],"hosts":["example.com"],"schemes":["example"]}]
 */
const BUILT_IN_PRODUCTS: KnownProduct[] = [
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

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

/** Parses OAUTH_KNOWN_CLIENTS. Invalid entries are dropped with a log line, never half-applied. */
export function parseKnownProducts(raw: string | undefined): KnownProduct[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error("OAUTH_KNOWN_CLIENTS is not valid JSON; ignoring it.");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const products: KnownProduct[] = [];
  for (const entry of parsed) {
    const candidate = entry as Partial<KnownProduct> | null;
    if (
      candidate &&
      typeof candidate.label === "string" &&
      isStringList(candidate.tokens) &&
      isStringList(candidate.hosts) &&
      (candidate.schemes === undefined || isStringList(candidate.schemes))
    ) {
      products.push({
        label: candidate.label,
        tokens: candidate.tokens.map((token) => fold(token)).filter(Boolean),
        hosts: candidate.hosts.map((host) => host.toLowerCase()),
        schemes: candidate.schemes,
      });
    } else {
      console.error("OAUTH_KNOWN_CLIENTS has an entry without label, tokens and hosts; skipping it.");
    }
  }
  return products;
}

let cachedProducts: { raw: string | undefined; products: KnownProduct[] } | null = null;

function knownProducts(): KnownProduct[] {
  const raw = process.env.OAUTH_KNOWN_CLIENTS;
  if (!cachedProducts || cachedProducts.raw !== raw) {
    cachedProducts = { raw, products: [...BUILT_IN_PRODUCTS, ...parseKnownProducts(raw)] };
  }
  return cachedProducts.products;
}

/**
 * Characters that change how text renders without being visible: bidi
 * overrides and isolates can reverse a name on screen, and
 * zero-width characters split a name so it no longer matches a token.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

const BIDI_CONTROL = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/;

/** Latin lookalikes from Cyrillic and Greek, so "Еxample" with a Cyrillic Е still matches. */
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
  const product = knownProducts().find((candidate) =>
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
