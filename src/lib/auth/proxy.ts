// FILE: src/lib/auth/proxy.ts
//
// Route gating for proxy.ts. In cloud mode the session cookie is checked with
// verifySessionCookie and no revocation check: that is a signature check
// against Google's cached public keys, with no network call per request, and it
// only decides redirects. Pages still do the full check through getAppSession().
import { NextResponse, type NextRequest } from "next/server";
import { APP_MODE_COOKIE, parseAppMode } from "@/lib/app-mode";
import { decideRoute, needsSignInCheck } from "@/lib/auth/route-gate";
import { SESSION_COOKIE } from "@/lib/auth/session-cookie";
import { getAdminAuth, isFirebaseServerConfigured } from "@/lib/firebase/admin";
import { isFirebaseConfigured } from "@/lib/firebase/config";
import { readLocalProfileFromCookies } from "@/lib/local-profile";

export async function gateRequest(request: NextRequest, requestHeaders: Headers = request.headers) {
  const pathname = request.nextUrl.pathname;
  const gate = {
    pathname,
    mode: parseAppMode(request.cookies.get(APP_MODE_COOKIE)?.value),
    hasLocalProfile: readLocalProfileFromCookies(request.cookies) !== null,
    cloudConfigured: isFirebaseConfigured && isFirebaseServerConfigured(),
  };

  const signedIn = needsSignInCheck(gate)
    ? await hasValidSessionCookie(request.cookies.get(SESSION_COOKIE)?.value)
    : false;

  const decision = decideRoute({ ...gate, signedIn });

  if (decision.action === "next") {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = decision.pathname;
  if (decision.keepNext) {
    redirectUrl.searchParams.set("next", pathname);
  } else {
    redirectUrl.searchParams.delete("next");
  }
  return NextResponse.redirect(redirectUrl);
}

async function hasValidSessionCookie(value: string | undefined) {
  if (!value) {
    return false;
  }

  try {
    await getAdminAuth().verifySessionCookie(value);
    return true;
  } catch {
    return false;
  }
}
