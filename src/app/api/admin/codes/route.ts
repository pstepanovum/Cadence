// FILE: src/app/api/admin/codes/route.ts
//
// Friend codes for the owner's dashboard, `Authorization: Bearer <ADMIN_SECRET>`.
// The contract is in src/lib/server/codes/http.ts.
import { handled } from "@/lib/server/route";
import { handleAdminCodesGet, handleAdminCodesPatch, handleAdminCodesPost } from "@/lib/server/codes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Friend codes", () => handleAdminCodesGet(request));
}

export function POST(request: Request) {
  return handled("Create friend code", () => handleAdminCodesPost(request));
}

export function PATCH(request: Request) {
  return handled("Update friend code", () => handleAdminCodesPatch(request));
}
