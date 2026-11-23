// FILE: src/lib/server/email/templates/codes.ts
//
// A friend code, sent by hand from the owner's dashboard to one person
// (POST /api/admin/codes/email, src/lib/server/codes/email.ts). Short and
// from Pavel himself: what the code gives, the code on its ticket, and one
// button to the website's /redeem page with the code filled in. Codes are
// redeemed on the website only, so the iPhone app is never mentioned.
//
// Transactional: it is a one-to-one message, not a list, so it carries the
// normal footer and no unsubscribe link.
import { describeGrantDuration } from "../../codes/logic";
import { SITE_LABEL, SITE_URL, button, cleanText, codeBlock, compose, escapeHtml, firstName, formatDate, linkFallback, paragraph, type RenderedEmail } from "../layout";

export interface CodeGiftProps {
  /** The code as stored, e.g. CADENCE-7KQ2-XH9D. */
  code: string;
  /** How long the Plus it gives lasts, in whole days. */
  durationDays: number;
  /** The last moment the code can be redeemed; null when it never stops working. */
  expiresAt: number | null;
  /** Only for the greeting. */
  name?: string;
}

const PLUS_IN_A_LINE = "cloud scoring, voices, the coach and sync on every device";

/** "7 days", "3 months", "12 months": the dashboard's own presets, then describeGrantDuration. */
export function giftDuration(days: number): string {
  if (days === 365) return "12 months";
  return describeGrantDuration(days);
}

/** The website's /redeem page with the code filled in. */
export function redeemUrl(code: string, origin = SITE_URL): string {
  return `${origin}/redeem?code=${encodeURIComponent(code)}`;
}

export function renderCodeGift(props: CodeGiftProps): RenderedEmail {
  const code = cleanText(props.code, 40);
  const gives = `${giftDuration(props.durationDays)} of Cadence Plus`;
  const name = firstName(props.name);
  const by = props.expiresAt === null ? "" : formatDate(props.expiresAt);
  const url = redeemUrl(code);

  const greeting = name ? `Hi ${name},` : "Hi,";
  const lead = `Here's ${gives} from me: ${PLUS_IN_A_LINE}. No card, and it ends by itself.`;
  const how = by
    ? `Redeem it on ${SITE_LABEL} by ${by}. Sign in or make a free account, and Plus turns on right away.`
    : `Redeem it on ${SITE_LABEL}. Sign in or make a free account, and Plus turns on right away.`;

  return compose({
    subject: `A gift: ${gives}`,
    preheader: by ? `Use ${code} by ${by}.` : `Use ${code} on ${SITE_LABEL}.`,
    kicker: "",
    title: `Pavel sent you ${gives}`,
    body: [
      paragraph(escapeHtml(greeting), { spaceAfter: 12 }),
      paragraph(escapeHtml(lead), { spaceAfter: 20 }),
      codeBlock(code, gives),
      paragraph(escapeHtml(how), { spaceAfter: 20 }),
      button("Redeem", url, { spaceAfter: 20 }),
      linkFallback(url),
      paragraph("Enjoy,<br>Pavel", { spaceBefore: 24, spaceAfter: 0 }),
    ],
    text: [greeting, lead, `Your code: ${code}`, how, `Redeem: ${url}`, "Enjoy,\nPavel"],
    footer: { category: "transactional", reason: "Pavel sent you this code from Cadence. Reply to this email with any questions." },
  });
}
