// FILE: src/lib/server/email/unsubscribe-handler.ts
//
// What /api/email/unsubscribe does, with the store passed in so the tests can
// run it against a fake one (src/app/api/email/unsubscribe/route.ts wires the
// Firestore and Brevo store from ./unsubscribe-store.ts).
//
//   GET    the footer link: a branded page that only asks. Mail scanners and
//          link previews follow links, and a GET that unsubscribed turned
//          people's email off without them. Its button posts back here.
//   POST   RFC 8058 one-click (List-Unsubscribe-Post, sent by Gmail and Apple
//          Mail): turns the list off and answers with a status only. From the
//          page's button (source=page) it answers with a page.
//
// A token names one list and one subject, so each kind of email has its own
// consent: leaving the tips leaves reminders and the newsletter as they were.
import { APP_ICON, escapeHtml, SITE_URL, tone } from "./layout";
import type { EmailList } from "./layout";
import { TEST_UNSUBSCRIBE_SUBJECT, UNSUBSCRIBE_PATH, verifyUnsubscribeToken } from "./unsubscribe";

type Env = Record<string, string | undefined>;

export interface UnsubscribeClaim {
  list: EmailList;
  subject: string;
}

export interface UnsubscribeStore {
  /** True when this subject already gets none of this list. */
  isUnsubscribed(claim: UnsubscribeClaim): Promise<boolean>;
  /** Turns the list off for the subject. Must be safe to call twice. */
  unsubscribe(claim: UnsubscribeClaim): Promise<void>;
}

export interface UnsubscribeDeps {
  store: UnsubscribeStore;
  env?: Env;
}

/** What each list is called on the page. */
export const LIST_LABELS: Record<EmailList, { name: string; detail: string }> = {
  reminders: { name: "practice reminders", detail: "Streak checks, weekly summaries, badges and nudges when you've been away." },
  lifecycle: { name: "getting-started tips", detail: "A few short emails in your first two weeks on how to get the most from Cadence." },
  newsletter: { name: "product news and offers", detail: "New lessons, what changed in Cadence, and the occasional offer." },
};

export function readClaim(token: string | null, env?: Env): UnsubscribeClaim | null {
  try {
    return verifyUnsubscribeToken(token, env);
  } catch {
    // No signing secret on this server: the link cannot be checked.
    return null;
  }
}

const isTest = (claim: UnsubscribeClaim) => claim.subject === TEST_UNSUBSCRIBE_SUBJECT;

// Page --------------------------------------------------------------------------

const L = tone.light;
const D = tone.dark;

export function unsubscribePage(input: { kicker: string; title: string; body: string; action?: { href: string; label: string } }, status = 200): Response {
  const form = input.action
    ? `<form method="post" action="${escapeHtml(input.action.href)}"><input type="hidden" name="source" value="page"><button type="submit">${escapeHtml(input.action.label)}</button></form>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${escapeHtml(input.title)} · Cadence</title>
<link href="https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;font-family:'Funnel Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:${L.page};color:${L.text};-webkit-font-smoothing:antialiased}
main{max-width:560px;margin:0 auto;padding:56px 20px}
.logo{display:block;width:36px;height:36px;border-radius:9px;margin:0 0 32px}
.kicker{margin:0 0 10px;font-size:15px;line-height:22px;font-weight:700;color:${L.accent}}
h1{margin:0 0 24px;font-size:40px;line-height:42px;font-weight:800;letter-spacing:-1.3px}
p{margin:0 0 16px;font-size:17px;line-height:27px}
.muted{color:${L.secondary};font-size:15px;line-height:23px}
button{display:block;width:100%;margin:8px 0 28px;padding:18px 24px;font:inherit;font-size:17px;font-weight:700;border:0;border-radius:12px;background:${L.button};color:${L.onButton};cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid ${L.accent};outline-offset:3px}
a{color:${L.accent};font-weight:700}
@media (min-width:520px){button{display:inline-block;width:auto}}
@media (prefers-color-scheme:dark){body{background:${D.page};color:${D.text}}.kicker,a{color:${D.accent}}.muted{color:${D.secondary}}}
</style></head>
<body><main><a href="${SITE_URL}/"><img class="logo" src="${APP_ICON.src}" width="36" height="36" alt="Cadence"></a><p class="kicker">${escapeHtml(input.kicker)}</p><h1>${escapeHtml(input.title)}</h1>
${input.body}${form}<p class="muted">Change any email choice on your <a href="${SITE_URL}/account">account page</a>, or go <a href="${SITE_URL}/">back to Cadence</a>.</p>
</main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

const invalidPage = () =>
  unsubscribePage(
    { kicker: "Email settings", title: "Link not recognised", body: `<p>This unsubscribe link isn't valid. It may have been cut short by your email app.</p>` },
    400,
  );

function donePage(claim: UnsubscribeClaim, already: boolean): Response {
  const label = LIST_LABELS[claim.list];
  return unsubscribePage({
    kicker: "Email settings",
    title: already ? "You're already unsubscribed" : "You're unsubscribed",
    body: `<p>${already ? "This address already gets no" : "You won't get any more"} ${escapeHtml(label.name)} from Cadence.</p><p class="muted">Other Cadence email isn't affected, and account, security and billing email still arrives.</p>`,
  });
}

// Handlers -------------------------------------------------------------------

export async function handleUnsubscribeGet(requestUrl: string, deps: UnsubscribeDeps): Promise<Response> {
  const token = new URL(requestUrl).searchParams.get("token");
  const claim = readClaim(token, deps.env);
  if (!claim) return invalidPage();
  if (!isTest(claim) && (await deps.store.isUnsubscribed(claim))) return donePage(claim, true);
  const label = LIST_LABELS[claim.list];
  return unsubscribePage({
    kicker: "Email settings",
    title: `Unsubscribe from ${label.name}?`,
    body: `<p>${escapeHtml(label.detail)}</p><p class="muted">Only this kind of email stops. Account, security and billing email still arrives.</p>`,
    action: { href: `${UNSUBSCRIBE_PATH}?token=${encodeURIComponent(token ?? "")}`, label: "Unsubscribe" },
  });
}

export async function handleUnsubscribePost(request: Request, deps: UnsubscribeDeps): Promise<Response> {
  const claim = readClaim(new URL(request.url).searchParams.get("token"), deps.env);
  const form = await request.formData().catch(() => null);
  const fromPage = form?.get("source") === "page";
  if (!claim) return fromPage ? invalidPage() : new Response(null, { status: 400 });

  let already = false;
  if (!isTest(claim)) {
    try {
      already = await deps.store.isUnsubscribed(claim);
      if (!already) await deps.store.unsubscribe(claim);
    } catch (error) {
      console.error("Unsubscribe failed:", error instanceof Error ? error.message : error);
      return fromPage
        ? unsubscribePage({ kicker: "Email settings", title: "That didn't go through", body: "<p>Something went wrong on our side. Try the link again in a minute.</p>" }, 503)
        : new Response(null, { status: 503 });
    }
  }
  return fromPage ? donePage(claim, already) : new Response(null, { status: 200 });
}
