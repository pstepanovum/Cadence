// FILE: src/proxy.ts
//
// Next.js only picks this file up next to the app directory, which is src/.
// Every page response gets a Content-Security-Policy with a fresh script
// nonce; Next.js reads the nonce from the request's CSP header and puts it on
// its own scripts. The fixed security headers come from next.config.ts.
import { type NextRequest } from "next/server";
import { gateRequest } from "@/lib/auth/proxy";
import { buildCsp, createNonce } from "@/lib/security/headers";

export async function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildCsp(nonce, {
    development: process.env.NODE_ENV === "development",
    authEmulatorHost: process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  });
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);
  const response = await gateRequest(request, headers);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
