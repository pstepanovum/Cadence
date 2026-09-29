// FILE: src/lib/pairing/admin.ts
//
// The guard on every surface that can hand out access: issuing a pairing code,
// listing paired devices, revoking one.
//
// Why a token and not "is this request from localhost": the server is bound to
// the LAN so a phone can reach it, which means anyone else on the Wi-Fi can
// load its pages too. Next.js route handlers are also not given the socket's
// peer address, so there is no honest way to check for loopback. The token is
// written into the server's data directory on first run, so holding it means
// having an account on the computer — which is exactly the boundary we want.
//
// It reaches the browser the way Jupyter's does: the serve script prints a URL
// with `?k=<token>`, the pairing page trades it for a short-lived httpOnly
// cookie, and the token never sits in the address bar afterwards.
import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PAIRING_ADMIN_COOKIE, PAIRING_ADMIN_HEADER } from "./request";
import { isPairingAdmin } from "./service";

const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8;

/** True when the caller proved it is the person sitting at this computer. */
export async function requirePairingAdmin(request: Request): Promise<boolean> {
  const headerToken = request.headers.get(PAIRING_ADMIN_HEADER);
  if (await isPairingAdmin(headerToken)) {
    return true;
  }

  const cookieToken = (await cookies()).get(PAIRING_ADMIN_COOKIE)?.value ?? null;
  return isPairingAdmin(cookieToken);
}

/** Same question for a server component, which has cookies but no Request. */
export async function hasPairingAdminCookie(): Promise<boolean> {
  const cookieToken = (await cookies()).get(PAIRING_ADMIN_COOKIE)?.value ?? null;
  return isPairingAdmin(cookieToken);
}

export function getAdminCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    // The pairing surface is plain HTTP on the LAN by design, so `secure`
    // would drop the cookie outright. See docs/PAIRING_PROTOCOL.md.
    secure: false,
    maxAge: ADMIN_COOKIE_MAX_AGE,
  };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    {
      error:
        "Open the pairing screen from the computer running Cadence. Run `pnpm serve` there for the link.",
      code: "unauthorized",
    },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
