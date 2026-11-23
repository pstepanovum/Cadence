// FILE: src/lib/server/email/layout.ts
//
// The frame every Cadence email is drawn in, and the pieces templates build
// their bodies from.
//
// The look is clean and editorial, on white: the app icon, an optional
// short line of context in the accent, a big tight near-black headline, big
// numbers in the accent, light-gray cards with hairlines, and one strong
// hunter-green call to action that runs full width on a phone. The footer is
// the app icon and the small gray lines mail needs, nothing more.
//
// Email clients are old browsers with odd rules, so the markup is tables with
// inline styles, at most 600 pixels wide, every colour set inline for light
// mode. Two things live in <head>: one stylesheet link for Funnel Display
// (clients that block it fall back to the system stack below) and one small
// <style> block with the phone sizes and the dark palette under
// prefers-color-scheme (near-black, white text, the button unchanged). Apple
// Mail and iOS Mail honour it; Gmail ignores it and darkens on its own, which
// a white design with no colour fills behind text survives.
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

/** The postal address US law (CAN-SPAM) asks commercial mail to carry, on the last footer line. CADENCE_POSTAL_ADDRESS overrides it. */
export const POSTAL_ADDRESS = "7901 4th St N Ste 300, St. Petersburg, FL 33702";

/**
 * Brevo's double opt-in placeholder. It is the one href that is not a URL when
 * rendered, because Brevo swaps in the confirmation link at send time.
 */
export const BREVO_DOI_PLACEHOLDER = "{{ doubleoptin }}";

/**
 * Cadence's palette (src/app/globals.css) for mail, on white: near-black
 * text, light-gray cards with hairlines, and the accent only for the kicker,
 * big numbers, the button and small details. Yellow-green is too light for
 * text on white (1.9:1), so in light mode the accent is hunter green (6.9:1
 * on white); in dark mode it is yellow-green on near-black. The button is hunter
 * green with a white label in both modes. Text never sits on a colour fill
 * except that label, and there are no decorative rules.
 */
export const tone = {
  light: {
    page: "#FFFFFF",
    card: "#FFFFFF",
    panel: "#F4F5F6",
    hairline: "#E3E6E9",
    text: "#111315",
    secondary: "#454B51",
    footer: "#6B7178",
    accent: "#386641",
    button: "#386641",
    onButton: "#FFFFFF",
  },
  dark: {
    page: "#0B0D0E",
    card: "#0B0D0E",
    panel: "#17191B",
    hairline: "#2A2D31",
    text: "#FFFFFF",
    secondary: "#C9CDD1",
    footer: "#9AA0A6",
    accent: "#A7C957",
    button: "#386641",
    onButton: "#FFFFFF",
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
// Every piece below is a full-width block on the white page. Classes (c-text,
// c-muted, c-accent, c-panel, c-rule...) are what the dark palette and the
// phone sizes hook onto; the inline style is the light default every client
// sees.

/** "day streak" -> "Day streak". */
export function sentenceCase(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

const p = (style: string) => `margin:0;font-family:${FONT_STACK};${style}`;

/**
 * The icons mail may show: lucide icons the iPhone app itself uses, rendered
 * by scripts/email/assets.mjs into public/email/icons/ as transparent PNGs,
 * hunter green for light mode and yellow-green (`-dark`) for dark mode.
 */
export const EMAIL_ICONS = ["clock", "flame", "list-checks", "award", "mic", "messages-square", "audio-lines", "cloud", "layers", "book-open", "check-circle", "sparkles", "gamepad", "gift"] as const;
export type EmailIcon = (typeof EMAIL_ICONS)[number];

/**
 * A small decorative icon (empty alt, presentation role): the light image,
 * with the dark one swapped in where the client honours prefers-color-scheme.
 */
export function icon(name: EmailIcon, size = 24): string {
  const image = (file: string, className: string) =>
    `<img class="${className}" src="${escapeHtml(`${EMAIL_ASSET_ORIGIN}icons/${file}.png`)}" width="${size}" height="${size}" alt="" role="presentation" style="display:block;width:${size}px;height:${size}px;border:0;outline:none;text-decoration:none;">`;
  return `${image(name, "c-icon-light")}<!--[if !mso]><!--><div class="c-icon-dark" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${image(`${name}-dark`, "")}</div><!--<![endif]-->`;
}

/** An icon beside a block of trusted markup, top-aligned. */
export function withIcon(name: EmailIcon, html: string, options: { size?: number; gap?: number } = {}): string {
  const size = options.size ?? 24;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="${size + (options.gap ?? 14)}" style="width:${size + (options.gap ?? 14)}px;padding:1px 0 0;">${icon(name, size)}</td>
<td valign="top" style="padding:0;">${html}</td>
</tr></table>`;
}

/** A section heading inside the body. The page headline is compose's `title`. */
export function heading(text: string): string {
  return `<h2 class="c-text" style="${p(`margin:0 0 12px;font-size:24px;line-height:28px;font-weight:800;letter-spacing:-0.5px;color:${L.text};`)}">${escapeHtml(text)}</h2>`;
}

export function subheading(text: string): string {
  return `<h3 class="c-text" style="${p(`margin:0 0 8px;font-size:17px;line-height:24px;font-weight:700;color:${L.text};`)}">${escapeHtml(text)}</h3>`;
}

/** A short sentence-case label above a section, in the accent. */
export function eyebrow(text: string, options: { spaceAfter?: number } = {}): string {
  return `<p class="c-accent" style="${p(`margin:0 0 ${options.spaceAfter ?? 10}px;font-size:15px;line-height:22px;font-weight:700;color:${L.accent};`)}">${escapeHtml(text)}</p>`;
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

/** An inline link in the accent, for a sentence. */
export function inlineLink(label: string, href: string): string {
  return `<a class="c-accent" href="${escapeHtml(safeUrl(href))}" target="_blank" style="color:${L.accent};font-weight:700;text-decoration:underline;">${escapeHtml(label)}</a>`;
}

/** A hairline across the body. */
export function divider(options: { spaceBefore?: number; spaceAfter?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:${options.spaceBefore ?? 8}px 0 ${options.spaceAfter ?? 28}px;"><tr><td class="c-rule-bg" height="1" bgcolor="${L.hairline}" style="height:1px;background-color:${L.hairline};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

/**
 * The one call to action: a hunter-green fill with a white label in both
 * modes, as a table cell with a fill so it shows even with CSS stripped.
 * Inline on a wide screen, the full width of the column on a phone.
 */
export function button(label: string, href: string, options: { spaceBefore?: number; spaceAfter?: number } = {}): string {
  const url = escapeHtml(safeUrl(href));
  return `<table role="presentation" class="c-btn-table" cellpadding="0" cellspacing="0" border="0" style="margin:${options.spaceBefore ?? 8}px 0 ${options.spaceAfter ?? 8}px;">
<tr><td class="c-btn" align="center" bgcolor="${L.button}" style="background-color:${L.button};border-radius:12px;mso-padding-alt:18px 32px;">
<a class="c-btn-text" href="${url}" target="_blank" style="display:inline-block;padding:18px 32px;font-family:${FONT_STACK};font-size:17px;line-height:20px;font-weight:700;color:${L.onButton};text-decoration:none;border-radius:12px;">${escapeHtml(label)}&nbsp;&rarr;</a>
</td></tr></table>`;
}

/** A light-gray card with a hairline. `html` is trusted markup. */
export function panel(html: string, options: { spaceAfter?: number } = {}): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 ${options.spaceAfter ?? 24}px;border-collapse:separate;">
<tr><td class="c-panel c-pad" bgcolor="${L.panel}" style="background-color:${L.panel};border:1px solid ${L.hairline};border-radius:16px;padding:20px 22px;">${html}</td></tr></table>`;
}

/** Label and value rows in a card: plan, amount, date. Values are plain text. */
export function detailRows(rows: [string, string][]): string {
  const shown = rows.filter(([, value]) => value);
  const cells = shown
    .map(([label, value], index) => {
      const last = index === shown.length - 1;
      const edge = last ? "" : `border-bottom:1px solid ${L.hairline};`;
      const top = `${index === 0 ? 0 : 12}px`;
      const bottom = `${last ? 0 : 12}px`;
      return `<tr>
<td class="c-muted c-rule" valign="top" style="padding:${top} 12px ${bottom} 0;${edge}font-family:${FONT_STACK};font-size:14px;line-height:22px;color:${L.secondary};">${escapeHtml(label)}</td>
<td class="c-text c-rule" valign="top" align="right" style="padding:${top} 0 ${bottom};${edge}font-family:${FONT_STACK};font-size:15px;line-height:22px;font-weight:700;color:${L.text};">${escapeHtml(value)}</td>
</tr>`;
    })
    .join("");
  return panel(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${cells}</table>`);
}

/** Numbered steps, editorial style: 01, 02, 03 in the accent, a bold line and a plain one, hairlines between. */
export function steps(items: readonly { title: string; body: string }[]): string {
  const rows = items
    .map((item, index) => {
      const edge = index === 0 ? "" : `border-top:1px solid ${L.hairline};`;
      const pad = `${index === 0 ? 0 : 16}px 0 16px`;
      return `<tr>
<td class="c-rule" valign="top" width="48" style="width:48px;padding:${pad};${edge}">
<p class="c-accent" style="${p(`font-size:20px;line-height:24px;font-weight:800;color:${L.accent};`)}">${String(index + 1).padStart(2, "0")}</p>
</td>
<td class="c-rule" valign="top" style="padding:${pad};${edge}">
<p class="c-text" style="${p(`margin:0 0 3px;font-size:17px;line-height:24px;font-weight:700;color:${L.text};`)}">${escapeHtml(item.title)}</p>
<p class="c-muted" style="${p(`font-size:15px;line-height:23px;color:${L.secondary};`)}">${escapeHtml(item.body)}</p>
</td></tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">${rows}</table>`;
}

/** A list item: plain text, with one of the app's icons as its marker. */
export type ChecklistItem = string | { icon: EmailIcon; text: string };

/** A list with the app's icons as markers (small accent squares for plain strings): Plus features, habit tips. */
export function checklist(items: readonly ChecklistItem[]): string {
  const rows = items
    .map((item, index) => {
      const text = typeof item === "string" ? item : item.text;
      const marker =
        typeof item === "string"
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0;"><tr><td class="c-fill" width="8" height="8" bgcolor="${L.accent}" style="width:8px;height:8px;font-size:0;line-height:0;background-color:${L.accent};border-radius:2px;">&nbsp;</td></tr></table>`
          : icon(item.icon, 22);
      const top = index === 0 ? 0 : 14;
      return `<tr>
<td valign="top" width="36" style="width:36px;padding:${top}px 0 0;">${marker}</td>
<td valign="top" style="padding:${top}px 0 0;"><p class="c-text" style="${p(`font-size:16px;line-height:24px;color:${L.text};`)}">${escapeHtml(text)}</p></td>
</tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 26px;">${rows}</table>`;
}

/** A big-number moment on white: the number huge in the accent, a bold label, a line under it. */
export function bigNumber(input: { value: string; label: string; caption?: string; icon?: EmailIcon }): string {
  const caption = cleanText(input.caption, 160);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
<tr><td style="padding:0;">
${input.icon ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr><td style="padding:0;">${icon(input.icon, 32)}</td></tr></table>` : ""}
<p class="c-accent c-big" style="${p(`font-size:88px;line-height:84px;font-weight:800;letter-spacing:-4px;color:${L.accent};`)}">${escapeHtml(input.value)}</p>
<p class="c-text" style="${p(`margin:8px 0 0;font-size:17px;line-height:24px;font-weight:700;color:${L.text};`)}">${escapeHtml(sentenceCase(input.label))}</p>
${caption ? `<p class="c-muted" style="${p(`margin:6px 0 0;font-size:15px;line-height:22px;color:${L.secondary};`)}">${escapeHtml(caption)}</p>` : ""}
</td></tr></table>`;
}

/** Up to three numbers side by side on light-gray cards. */
export function stats(items: readonly { value: string; label: string; icon?: EmailIcon }[]): string {
  const width = Math.floor(100 / Math.max(1, items.length));
  const cells = items
    .map(
      (item) => `<td class="c-panel" width="${width}%" valign="top" bgcolor="${L.panel}" style="background-color:${L.panel};border:1px solid ${L.hairline};border-radius:14px;padding:16px 14px 14px;">
${item.icon ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;"><tr><td style="padding:0;">${icon(item.icon, 22)}</td></tr></table>` : ""}
<p class="c-accent c-stat" style="${p(`margin:0 0 6px;font-size:36px;line-height:38px;font-weight:800;letter-spacing:-1.4px;color:${L.accent};`)}">${escapeHtml(item.value)}</p>
<p class="c-muted" style="${p(`font-size:14px;line-height:19px;color:${L.secondary};`)}">${escapeHtml(sentenceCase(item.label))}</p></td>`,
    )
    .join(`<td width="8" style="width:8px;font-size:0;line-height:0;">&nbsp;</td>`);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-collapse:separate;"><tr>${cells}</tr></table>`;
}

/**
 * The offer on white: the discount huge in the accent, then the code on a
 * dashed ticket as live text a reader can select, then the end date.
 */
export function offerBlock(input: { kicker: string; headline: string; code: string; ends: string }): string {
  const headline = cleanText(input.headline, 24);
  const size = headline.length <= 8 ? "88px;line-height:84px;letter-spacing:-4px" : headline.length <= 14 ? "60px;line-height:60px;letter-spacing:-2.5px" : "44px;line-height:46px;letter-spacing:-1.5px";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
<tr><td style="padding:0;">
<p class="c-accent ${headline.length <= 8 ? "c-big" : ""}" style="${p(`font-size:${size};font-weight:800;color:${L.accent};`)}">${escapeHtml(headline)}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;border-collapse:separate;">
<tr><td class="c-ticket" align="center" style="border:2px dashed ${L.accent};border-radius:16px;padding:20px 18px 22px;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px;"><tr><td style="padding:0;">${icon("sparkles", 24)}</td></tr></table>
<p class="c-accent" style="${p(`margin:0 0 8px;font-size:15px;line-height:22px;font-weight:700;color:${L.accent};`)}">${escapeHtml(cleanText(input.kicker, 60))}</p>
<p class="c-text c-code" style="margin:0;font-family:${MONO_STACK};font-size:30px;line-height:36px;font-weight:700;color:${L.text};">${escapeHtml(input.code)}</p>
<p class="c-muted" style="${p(`margin:10px 0 0;font-size:14px;line-height:20px;font-weight:600;color:${L.secondary};`)}">${escapeHtml(input.ends)}</p>
</td></tr></table>`;
}

/**
 * A friend code on white, the way Heft draws it: a gift icon, a short caption
 * in the accent ("3 months of Cadence Plus"), and the code big and bold on a
 * dashed ticket, as live text a reader can select and copy.
 */
export function codeBlock(code: string, caption: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;border-collapse:separate;">
<tr><td class="c-ticket" align="center" style="border:2px dashed ${L.accent};border-radius:16px;padding:22px 18px 24px;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 10px;"><tr><td style="padding:0;">${icon("gift", 28)}</td></tr></table>
<p class="c-accent" style="${p(`margin:0 0 8px;font-size:15px;line-height:22px;font-weight:700;color:${L.accent};`)}">${escapeHtml(cleanText(caption, 60))}</p>
<p class="c-text c-code" dir="ltr" style="${p(`font-size:34px;line-height:40px;font-weight:800;color:${L.text};word-break:break-all;`)}">${escapeHtml(cleanText(code, 40))}</p>
</td></tr></table>`;
}

/** The raw link under a button, for clients that do not render the button. */
export function linkFallback(href: string): string {
  const url = escapeHtml(safeUrl(href));
  return `<p class="c-muted" style="${p(`font-size:13px;line-height:20px;color:${L.secondary};`)}">If the button doesn't work, paste this link into your browser:<br><a class="c-muted" href="${url}" target="_blank" style="color:${L.secondary};word-break:break-all;text-decoration:underline;">${url}</a></p>`;
}

// Footer ----------------------------------------------------------------------

export type FooterOptions =
  | { category: "transactional"; reason: string }
  | { category: "marketing" | "reminder" | "lifecycle"; reason: string; unsubscribeUrl: string };

/** The postal line every footer carries (CAN-SPAM): CADENCE_POSTAL_ADDRESS when set, POSTAL_ADDRESS otherwise. */
export function postalAddress(env: Record<string, string | undefined> = process.env): string {
  return cleanText(env.CADENCE_POSTAL_ADDRESS ?? "", 200) || POSTAL_ADDRESS;
}

/** The App Store icon (mobile/assets/images/ios-icon.png, rendered by scripts/email/assets.mjs), small and rounded. */
export const APP_ICON = { src: `${EMAIL_ASSET_ORIGIN}app-icon.png`, size: 36 } as const;

/**
 * Just the app icon and the small gray lines the law and good manners need:
 * why this came, the unsubscribe link on its own line (opt-in mail only), and
 * the company and postal address, last. No wordmark.
 */
function footerHtml(options: FooterOptions): string {
  const line = (html: string, spaceAfter = 8) => `<p class="c-footer" style="${p(`margin:0 0 ${spaceAfter}px;font-size:12px;line-height:19px;color:${L.footer};`)}">${html}</p>`;
  const address = postalAddress();
  const icon = `<a href="${escapeHtml(SITE_URL)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(APP_ICON.src)}" width="${APP_ICON.size}" height="${APP_ICON.size}" alt="Cadence" style="display:block;width:${APP_ICON.size}px;height:${APP_ICON.size}px;border:0;outline:none;text-decoration:none;border-radius:8px;margin:0 0 14px;font-family:${FONT_STACK};font-size:11px;line-height:${APP_ICON.size}px;color:${L.footer};"></a>`;
  const unsubscribe =
    options.category === "transactional"
      ? ""
      : line(`<a class="c-footer" href="${escapeHtml(safeUrl(options.unsubscribeUrl))}" target="_blank" style="color:${L.footer};font-weight:700;text-decoration:underline;">Unsubscribe</a>`);
  const lines = [line(escapeHtml(options.reason)), unsubscribe, address ? line(`Cadence, ${escapeHtml(address)}`) : ""].filter(Boolean);
  // The last line closes without a gap.
  if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace("margin:0 0 8px;", "margin:0;");
  return icon + lines.join("");
}

function footerText(options: FooterOptions): string {
  const address = postalAddress();
  return [options.reason, options.category === "transactional" ? "" : `Unsubscribe: ${safeUrl(options.unsubscribeUrl)}`, address ? `Cadence, ${address}` : ""].filter(Boolean).join("\n");
}

// Document --------------------------------------------------------------------

export const DARK_MEDIA = "@media (prefers-color-scheme: dark)";

const DARK_CSS = `
.c-page { background-color:${D.page} !important; }
.c-card { background-color:${D.card} !important; }
.c-panel { background-color:${D.panel} !important; border-color:${D.hairline} !important; }
.c-text { color:${D.text} !important; }
.c-muted { color:${D.secondary} !important; }
.c-footer { color:${D.footer} !important; }
.c-accent { color:${D.accent} !important; }
.c-fill { background-color:${D.accent} !important; }
.c-btn { background-color:${D.button} !important; }
.c-btn-text { color:${D.onButton} !important; }
.c-rule { border-color:${D.hairline} !important; }
.c-rule-bg { background-color:${D.hairline} !important; }
.c-ticket { border-color:${D.accent} !important; }
.c-icon-light { display:none !important; }
.c-icon-dark { display:block !important; max-height:none !important; overflow:visible !important; }
`;

const HEAD_CSS = `
:root { color-scheme: light dark; supported-color-schemes: light dark; }
body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
table, td { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
img { border:0; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
a[x-apple-data-detectors] { color:inherit !important; text-decoration:none !important; }
@media only screen and (max-width:520px) {
  .c-outer { padding:20px 8px 28px !important; }
  .c-edge { padding-left:20px !important; padding-right:20px !important; }
  .c-pad { padding:18px 18px !important; }
  .c-headline { font-size:36px !important; line-height:38px !important; letter-spacing:-1.3px !important; }
  .c-big { font-size:72px !important; line-height:70px !important; letter-spacing:-3px !important; }
  .c-stat { font-size:28px !important; line-height:30px !important; }
  .c-code { font-size:24px !important; }
  .c-btn-table { width:100% !important; }
  .c-btn-text { display:block !important; text-align:center !important; padding-left:16px !important; padding-right:16px !important; }
}
${DARK_MEDIA} {${DARK_CSS}}
[data-ogsc] .c-page, [data-ogsc] .c-card { background-color:${D.page} !important; }
[data-ogsc] .c-text { color:${D.text} !important; }
[data-ogsc] .c-muted { color:${D.secondary} !important; }
[data-ogsc] .c-footer { color:${D.footer} !important; }
[data-ogsc] .c-accent { color:${D.accent} !important; }
[data-ogsc] .c-btn { background-color:${D.button} !important; }
[data-ogsc] .c-btn-text { color:${D.onButton} !important; }
`;

const PREHEADER_PAD = "&#8199;&#65279;&#847; ".repeat(40);

export interface DocumentInput {
  subject: string;
  preheader: string;
  /** An optional short line above the headline, sentence case: "Day 1 of 13", "Security". Empty leaves it out. */
  kicker: string;
  /** The headline. */
  title: string;
  body: string;
  footer: FooterOptions;
}

export function renderDocument(input: DocumentInput): string {
  const kicker = cleanText(input.kicker, 60);
  const width = MAX_WIDTH;
  const logo = `<a href="${escapeHtml(SITE_URL)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(APP_ICON.src)}" width="${APP_ICON.size}" height="${APP_ICON.size}" alt="Cadence" style="display:block;width:${APP_ICON.size}px;height:${APP_ICON.size}px;border:0;outline:none;text-decoration:none;border-radius:8px;margin:0 0 32px;font-family:${FONT_STACK};font-size:11px;line-height:${APP_ICON.size}px;color:${L.footer};"></a>`;

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
<tr><td class="c-outer" align="center" style="padding:40px 12px 48px;">
<!--[if mso]><table role="presentation" width="${width}" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${width}px;">
<tr><td class="c-card c-edge" bgcolor="${L.card}" style="background-color:${L.card};padding:0 36px 8px;">
${logo}
${kicker ? `<p class="c-accent" style="${p(`margin:0 0 10px;font-size:15px;line-height:22px;font-weight:700;color:${L.accent};`)}">${escapeHtml(kicker)}</p>` : ""}
<h1 class="c-text c-headline" style="${p(`font-size:46px;line-height:48px;font-weight:800;letter-spacing:-1.7px;color:${L.text};`)}">${escapeHtml(input.title)}</h1>
</td></tr>
<tr><td class="c-card c-edge" bgcolor="${L.card}" style="background-color:${L.card};padding:28px 36px 36px;">
${input.body}
</td></tr>
<tr><td class="c-edge" style="padding:0 36px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="c-rule" style="border-top:1px solid ${L.hairline};padding:28px 0 0;">${footerHtml(input.footer)}</td></tr></table></td></tr>
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
  /** An optional short line above the headline, sentence case. Empty leaves it out. */
  kicker: string;
  /** The headline; also the first line of the plain-text part. */
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
