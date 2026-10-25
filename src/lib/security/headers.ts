// FILE: src/lib/security/headers.ts
//
// The web security headers (docs/PLATFORM.md section 14). The fixed ones are
// set for every path in next.config.ts; the Content-Security-Policy carries a
// per-request script nonce, so src/proxy.ts sets it on every page response.
// Pure: no Next.js imports, so tests/web/security-headers.test.ts runs it.

export const STATIC_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

/** Google endpoints the browser SDKs call: Auth, App Check and reCAPTCHA Enterprise. */
const FIREBASE_CONNECT = [
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebaseappcheck.googleapis.com",
  "https://content-firebaseappcheck.googleapis.com",
  "https://firebaseinstallations.googleapis.com",
  "https://www.google.com/recaptcha/",
  "https://recaptcha.google.com/recaptcha/",
];

const RECAPTCHA_SCRIPTS = ["https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"];
const RECAPTCHA_FRAMES = ["https://www.google.com/recaptcha/", "https://recaptcha.google.com/recaptcha/"];

export type CspOptions = {
  /** Development: React needs eval and the dev server a websocket. */
  development?: boolean;
  /** host:port of the Auth emulator, allowed only when set (e2e and local runs). */
  authEmulatorHost?: string;
  /** The Firebase authDomain, whose iframe the Auth SDK may open. */
  authDomain?: string;
};

/** A fresh nonce: 16 random bytes, base64. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function buildCsp(nonce: string, options: CspOptions = {}): string {
  const connect = ["'self'", ...FIREBASE_CONNECT];
  const frames = [...RECAPTCHA_FRAMES];
  if (options.authEmulatorHost && /^[A-Za-z0-9.\-[\]:]+$/.test(options.authEmulatorHost)) {
    connect.push(`http://${options.authEmulatorHost}`);
    // Google and Apple sign-in open the emulator's own page in an iframe.
    frames.push(`http://${options.authEmulatorHost}`);
  }
  if (options.development) connect.push("ws:", "wss:");
  if (options.authDomain && /^[A-Za-z0-9.-]+$/.test(options.authDomain)) frames.push(`https://${options.authDomain}`);
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...RECAPTCHA_SCRIPTS];
  if (options.development) script.push("'unsafe-eval'");

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": script,
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://cdn.brandfetch.io"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", "data:"],
    "connect-src": connect,
    "frame-src": frames,
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
