// FILE: src/lib/server/email/offer.ts
//
// The sale in the lifecycle sequence: an Apple subscription offer code, from
// the environment, never from code:
//
//   CADENCE_OFFER_CODE    the code made in App Store Connect, e.g. CADENCEHALF
//   CADENCE_OFFER_LABEL   what it gives, short, e.g. "50% off"
//   CADENCE_OFFER_ENDS    the last day it works, YYYY-MM-DD (the end of that
//                         day, UTC) or a full ISO time
//
// Any of them missing, malformed or past, and there is no offer: the sale
// emails are skipped. Offer codes are redeemed in the App Store, so the link
// is Apple's redeem page with the code filled in. The web (Stripe) has no
// discount mechanism of its own, so web-only learners get the same App Store
// link and nothing else.
type Env = Record<string, string | undefined>;

/** Cadence in App Store Connect. */
export const APP_STORE_APP_ID = "6826485399";

export interface Offer {
  code: string;
  label: string;
  endsAt: number;
  redeemUrl: string;
}

const CODE = /^[A-Za-z0-9]{1,64}$/;

export function offerRedeemUrl(code: string): string {
  return `https://apps.apple.com/redeem?ctx=offercodes&id=${APP_STORE_APP_ID}&code=${encodeURIComponent(code)}`;
}

export function parseOfferEnd(value: string | undefined): number | null {
  const text = value?.trim();
  if (!text) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const end = Date.UTC(year, month - 1, date, 23, 59, 59, 999);
    // Reject 2026-02-31 and the like, which Date.UTC would roll over.
    return new Date(end).getUTCDate() === date ? end : null;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) && /T/.test(text) ? parsed : null;
}

/** The running offer, or null when there is none (unset, malformed, or over). */
export function readOffer(env: Env = process.env, now = Date.now()): Offer | null {
  const code = env.CADENCE_OFFER_CODE?.trim() ?? "";
  const label = (env.CADENCE_OFFER_LABEL ?? "").replace(/[\r\n]/g, " ").trim().slice(0, 40);
  const endsAt = parseOfferEnd(env.CADENCE_OFFER_ENDS);
  if (!CODE.test(code) || !label || endsAt === null || endsAt <= now) return null;
  return { code: code.toUpperCase(), label, endsAt, redeemUrl: offerRedeemUrl(code.toUpperCase()) };
}
