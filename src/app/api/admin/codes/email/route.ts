// FILE: src/app/api/admin/codes/email/route.ts
//
// Emails one friend code to one person, for the owner's dashboard,
// `Authorization: Bearer <ADMIN_SECRET>`. The contract is in src/lib/server/codes/http.ts.
import { handled } from "@/lib/server/route";
import { handleAdminCodeEmailPost } from "@/lib/server/codes/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Email friend code", () => handleAdminCodeEmailPost(request));
}
