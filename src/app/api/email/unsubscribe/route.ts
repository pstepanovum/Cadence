// FILE: src/app/api/email/unsubscribe/route.ts
//
// The unsubscribe link in reminder and newsletter email. POST is RFC 8058
// one-click (List-Unsubscribe-Post, sent by Gmail and Apple Mail); GET is the
// link in the footer and answers with a short page. The signed token names one
// list and one learner or address, and can only ever turn that list off.
import { BREVO_LISTS, removeFromList } from "@/lib/server/email/brevo";
import { verifyUnsubscribeToken } from "@/lib/server/email/unsubscribe";
import { auth, db } from "@/lib/server/firebase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unsubscribe(token: string | null): Promise<"reminders" | "newsletter" | null> {
  const claim = verifyUnsubscribeToken(token);
  if (!claim) return null;
  if (claim.list === "reminders") {
    await db().collection("users").doc(claim.subject).set({ emailPrefs: { reminders: false } }, { merge: true });
  } else {
    await removeFromList(claim.subject, BREVO_LISTS.newsletter);
    try {
      const user = await auth().getUserByEmail(claim.subject);
      await db().collection("users").doc(user.uid).set({ emailPrefs: { newsletter: false } }, { merge: true });
    } catch {
      // A subscriber without an account.
    }
  }
  return claim.list;
}

function page(title: string, body: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#E9ECEF;color:#212529}main{max-width:480px;margin:15vh auto;padding:32px;background:#fff;border-radius:20px}h1{font-size:24px;margin:0 0 12px}a{color:#386641}@media (prefers-color-scheme:dark){body{background:#16191C;color:#F8F9FA}main{background:#212529}a{color:#A7C957}}</style></head>
<body><main><h1>${title}</h1><p>${body}</p><p><a href="/">Back to Cadence</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const list = await unsubscribe(new URL(request.url).searchParams.get("token")).catch(() => null);
  if (!list) return page("Link not recognised", "This unsubscribe link isn't valid. You can change email settings on your account page.", 400);
  return list === "reminders"
    ? page("Reminders turned off", "You won't get practice reminders or weekly summaries any more. Account and billing email still arrives.")
    : page("Unsubscribed", "You won't get the Cadence newsletter any more.");
}

export async function POST(request: Request) {
  const list = await unsubscribe(new URL(request.url).searchParams.get("token")).catch(() => null);
  return new Response(null, { status: list ? 200 : 400 });
}
