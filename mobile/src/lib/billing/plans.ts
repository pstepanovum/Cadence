// Cadence Plus plans and the store's error codes, as plain data and pure
// functions (no SDK import), so they are unit tested (tests/billing.test.ts).
// docs/PLATFORM.md, section 4.2.

export const PLUS_ENTITLEMENT = "plus";
export const PLUS_OFFERING = "default";

export const PLUS_PRODUCTS = {
  monthly: "dev.pstepanov.cadence.plus.monthly",
  yearly: "dev.pstepanov.cadence.plus.yearly",
} as const;

export type PlusPlanId = keyof typeof PLUS_PRODUCTS;

export interface PlusPlan {
  id: PlusPlanId;
  productId: string;
  price: number;
  priceString: string;
  /** Days of free trial this Apple Account would get, 0 when none. */
  trialDays: number;
}

/** Which plan a RevenueCat package is, by its package type or product id. */
export function planForPackage(packageId: string, productId: string): PlusPlanId | null {
  if (productId === PLUS_PRODUCTS.monthly || packageId === "$rc_monthly") return "monthly";
  if (productId === PLUS_PRODUCTS.yearly || packageId === "$rc_annual") return "yearly";
  return null;
}

/** Yearly first: it is the better deal and the one with the trial. */
export function sortPlans<T extends { id: PlusPlanId }>(plans: readonly T[]): T[] {
  const order: Record<PlusPlanId, number> = { yearly: 0, monthly: 1 };
  return [...plans].sort((a, b) => order[a.id] - order[b.id]);
}

/** Whole percent the yearly plan saves over twelve months, rounded down; null when not worth saying. */
export function yearlySavingsPercent(monthly?: number, yearly?: number): number | null {
  if (!monthly || !yearly || monthly <= 0 || yearly <= 0) return null;
  const percent = Math.floor((1 - yearly / (monthly * 12)) * 100);
  return percent >= 1 && percent < 100 ? percent : null;
}

/** Shown when the store cannot be reached or a build has no store key. */
export const FALLBACK_PLANS: PlusPlan[] = [
  { id: "yearly", productId: PLUS_PRODUCTS.yearly, price: 99.99, priceString: "$99.99", trialDays: 7 },
  { id: "monthly", productId: PLUS_PRODUCTS.monthly, price: 14.99, priceString: "$14.99", trialDays: 0 },
];

/** RevenueCat's PURCHASES_ERROR_CODE string values. */
export const STORE_ERROR_CODES = {
  cancelled: "1",
  notAllowed: "3",
  alreadyPurchased: "6",
  network: "10",
  paymentPending: "20",
  offline: "35",
} as const;

const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

export function isCancelled(error: unknown): boolean {
  return Boolean((error as { userCancelled?: boolean } | null)?.userCancelled) || codeOf(error) === STORE_ERROR_CODES.cancelled;
}

export function isPaymentPending(error: unknown): boolean {
  return codeOf(error) === STORE_ERROR_CODES.paymentPending;
}

export function purchaseMessage(error: unknown): string {
  switch (codeOf(error)) {
    case STORE_ERROR_CODES.network:
    case STORE_ERROR_CODES.offline:
      return "You're offline. Connect to the internet and try again.";
    case STORE_ERROR_CODES.paymentPending:
      return "Your purchase is waiting for approval. Plus turns on as soon as it's approved.";
    case STORE_ERROR_CODES.notAllowed:
      return "Purchases aren't allowed on this device. Check Screen Time settings.";
    case STORE_ERROR_CODES.alreadyPurchased:
      return "You already have Plus with this Apple Account. Tap Restore purchases.";
    default:
      return "The purchase didn't go through. You weren't charged. Try again.";
  }
}

export interface StoreStatus {
  active: boolean;
  productId?: string;
  expiresAt: number | null;
  willRenew: boolean;
  trial: boolean;
}

export const NO_STORE_STATUS: StoreStatus = { active: false, expiresAt: null, willRenew: false, trial: false };

/** "Renews on 3 March" / "Ends on 3 March" / "Trial ends on 3 March". */
export function renewalLine(status: { expiresAt: number | null; willRenew: boolean; trial?: boolean }, locale = "en-US"): string | null {
  if (status.expiresAt === null) return null;
  const date = new Date(status.expiresAt).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  if (status.trial) return status.willRenew ? `Free trial until ${date}, then Plus renews.` : `Free trial ends on ${date}.`;
  return status.willRenew ? `Renews on ${date}.` : `Ends on ${date}.`;
}
