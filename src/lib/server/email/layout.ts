// FILE: src/lib/server/email/layout.ts
//
// The frame every Cadence email is drawn in, and the pieces templates build
// their bodies from.
//
// The look is editorial: a solid hunter-green header band carrying the
// yellow-green logo, an uppercase letter-spaced kicker and a big tight
// headline; then a white card with big-number moments, card sections and one
// strong call to action that runs full width on a phone.
//
// Email clients are old browsers with odd rules, so the markup is tables with
// inline styles, at most 600 pixels wide, every colour set inline for light
// mode. Two things live in <head>: one stylesheet link for Funnel Display
// (clients that block it fall back to the system stack below) and one small
// <style> block with the phone sizes and the dark palette under
// prefers-color-scheme. Apple Mail and iOS Mail honour it; Gmail ignores the
// dark part and darkens on its own, which the light palette survives because
// nothing depends on a background image and the band keeps its green.
// Outlook for Windows gets a fixed 600 px ghost table.
//
// Everything here is pure: templates take typed props and return strings, so
// the server, the preview script and the tests render exactly the same thing.

export type EmailCategory = "transactional" | "marketing" | "reminder" | "lifecycle";

/**
 * The lists a reader can leave, each with its own consent. Account, billing
 * and security mail is on none.
 *
 *   reminders    streaks, weekly summary, badges, nudges         opt-in, off by default
 *   lifecycle    getting-started tips for accounts without Plus  on by default
 *   newsletter   product news and offers (sales)                 double opt-in
 */
export type EmailList = "reminders" | "lifecycle" | "newsletter";

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
export const MAX_WIDTH = 600;

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
 * Cadence's palette (src/app/globals.css) for mail. Hunter green carries the
 * header band in both modes; yellow-green is the logo, the kicker and the
 * offer block; the grayscale carries the card. Button text is white on hunter
 * (6.9:1) and carbon on yellow-green (9.6:1); the white headline on the band
 * is 6.9:1, the yellow-green kicker on it 3.6:1 at bold uppercase.
 */
export const tone = {
  light: {
    page: "#E9ECEF",
    band: "#386641",
    onBand: "#FFFFFF",
    kicker: "#A7C957",
    card: "#FFFFFF",
    panel: "#F1F3F5",
    rule: "#DEE2E6",
    text: "#212529",
    secondary: "#495057",
    tertiary: "#5A636B",
    accent: "#386641",
    onAccent: "#FFFFFF",
    offer: "#A7C957",
    onOffer: "#212529",
  },
  dark: {
    page: "#101214",
    band: "#1F3A25",
    onBand: "#F8F9FA",
    kicker: "#A7C957",
    card: "#1A1D20",
    panel: "#24282C",
    rule: "#343A40",
    text: "#F8F9FA",
    secondary: "#CED4DA",
    tertiary: "#ADB5BD",
    accent: "#A7C957",
    onAccent: "#16191C",
    offer: "#A7C957",
    onOffer: "#16191C",
  },
} as const;

export const FONT_STACK = "'Funnel Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK = "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Funnel+Display:wght@400;600;700;800&display=swap";

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
//
// Every piece below is a full-width block for the card. Text classes (c-text,
// c-muted, c-faint, c-accent) are what the dark palette and the phone sizes
// hook onto; the inline style is the light default every client sees.

const p = (style: string) => `margin:0;font-family:${FONT_STACK};${style}`;

/** A second-level heading inside the card. The page headline lives in the band (compose's `title`). */
export function heading(text: string): string {
  return `<h2 class="c-text" style="${p(`margin:0 0 12px;font-size:24px;line-height:28px;font-weight:800;letter-spacing:-0.5px;color:${L.text};`)}">${escapeHtml(text)}</h2>`;
}

export function subheading(text: string): string {
  return `<h3 class="c-text" style="${p(`margin:0 0 8px;font-size:17px;line-height:24px;font-weight:700;color:${L.text};`)}">${escapeHtml(text)}</h3>`;
}

/** A small uppercase label above a section. */
export function eyebrow(text: string, options: { spaceAfter?: number } = {}): string {
  return `<p class="c-accent" style="${p(`margin:0 0 ${options.spaceAfter ?? 12}px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${L.accent};`)}">${escapeHtml(text.toUpperCase())}</p>`;
}

/** A paragraph. `html` is trusted markup built from escaped strings. */
export function paragraph(html: string, options: { muted?: boolean; small?: boolean; lead?: boolean; spaceBefore?: number; spaceAfter?: number } = {}): string {
  const color = options.muted ? L.secondary : L.text;
  const className = options.muted ? "c-muted" : "c-text";
  const size = options.lead ? "19px;line-height:29px" : options.small ? "14px;line-height:22px" : "16px;line-height:26px";
  return `<p class="${className}" style="${p(`margin:${options.spaceBefore ?? 0}px 0 ${options.spaceAfter ?? 16}px;font-size:${size};color:${color};`)}">${html}</p>`;
}

export function strong(text: string): string {
  return `<strong style="font-weight:700;">${escapeHtml(text)}</strong>`;
}

/** A thin rule across the card. */
export function divider(options: { spaceBefore?: number; spaceAfter?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${options.spaceBefore ?? 8}px 0 ${options.spaceAfter ?? 28}px;"><tr><td class="c-rule" height="1" style="height:1px;font-size:0;line-height:0;border-top:1px solid ${L.rule};">&nbsp;</td></tr></table>`;
}

/**
 * The one call to action: a filled table cell, so it shows even with CSS
 * stripped. On a phone it runs the full width of the card.
 */
export function button(label: string, href: string, options: { spaceBefore?: number; spaceAfter?: number } = {}): string {
  const url = escapeHtml(safeUrl(href));
  return `<table role="presentation" class="c-btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:${options.spaceBefore ?? 8}px 0 ${options.spaceAfter ?? 8}px;">
<tr><td class="c-btn" align="center" bgcolor="${L.accent}" style="background-color:${L.accent};border-radius:12px;mso-padding-alt:18px 32px;">
<a class="c-btn-text" href="${url}" target="_blank" style="display:inline-block;padding:18px 32px;font-family:${FONT_STACK};font-size:17px;line-height:20px;font-weight:700;letter-spacing:0.2px;color:${L.onAccent};text-decoration:none;border-radius:12px;">${escapeHtml(label)}&nbsp;&rarr;</a>
</td></tr></table>`;
}

/** A card section inside the card. `html` is trusted markup. */
export function panel(html: string, options: { spaceAfter?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 ${options.spaceAfter ?? 24}px;">
<tr><td class="c-panel c-pad" bgcolor="${L.panel}" style="background-color:${L.panel};border-radius:16px;padding:20px 22px;">${html}</td></tr></table>`;
}

/** Label and value rows in a card: plan, amount, date. Values are plain text. */
export function detailRows(rows: [string, string][]): string {
  const shown = rows.filter(([, value]) => value);
  const cells = shown
    .map(([label, value], index) => {
      const last = index === shown.length - 1;
      const edge = last ? "" : `border-bottom:1px solid ${L.rule};`;
      const pad = `${index === 0 ? 0 : 12}px`;
      const bottom = `${last ? 0 : 12}px`;
      return `<tr>
<td class="c-muted c-rule" valign="top" style="padding:${pad} 12px ${bottom} 0;${edge}font-family:${FONT_STACK};font-size:11px;line-height:22px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${L.secondary};">${escapeHtml(label.toUpperCase())}</td>
<td class="c-text c-rule" valign="top" align="right" style="padding:${pad} 0 ${bottom};${edge}font-family:${FONT_STACK};font-size:15px;line-height:22px;font-weight:700;color:${L.text};">${escapeHtml(value)}</td>
</tr>`;
    })
    .join("");
  return panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`);
}

/** Numbered steps, editorial style: a big "01" in the accent, a title, a line. */
export function steps(items: readonly { title: string; body: string }[]): string {
  const rows = items
    .map((item, index) => {
      const last = index === items.length - 1;
      const edge = last ? "" : `border-bottom:1px solid ${L.rule};`;
      const pad = `${index === 0 ? 0 : 18}px 0 ${last ? 0 : 18}px`;
      return `<tr>
<td class="c-rule" valign="top" width="56" style="width:56px;padding:${pad};${edge}">
<p class="c-accent" style="${p(`font-size:30px;line-height:30px;font-weight:800;letter-spacing:-1px;color:${L.accent};`)}">${String(index + 1).padStart(2, "0")}</p>
</td>
<td class="c-rule" valign="top" style="padding:${pad};${edge}">
<p class="c-text" style="${p(`margin:0 0 4px;font-size:17px;line-height:24px;font-weight:700;color:${L.text};`)}">${escapeHtml(item.title)}</p>
<p class="c-muted" style="${p(`font-size:15px;line-height:23px;color:${L.secondary};`)}">${escapeHtml(item.body)}</p>
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px;">${rows}</table>`;
}

/** A list with square accent markers: Plus features, what a tip covers. */
export function checklist(items: readonly string[]): string {
  const rows = items
    .map(
      (item, index) => `<tr>
<td valign="top" width="24" style="width:24px;padding:${index === 0 ? 7 : 19}px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td class="c-btn" width="10" height="10" bgcolor="${L.accent}" style="width:10px;height:10px;font-size:0;line-height:0;background-color:${L.accent};border-radius:2px;">&nbsp;</td></tr></table></td>
<td valign="top" style="padding:${index === 0 ? 0 : 12}px 0 0;"><p class="c-text" style="${p(`font-size:16px;line-height:24px;color:${L.text};`)}">${escapeHtml(item)}</p></td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 26px;">${rows}</table>`;
}

/**
 * The hero moment: one big number with an uppercase label under it, on a card
 * with a yellow-green edge. `value` is short ("12", "86", "7").
 */
export function bigNumber(input: { value: string; label: string; caption?: string }): string {
  const caption = cleanText(input.caption, 160);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
<tr><td class="c-panel c-pad" bgcolor="${L.panel}" style="background-color:${L.panel};border-radius:16px;border-left:6px solid ${L.offer};padding:24px 24px 22px;">
<p class="c-accent c-big" style="${p(`font-size:80px;line-height:76px;font-weight:800;letter-spacing:-3px;color:${L.accent};`)}">${escapeHtml(input.value)}</p>
<p class="c-text" style="${p(`margin:10px 0 0;font-size:13px;line-height:18px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${L.text};`)}">${escapeHtml(input.label.toUpperCase())}</p>
${caption ? `<p class="c-muted" style="${p(`margin:6px 0 0;font-size:15px;line-height:22px;color:${L.secondary};`)}">${escapeHtml(caption)}</p>` : ""}
</td></tr></table>`;
}

/** Up to three big numbers side by side: the weekly summary, a habit check-in. */
export function stats(items: readonly { value: string; label: string }[]): string {
  const width = Math.floor(100 / Math.max(1, items.length));
  const cells = items
    .map(
      (item) => `<td class="c-panel" width="${width}%" valign="top" bgcolor="${L.panel}" style="background-color:${L.panel};border-radius:16px;border-top:4px solid ${L.offer};padding:16px 14px 14px;">
<p class="c-accent c-stat" style="${p(`margin:0 0 6px;font-size:40px;line-height:40px;font-weight:800;letter-spacing:-1.5px;color:${L.accent};`)}">${escapeHtml(item.value)}</p>
<p class="c-muted" style="${p(`font-size:11px;line-height:15px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${L.secondary};`)}">${escapeHtml(item.label.toUpperCase())}</p></td>`,
    )
    .join(`<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 28px;"><tr>${cells}</tr></table>`;
}

/**
 * The offer block: a solid yellow-green slab with the discount huge, the code
 * in a dashed ticket and the end date. Same colours in both modes, on purpose.
 */
export function offerBlock(input: { kicker: string; headline: string; code: string; ends: string }): string {
  const headline = cleanText(input.headline, 24).toUpperCase();
  const size = headline.length <= 8 ? "88px;line-height:82px" : headline.length <= 14 ? "60px;line-height:58px" : "44px;line-height:46px";
  const ink = L.onOffer;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
<tr><td class="c-pad" bgcolor="${L.offer}" style="background-color:${L.offer};border-radius:16px;padding:28px 28px 26px;">
<p style="${p(`margin:0 0 14px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.4px;text-transform:uppercase;color:${ink};`)}">${escapeHtml(cleanText(input.kicker, 60).toUpperCase())}</p>
<p class="${headline.length <= 8 ? "c-offer-big" : ""}" style="${p(`font-size:${size};font-weight:800;letter-spacing:-3px;color:${ink};`)}">${escapeHtml(headline)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;"><tr>
<td style="border:2px dashed ${ink};border-radius:10px;padding:10px 16px;"><p style="margin:0;font-family:${MONO_STACK};font-size:20px;line-height:24px;font-weight:700;letter-spacing:3px;color:${ink};">${escapeHtml(input.code)}</p></td>
</tr></table>
<p style="${p(`margin:14px 0 0;font-size:14px;line-height:20px;font-weight:600;color:${ink};`)}">${escapeHtml(input.ends)}</p>
</td></tr></table>`;
}

/** The raw link under a button, for clients that do not render the button. */
export function linkFallback(href: string): string {
  const url = escapeHtml(safeUrl(href));
  return `<p class="c-faint" style="${p(`font-size:13px;line-height:20px;color:${L.tertiary};`)}">If the button doesn't work, paste this link into your browser:<br><a class="c-faint" href="${url}" target="_blank" style="color:${L.tertiary};word-break:break-all;text-decoration:underline;">${url}</a></p>`;
}

// Footer ----------------------------------------------------------------------

export type FooterOptions =
  | { category: "transactional"; reason: string }
  | { category: "marketing" | "reminder" | "lifecycle"; reason: string; unsubscribeUrl: string };

/** The postal line marketing mail needs (CAN-SPAM). Set CADENCE_POSTAL_ADDRESS; empty hides the line. */
export function postalAddress(env: Record<string, string | undefined> = process.env): string {
  return cleanText(env.CADENCE_POSTAL_ADDRESS ?? "", 200);
}

const PREFERENCES_URL = `${SITE_URL}/account`;

function footerHtml(options: FooterOptions): string {
  const line = (html: string, spaceAfter = 6) => `<p class="c-faint" style="${p(`margin:0 0 ${spaceAfter}px;font-size:12px;line-height:19px;color:${L.tertiary};`)}">${html}</p>`;
  const anchor = (href: string, label: string, bold = false) =>
    `<a class="c-faint" href="${escapeHtml(href)}" target="_blank" style="color:${L.tertiary};text-decoration:underline;${bold ? "font-weight:700;" : ""}">${escapeHtml(label)}</a>`;
  const address = postalAddress();

  return [
    `<p class="c-faint" style="${p(`margin:0 0 12px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:2.2px;text-transform:uppercase;color:${L.tertiary};`)}">Cadence &middot; ${anchor(SITE_URL, SITE_LABEL)}</p>`,
    line(escapeHtml(options.reason)),
    options.category === "transactional" ? "" : line(`${anchor(safeUrl(options.unsubscribeUrl), "Unsubscribe", true)} &middot; ${anchor(PREFERENCES_URL, "Email settings")}`),
    line(`Questions? Reply to this email or write to ${anchor(`mailto:${FOOTER_ADDRESSES.support}`, FOOTER_ADDRESSES.support)}.`, address ? 6 : 0),
    address ? line(escapeHtml(address), 0) : "",
  ].join("");
}

function footerText(options: FooterOptions): string {
  const address = postalAddress();
  return [
    `Cadence · ${SITE_URL}`,
    options.reason,
    options.category === "transactional" ? "" : `Unsubscribe: ${safeUrl(options.unsubscribeUrl)}\nEmail settings: ${PREFERENCES_URL}`,
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
.c-band { background-color:${D.band} !important; }
.c-headline { color:${D.onBand} !important; }
.c-card { background-color:${D.card} !important; }
.c-panel { background-color:${D.panel} !important; }
.c-text { color:${D.text} !important; }
.c-muted { color:${D.secondary} !important; }
.c-faint { color:${D.tertiary} !important; }
.c-accent { color:${D.accent} !important; }
.c-btn { background-color:${D.accent} !important; }
.c-btn-text { color:${D.onAccent} !important; }
.c-rule { border-color:${D.rule} !important; }
`;

const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
@media only screen and (max-width:520px) {
  .c-outer { padding:12px 8px 28px !important; }
  .c-band { padding:24px 22px 30px !important; }
  .c-card { padding:28px 22px 30px !important; }
  .c-edge { padding-left:22px !important; padding-right:22px !important; }
  .c-pad { padding:20px 18px !important; }
  .c-headline { font-size:36px !important; line-height:37px !important; letter-spacing:-1.2px !important; }
  .c-kicker { margin-top:30px !important; }
  .c-big { font-size:64px !important; line-height:62px !important; }
  .c-stat { font-size:30px !important; line-height:32px !important; }
  .c-offer-big { font-size:64px !important; line-height:62px !important; }
  .c-btn-table { width:100% !important; }
  .c-btn-text { display:block !important; text-align:center !important; padding-left:16px !important; padding-right:16px !important; }
}
${DARK_MEDIA} {${DARK_CSS}}
[data-ogsc] .c-text { color:${D.text} !important; }
[data-ogsc] .c-muted { color:${D.secondary} !important; }
[data-ogsc] .c-headline { color:${D.onBand} !important; }
`;

const PREHEADER_PAD = "&#8199;&#65279;&#847; ".repeat(40);

/** The yellow-green logo (public/email/logo-dark.png), which sits on the green band in both modes. */
export const LOGO = { width: 124, height: 30, src: `${EMAIL_ASSET_ORIGIN}logo-dark.png` } as const;

export interface DocumentInput {
  subject: string;
  preheader: string;
  /** The uppercase line above the headline: "Day 1 · Start here", "Security". */
  kicker: string;
  /** The headline in the band. */
  title: string;
  body: string;
  footer: FooterOptions;
}

export function renderDocument(input: DocumentInput): string {
  const logo = `<a href="${escapeHtml(SITE_URL)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(LOGO.src)}" width="${LOGO.width}" height="${LOGO.height}" alt="Cadence" style="display:block;width:${LOGO.width}px;height:${LOGO.height}px;border:0;outline:none;text-decoration:none;font-family:${FONT_STACK};font-size:24px;line-height:30px;font-weight:800;color:${L.kicker};"></a>`;
  const kicker = cleanText(input.kicker, 60).toUpperCase();
  const width = MAX_WIDTH;

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
<tr><td class="c-outer" align="center" style="padding:32px 12px 44px;">
<!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;">
<tr><td class="c-band" bgcolor="${L.band}" style="background-color:${L.band};border-radius:20px 20px 0 0;padding:30px 40px 40px;">
${logo}
<p class="c-kicker" style="${p(`margin:44px 0 14px;font-size:12px;line-height:16px;font-weight:700;letter-spacing:2.6px;text-transform:uppercase;color:${L.kicker};`)}">${escapeHtml(kicker || "Cadence")}</p>
<h1 class="c-headline" style="${p(`font-size:46px;line-height:47px;font-weight:800;letter-spacing:-1.6px;color:${L.onBand};`)}">${escapeHtml(input.title)}</h1>
</td></tr>
<tr><td class="c-card" bgcolor="${L.card}" style="background-color:${L.card};border-radius:0 0 20px 20px;padding:36px 40px 40px;">
${input.body}
</td></tr>
<tr><td class="c-edge" style="padding:26px 40px 0;">${footerHtml(input.footer)}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

export function renderText(title: string, blocks: (string | false | null | undefined)[], footer: FooterOptions): string {
  const body = [title, ...blocks].filter((block): block is string => typeof block === "string" && block.length > 0).join("\n\n");
  return `${body}\n\n--\n${footerText(footer)}\n`;
}

/** Assembles a whole message from its parts, the shape every template returns. */
export function compose(input: {
  subject: string;
  preheader: string;
  /** The uppercase line above the headline. */
  kicker: string;
  /** The headline in the band; also the first line of the plain-text part. */
  title: string;
  body: (string | false | null | undefined)[];
  /** The plain-text part, without the title (compose puts it first). */
  text: (string | false | null | undefined)[];
  footer: FooterOptions;
}): RenderedEmail {
  const body = input.body.filter((part): part is string => typeof part === "string" && part.length > 0).join("\n");
  return {
    subject: input.subject,
    preheader: input.preheader,
    html: renderDocument({ subject: input.subject, preheader: input.preheader, kicker: input.kicker, title: input.title, body, footer: input.footer }),
    text: renderText(input.title, input.text, input.footer),
    category: input.footer.category,
  };
}
