// FILE: src/app/api/pair/unlock/route.ts
//
// Trades the admin token in a `?k=` link for a short-lived httpOnly cookie and
// bounces to the clean /pair URL, so the token stops appearing in the address
// bar, in browser history, and in any screenshot of the pairing screen.
//
// A page cannot set cookies in the App Router, which is why this is a route
// handler rather than logic inside /pair.
import { NextResponse } from "next/server";

import { getAdminCookieOptions } from "@/lib/pairing/admin";
import { PAIRING_ADMIN_COOKIE } from "@/lib/pairing/request";
import { isPairingAdmin } from "@/lib/pairing/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A relative Location keeps the browser on the host it used. The standalone
// server builds request.url with "localhost", so an absolute redirect from it
// sent http://127.0.0.1 and LAN visitors to another host, where the cookie
// just set here is not sent.
function backToPair() {
  return new NextResponse(null, { status: 303, headers: { Location: "/pair" } });
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("k");

  if (!key || !(await isPairingAdmin(key))) {
    // Land on /pair without the cookie: the page explains how to get a link.
    return backToPair();
  }

  const response = backToPair();
  response.cookies.set(PAIRING_ADMIN_COOKIE, key, getAdminCookieOptions());
  return response;
}
