// FILE: src/app/api/admin/support/route.ts
//
// Support requests for the owner's dashboard (pstepanov.dev), with
// `Authorization: Bearer <ADMIN_SECRET>`:
//
//   GET   ?status=open|answered|closed   newest first
//   PATCH {id, status}
//   POST  {id, message, by?}             emails the answer and marks it answered
import { after } from "next/server";

import { deliverSoon } from "@/lib/server/email/queue";
import { handled } from "@/lib/server/route";
import { handleAdminSupportGet, handleAdminSupportPatch, handleAdminSupportReply } from "@/lib/server/support-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handled("Support list", () => handleAdminSupportGet(request));
}

export function PATCH(request: Request) {
  return handled("Support status", () => handleAdminSupportPatch(request));
}

export function POST(request: Request) {
  return handled("Support reply", () => handleAdminSupportReply(request, { deliver: (keys) => after(() => deliverSoon(keys)) }));
}
