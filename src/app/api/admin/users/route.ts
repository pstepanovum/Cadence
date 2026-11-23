// FILE: src/app/api/admin/users/route.ts
//
// Cadence accounts for the owner's dashboard, `Authorization: Bearer <ADMIN_SECRET>`.
// The contract is in src/lib/server/users/http.ts.
import { handled } from "@/lib/server/route";
import { handleAdminUsersGet } from "@/lib/server/users/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Accounts", () => handleAdminUsersGet(request));
}
