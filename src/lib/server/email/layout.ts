// FILE: src/lib/server/email/layout.ts
//
// The frame every Cadence email is drawn in, and the small pieces templates
// build their bodies from.
//
// Email clients are old browsers with odd rules, so the markup is tables with
// inline styles, at most 560 pixels wide, every colour set inline for light
// mode. Two things live in <head>: one stylesheet link for Funnel Display
// (clients that block it fall back to the system stack below) and one small
// <style> block with the dark palette under prefers-color-scheme plus the
// phone padding. Apple Mail, iOS Mail and Outlook for Mac honour it; Gmail
// ignores it and darkens on its own, which the light palette survives because
// nothing depends on a background image. Outlook for Windows gets a fixed
// 560 px ghost table.
//
// Everything here is pure: templates take typed props and return strings, so
// the server, the preview script and the tests render exactly the same thing.

export type EmailCategory = "transactional" | "marketing" | "reminder";

/** The lists a reader can leave. Account and billing mail is not on one. */
export type EmailList = "reminders" | "newsletter";

export interface RenderedEmail {
  subject: string;
  /** The line an inbox shows after the subject. Hidden in the message itself. */
  preheader: string;
  html: string;
  text: string;
  category: EmailCategory;
}

export const SITE_URL = "https://cadence.pstepanov.dev";
export const SITE_LABEL = "cadence.pstepanov.dev";
export const EMAIL_ASSET_ORIGIN = `${SITE_URL}/email/`;

/** Production addresses as the footer names them. Where mail really leaves from is in senders.ts. */
export const FOOTER_ADDRESSES = {
  from: "hello@cadence.pstepanov.dev",
  support: "support@cadence.pstepanov.dev",
} as const;

/**
 * Brevo's double opt-in placeholder. It is the one href that is not a URL when
 * rendered, because Brevo swaps in the confirmation link at send time.
 */
export const BREVO_DOI_PLACEHOLDER = "{{ doubleoptin }}";

/**
 * Cadence's palette (src/app/globals.css) for mail, with one accent: hunter
 * green in light mode, yellow-green in dark. Button text is white on hunter
 * (6.9:1) and near-black on yellow-green (10:1).
 */
export const tone = {
  light: {
    page: "#F2E8CF",
    card: "#FFFFFF",
    panel: "#F8F9FA",
    rule: "#E9ECEF",
    text: "#212529",
    secondary: "#495057",
    tertiary: "#5C656D",
    accent: "#386641",
    onAccent: "#FFFFFF",
  },
  dark: {
    page: "#121813",
    card: "#1B221C",
    panel: "#252E27",
    rule: "#313B33",
    text: "#EEF2EF",
    secondary: "#C4CCC5",
    tertiary: "#A4AEA6",
    accent: "#A7C957",
    onAccent: "#121813",
  },
} as const;

export const FONT_STACK = "'Funnel Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;600;700&display=swap";

const L = tone.light;
const D = tone.dark;

// Strings ---------------------------------------------------------------------

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
}

const INVISIBLE_RANGES: [number, number][] = [[0x00, 0x1f], [0x7f, 0x9f], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]];
const INVISIBLE = new RegExp(`[${INVISIBLE_RANGES.map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`).join("")}]`, "g");

/** A prop made fit to show: invisible characters removed, whitespace collapsed, cut to `max`. */
export function cleanText(value: unknown, max = 300): string {
  if (typeof value !== "string") return "";
  let text = value.replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
  if (text.length > max) {
    text = text.slice(0, max - 1);
    if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
    text = `${text.trimEnd()}…`;
  }
  return text;
}

export function firstName(name: unknown): string {
  const clean = cleanText(name, 80);
  if (!clean || clean.toLowerCase() === "learner") return "";
  return cleanText(clean.split(" ")[0], 40);
}

/** https only (http on localhost for previews), no credentials; anything else becomes the fallback. */
export function safeUrl(value: unknown, fallback = SITE_URL): string {
  if (value === BREVO_DOI_PLACEHOLDER) return BREVO_DOI_PLACEHOLDER;
  if (typeof value !== "string" || value.length > 2000) return fallback;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if ((url.protocol !== "https:" && !local) || url.username || url.password) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function plural(value: number, one: string, many = `${one}s`): string {
  return `${value} ${value === 1 ? one : many}`;
}

/** "24 October 2026", in UTC so a render does not depend on the server's zone. */
export function formatDate(epochMs: unknown): string {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(epochMs));
}

export function formatDateTime(epochMs: unknown): string {
  if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return "";
  const date = new Date(epochMs);
  const day = formatDate(epochMs);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }).format(date);
  return `${day}, ${time} UTC`;
}

/** "$14.99" from minor units and an ISO currency code. */
export function formatMoney(minor: unknown, currency: unknown): string {
  const amount = typeof minor === "number" && Number.isFinite(minor) ? minor : 0;
  const code = typeof currency === "string" && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(amount / 100);
}

/** An app link on the site, e.g. appUrl("/account"). */
export function appUrl(path: `/${string}`, origin = SITE_URL): string {
  return `${origin}${path}`;
}

// Pieces ----------------------------------------------------------------------

export function heading(text: string): string {
  return `<h1 class="c-text c-h1" style="margin:0 0 16px;font-family:${FONT_STACK};font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.4px;color:${L.text};">${escapeHtml(text)}</h1>`;
}

export function subheading(text: string): string {
  return `<h2 class="c-text" style="margin:0 0 8px;font-family:${FONT_STACK};font-size:17px;line-height:24px;font-weight:600;color:${L.text};">${escapeHtml(text)}</h2>`;
}

/** A paragraph. `html` is trusted markup built from escaped strings. */
export function paragraph(html: string, options: { muted?: boolean; small?: boolean; spaceBefore?: number; spaceAfter?: number } = {}): string {
  const color = options.muted ? L.secondary : L.text;
  const className = options.muted ? "c-muted" : "c-text";
  const size = options.small ? "14px;line-height:22px" : "16px;line-height:26px";
  return `<p class="${className}" style="margin:${options.spaceBefore ?? 0}px 0 ${options.spaceAfter ?? 16}px;font-family:${FONT_STACK};font-size:${size};color:${color};">${html}</p>`;
}

export function strong(text: string): string {
  return `<strong style="font-weight:600;">${escapeHtml(text)}</strong>`;
}

/** The one call to action: a filled table cell, so it shows even with CSS stripped. */
export function button(label: string, href: string): string {
  const url = escapeHtml(safeUrl(href));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 8px;">
<tr><td class="c-btn" bgcolor="${L.accent}" style="background-color:${L.accent};border-radius:14px;mso-padding-alt:14px 26px;">
<a class="c-btn-text" href="${url}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:${FONT_STACK};font-size:16px;line-height:20px;font-weight:600;color:${L.onAccent};text-decoration:none;border-radius:14px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

/** A soft block inside the card. `html` is trusted markup. */
export function panel(html: string, options: { spaceAfter?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 ${options.spaceAfter ?? 24}px;">
<tr><td class="c-panel" bgcolor="${L.panel}" style="background-color:${L.panel};border-radius:14px;padding:18px 20px;">${html}</td></tr></table>`;
}

/** Label and value rows in a panel: plan, amount, date. Values are plain text. */
export function detailRows(rows: [string, string][]): string {
  const cells = rows
    .filter(([, value]) => value)
    .map(
      ([label, value], index, all) => `<tr>
<td class="c-muted" valign="top" style="padding:0 12px ${index === all.length - 1 ? 0 : 10}px 0;font-family:${FONT_STACK};font-size:14px;line-height:22px;color:${L.secondary};">${escapeHtml(label)}</td>
<td class="c-text" valign="top" align="right" style="padding:0 0 ${index === all.length - 1 ? 0 : 10}px;font-family:${FONT_STACK};font-size:14px;line-height:22px;font-weight:600;color:${L.text};">${escapeHtml(value)}</td>
</tr>`,
    )
    .join("");
  return panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`);
}

/** Numbered steps: a small accent number, a title and a line of explanation. */
export function steps(items: readonly { title: string; body: string }[]): string {
  const rows = items
    .map((item, index) => {
      const last = index === items.length - 1;
      return `<tr>
<td valign="top" width="28" style="padding:0 14px ${last ? 0 : 18}px 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="c-chip" align="center" valign="middle" width="28" height="28" bgcolor="${L.panel}" style="width:28px;height:28px;border-radius:9px;background-color:${L.panel};font-family:${FONT_STACK};font-size:14px;line-height:28px;font-weight:700;color:${L.accent};"><span class="c-accent" style="color:${L.accent};">${index + 1}</span></td></tr></table>
</td>
<td valign="top" style="padding:0 0 ${last ? 0 : 18}px;">
<p class="c-text" style="margin:0 0 2px;font-family:${FONT_STACK};font-size:16px;line-height:24px;font-weight:600;color:${L.text};">${escapeHtml(item.title)}</p>
<p class="c-muted" style="margin:0;font-family:${FONT_STACK};font-size:15px;line-height:23px;color:${L.secondary};">${escapeHtml(item.body)}</p>
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px;">${rows}</table>`;
}

/** Up to three big numbers side by side, for the weekly summary. */
export function stats(items: readonly { value: string; label: string }[]): string {
  const width = Math.floor(100 / Math.max(1, items.length));
  const cells = items
    .map(
      (item) => `<td class="c-panel" width="${width}%" valign="top" bgcolor="${L.panel}" style="background-color:${L.panel};border-radius:14px;padding:16px 14px;">
<p class="c-accent" style="margin:0 0 2px;font-family:${FONT_STACK};font-size:26px;line-height:32px;font-weight:700;color:${L.accent};">${escapeHtml(item.value)}</p>
<p class="c-muted" style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:18px;color:${L.secondary};">${escapeHtml(item.label)}</p></td>`,
    )
    .join(`<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;"><tr>${cells}</tr></table>`;
}

/** The raw link under a button, for clients that do not render the button. */
export function linkFallback(href: string): string {
  const url = escapeHtml(safeUrl(href));
  return `<p class="c-faint" style="margin:0;font-family:${FONT_STACK};font-size:13px;line-height:20px;color:${L.tertiary};">If the button doesn't work, paste this link into your browser:<br><a class="c-faint" href="${url}" target="_blank" style="color:${L.tertiary};word-break:break-all;text-decoration:underline;">${url}</a></p>`;
}

// Footer ----------------------------------------------------------------------

export type FooterOptions =
  | { category: "transactional"; reason: string }
  | { category: "marketing" | "reminder"; reason: string; unsubscribeUrl: string };

/** The postal line marketing mail needs (CAN-SPAM). Set CADENCE_POSTAL_ADDRESS; empty hides the line. */
export function postalAddress(env: Record<string, string | undefined> = process.env): string {
  return cleanText(env.CADENCE_POSTAL_ADDRESS ?? "", 200);
}

function footerHtml(options: FooterOptions): string {
  const line = (html: string, spaceAfter = 6) =>
    `<p class="c-faint" style="margin:0 0 ${spaceAfter}px;font-family:${FONT_STACK};font-size:12px;line-height:19px;color:${L.tertiary};">${html}</p>`;
  const anchor = (href: string, label: string) =>
    `<a class="c-faint" href="${escapeHtml(href)}" target="_blank" style="color:${L.tertiary};text-decoration:underline;">${escapeHtml(label)}</a>`;
  const address = postalAddress();

  return [
    line(`Cadence · ${anchor(SITE_URL, SITE_LABEL)}`, 10),
    line(escapeHtml(options.reason)),
    options.category === "transactional" ? "" : line(anchor(safeUrl(options.unsubscribeUrl), "Unsubscribe")),
    line(`Questions? Reply to this email or write to ${anchor(`mailto:${FOOTER_ADDRESSES.support}`, FOOTER_ADDRESSES.support)}.`, address ? 6 : 0),
    address ? line(escapeHtml(address), 0) : "",
  ].join("");
}

function footerText(options: FooterOptions): string {
  const address = postalAddress();
  return [
    `Cadence · ${SITE_URL}`,
    options.reason,
    options.category === "transactional" ? "" : `Unsubscribe: ${safeUrl(options.unsubscribeUrl)}`,
    `Questions? Reply to this email or write to ${FOOTER_ADDRESSES.support}.`,
    address,
  ]
    .filter(Boolean)
    .join("\n");
}

// Document --------------------------------------------------------------------

export const DARK_MEDIA = "@media (prefers-color-scheme: dark)";

const DARK_CSS = `
.c-page { background-color:${D.page} !important; }
.c-card { background-color:${D.card} !important; }
.c-panel, .c-chip { background-color:${D.panel} !important; }
.c-text { color:${D.text} !important; }
.c-muted { color:${D.secondary} !important; }
.c-faint { color:${D.tertiary} !important; }
.c-accent { color:${D.accent} !important; }
.c-btn { background-color:${D.accent} !important; }
.c-btn-text { color:${D.onAccent} !important; }
.c-rule { border-color:${D.rule} !important; }
.c-logo-light { display:none !important; }
.c-logo-dark { display:block !important; max-height:none !important; overflow:visible !important; }
`;

const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
@media only screen and (max-width:480px) {
  .c-outer { padding:20px 8px 28px !important; }
  .c-card { padding:28px 22px 26px !important; }
  .c-edge { padding-left:22px !important; padding-right:22px !important; }
  .c-h1 { font-size:24px !important; line-height:30px !important; }
}
${DARK_MEDIA} {${DARK_CSS}}
[data-ogsc] .c-text { color:${D.text} !important; }
[data-ogsc] .c-muted { color:${D.secondary} !important; }
`;

const PREHEADER_PAD = "&#8199;&#65279;&#847; ".repeat(40);

export const LOGO = { width: 140, height: 34, light: `${EMAIL_ASSET_ORIGIN}logo.png`, dark: `${EMAIL_ASSET_ORIGIN}logo-dark.png` } as const;

export function renderDocument(input: { subject: string; preheader: string; body: string; footer: FooterOptions }): string {
  const logo = (src: string, className: string) =>
    `<img class="${className}" src="${escapeHtml(src)}" width="${LOGO.width}" height="${LOGO.height}" alt="Cadence" style="display:block;width:${LOGO.width}px;height:${LOGO.height}px;border:0;outline:none;text-decoration:none;font-family:${FONT_STACK};font-size:20px;line-height:34px;font-weight:700;color:${L.accent};">`;
  const wordmark = `<a href="${escapeHtml(SITE_URL)}" target="_blank" style="text-decoration:none;">${logo(LOGO.light, "c-logo-light")}<!--[if !mso]><!--><div class="c-logo-dark" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${logo(LOGO.dark, "")}</div><!--<![endif]--></a>`;

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(input.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<!--[if !mso]><!--><link href="${FONT_LINK}" rel="stylesheet"><!--<![endif]-->
<style>${HEAD_CSS}</style>
</head>
<body class="c-page" style="margin:0;padding:0;background-color:${L.page};">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(input.preheader)}${PREHEADER_PAD}</div>
<table role="presentation" class="c-page" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${L.page}" style="background-color:${L.page};">
<tr><td class="c-outer" align="center" style="padding:36px 12px 44px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td class="c-edge" style="padding:0 36px 20px;">${wordmark}</td></tr>
<tr><td class="c-card" bgcolor="${L.card}" style="background-color:${L.card};border-radius:20px;padding:38px 36px 34px;">
${input.body}
</td></tr>
<tr><td class="c-edge" style="padding:24px 36px 0;">${footerHtml(input.footer)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export function renderText(blocks: (string | false | null | undefined)[], footer: FooterOptions): string {
  const body = blocks.filter((block): block is string => typeof block === "string" && block.length > 0).join("\n\n");
  return `${body}\n\n--\n${footerText(footer)}\n`;
}

/** Assembles a whole message from its parts, the shape every template returns. */
export function compose(input: {
  subject: string;
  preheader: string;
  body: (string | false | null | undefined)[];
  text: (string | false | null | undefined)[];
  footer: FooterOptions;
}): RenderedEmail {
  const body = input.body.filter((part): part is string => typeof part === "string" && part.length > 0).join("\n");
  return {
    subject: input.subject,
    preheader: input.preheader,
    html: renderDocument({ subject: input.subject, preheader: input.preheader, body, footer: input.footer }),
    text: renderText(input.text, input.footer),
    category: input.footer.category,
  };
}
