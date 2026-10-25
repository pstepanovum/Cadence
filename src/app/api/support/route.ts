// FILE: src/app/api/support/route.ts
//
// POST {email, topic, message, name?, platform?}: the contact form. Kept in
// supportRequests and mailed to the support inbox with the writer as reply-to
// (src/lib/server/support-http.ts).
import { after } from "next/server";

import { deliverSoon } from "@/lib/server/email/queue";
import { handled } from "@/lib/server/route";
import { handleSupportPost } from "@/lib/server/support-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  return handled("Support request", () => handleSupportPost(request, { deliver: (keys) => after(() => deliverSoon(keys)) }));
}
