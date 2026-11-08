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

function done(list: "reminders" | "newsletter") {
  return list === "reminders"
    ? page("Reminders turned off", "You won't get practice reminders or weekly summaries any more. Account and billing email still arrives.")
    : page("Unsubscribed", "You won't get the Cadence newsletter any more.");
}

const invalid = () => page("Link not recognised", "This unsubscribe link isn't valid. You can change email settings on your account page.", 400);

/**
 * GET only asks: mail scanners and link previews follow links, and a GET that
 * unsubscribed turned learners' email off without them. The button posts back
 * here; mail clients use RFC 8058 one-click POST directly.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  let claim: ReturnType<typeof verifyUnsubscribeToken> = null;
  try {
    claim = verifyUnsubscribeToken(token);
  } catch {
    // No signing secret on this server: the link cannot be checked.
  }
  if (!claim) return invalid();
  const what = claim.list === "reminders" ? "practice reminders and weekly summaries" : "the Cadence newsletter";
  const action = `/api/email/unsubscribe?token=${encodeURIComponent(token ?? "")}`;
  return page(
    "Unsubscribe?",
    `Stop sending ${what} to this address.</p><form method="post" action="${action.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><input type="hidden" name="source" value="page"><button type="submit" style="font:inherit;font-weight:600;padding:12px 20px;border:0;border-radius:14px;background:#386641;color:#fff;cursor:pointer">Unsubscribe</button></form><p>`,
  );
}

export async function POST(request: Request) {
  const list = await unsubscribe(new URL(request.url).searchParams.get("token")).catch(() => null);
  const form = await request.formData().catch(() => null);
  // The confirmation page's button: answer with a page. One-click: status only.
  if (form?.get("source") === "page") return list ? done(list) : invalid();
  return new Response(null, { status: list ? 200 : 400 });
}
