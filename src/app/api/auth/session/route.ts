// FILE: src/app/api/auth/session/route.ts
//
// POST trades a fresh Firebase ID token for the httpOnly session cookie the
// server reads; DELETE clears it. Signing out of one browser leaves the
// person's other browsers and phones signed in.
import { NextResponse } from "next/server";
import { APP_MODE_COOKIE, getAppModeCookieOptions } from "@/lib/app-mode";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  getSessionCookieOptions,
  isRecentSignIn,
} from "@/lib/auth/session-cookie";
import { ensureUserRecord } from "@/lib/cloud/store";
import { CONVERSATION_PROGRESS_COOKIE } from "@/lib/conversation";
import { getAdminAuth, isCloudServerReady } from "@/lib/firebase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isCloudServerReady()) {
    return NextResponse.json(
      { error: "Cadence Cloud is not configured on this server." },
      { status: 503 },
    );
  }

  // The cookie is SameSite=Lax, but a cross-site form could still post an
  // attacker's own token here and sign the victim into the wrong account.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { idToken?: unknown } | null;
  const idToken = typeof body?.idToken === "string" ? body.idToken : null;

  if (!idToken) {
    return NextResponse.json({ error: "idToken is required." }, { status: 400 });
  }

  const auth = getAdminAuth();
  let decoded;
  try {
    decoded = await auth.verifyIdToken(idToken, true);
  } catch {
    return NextResponse.json({ error: "Your sign-in has expired. Sign in again." }, { status: 401 });
  }

  if (!isRecentSignIn(decoded.auth_time, Date.now())) {
    return NextResponse.json({ error: "Sign in again to continue." }, { status: 401 });
  }

  try {
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_SECONDS * 1000,
    });
    await ensureUserRecord(decoded.uid, decoded.email ?? null);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionCookie, getSessionCookieOptions());
    response.cookies.set(APP_MODE_COOKIE, "cloud", getAppModeCookieOptions());
    // Saved in the account from here on; whatever the browser kept belongs to
    // someone else's session.
    response.cookies.delete(CONVERSATION_PROGRESS_COOKIE);
    return response;
  } catch (error) {
    console.error("Could not create a session cookie:", error);
    return NextResponse.json(
      { error: "Could not start your session. Please try again." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  // Progress kept in the browser belongs to whoever was signed in; left behind,
  // it would be merged into the next account that signs in here.
  response.cookies.delete(CONVERSATION_PROGRESS_COOKIE);
  return response;
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
