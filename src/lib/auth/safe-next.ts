// FILE: src/lib/auth/safe-next.ts
//
// A `?next=` path is only followed when it stays on this site. Checking for a
// leading "/" is not enough: "//evil.com" and "/\evil.com" both start with one,
// and the URL parser reads the second as the first.

const BASE = "http://cadence.invalid";

/** The same-origin path, query and hash of `next`, or null when it would leave the site. */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/")) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }

  return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : null;
}
