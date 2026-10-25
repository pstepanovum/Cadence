// FILE: src/lib/server/admin-auth.ts
//
// The owner's endpoints under /api/admin (friend codes, support requests) are
// called only by the owner's dashboard at pstepanov.dev, server to server,
// with `Authorization: Bearer <ADMIN_SECRET>`. The dashboard keeps its copy as
// CADENCE_ADMIN_SECRET and adds its own sign-in and second factor in front.
// Unset, or shorter than 32 characters, means every call is refused.
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_SECRET_MIN_LENGTH = 32;

export function isAdminAuthorized(header: string | null, env: Record<string, string | undefined> = process.env): boolean {
  const secret = env.ADMIN_SECRET?.trim();
  if (!secret || secret.length < ADMIN_SECRET_MIN_LENGTH || !header) return false;
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) return false;
  return timingSafeEqual(createHash("sha256").update(match[1]).digest(), createHash("sha256").update(secret).digest());
}
