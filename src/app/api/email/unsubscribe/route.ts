// FILE: src/app/api/email/unsubscribe/route.ts
//
// The unsubscribe link in reminder, lifecycle and newsletter email. POST is
// RFC 8058 one-click (List-Unsubscribe-Post, sent by Gmail and Apple Mail);
// GET is the link in the footer and answers with a page that only asks. The
// signed token names one list and one learner or address, and can only ever
// turn that list off. The logic is in src/lib/server/email/unsubscribe-handler.ts.
import { handleUnsubscribeGet, handleUnsubscribePost } from "@/lib/server/email/unsubscribe-handler";
import { firestoreUnsubscribeStore } from "@/lib/server/email/unsubscribe-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return handleUnsubscribeGet(request.url, { store: firestoreUnsubscribeStore() });
}

export function POST(request: Request) {
  return handleUnsubscribePost(request, { store: firestoreUnsubscribeStore() });
}
