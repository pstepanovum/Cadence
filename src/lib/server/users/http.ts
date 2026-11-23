// FILE: src/lib/server/users/http.ts
//
// The owner's list of Cadence accounts, for the dashboard at pstepanov.dev,
// `Authorization: Bearer <ADMIN_SECRET>` (the same check as /api/admin/codes):
//
//   GET /api/admin/users?q=&cursor=&limit=1..100&plan=all|free|paid
//     {users: [{id, email, name, createdAt, lastActiveAt, plan, planUntil, platform, alsoUses}], nextCursor, total}
//
// Newest sign-ups first, read live. plan is "free", "plus", "trial", "code" or
// "lifetime", from the same record every Plus gate reads. Cadence has its own
// Firebase project, so alsoUses is always empty.
import { isAdminAuthorized } from "../admin-auth";
import { json } from "../http";
import { parseUsersQuery } from "./logic";
import { listUsers } from "./store";

function error(status: number, code: string, description: string): Response {
  return json({ error: code, error_description: description, message: description }, status);
}

export async function handleAdminUsersGet(request: Request): Promise<Response> {
  if (!isAdminAuthorized(request.headers.get("authorization"))) return error(401, "unauthorized", "Not allowed.");
  const query = parseUsersQuery(new URL(request.url).searchParams);
  if (typeof query === "string") return error(400, "invalid_request", query);
  return json(await listUsers(query));
}
