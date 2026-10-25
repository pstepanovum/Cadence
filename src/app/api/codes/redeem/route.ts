// FILE: src/app/api/codes/redeem/route.ts
//
// Friend codes for the signed-in account, called only by the website's
// /redeem page: GET ?code= looks one up, POST {code} redeems it. The grant is
// users/{uid}.plusSources.code (src/lib/server/codes/store.ts).
import { handled } from "@/lib/server/route";
import { handleRedeemGet, handleRedeemPost } from "@/lib/server/codes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Friend code lookup", () => handleRedeemGet(request));
}

export function POST(request: Request) {
  return handled("Friend code redemption", () => handleRedeemPost(request));
}
