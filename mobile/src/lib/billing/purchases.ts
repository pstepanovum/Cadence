// Buying Cadence Plus in the iOS app through RevenueCat (docs/PLATFORM.md,
// section 4.2). The Firebase uid is the RevenueCat app user id, so a purchase
// follows the account and the server's webhook can find it: the app calls
// logIn after sign-in and logOut on sign-out, one change at a time.
//
// The server stays the source of truth for Plus (GET /api/me); what the store
// says here only updates the screen the moment a purchase completes.
//
// A build without EXPO_PUBLIC_REVENUECAT_IOS_KEY never configures the SDK and
// its paywall says purchases are unavailable. EXPO_PUBLIC_PURCHASES_STUB=1
// swaps in an offline stub for simulator flows; it changes only what this
// phone shows, never the account.
import { Platform } from "react-native";
import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";

import {
  FALLBACK_PLANS,
  isCancelled,
  isPaymentPending,
  NO_STORE_STATUS,
  PLUS_ENTITLEMENT,
  PLUS_OFFERING,
  planForPackage,
  purchaseMessage,
  sortPlans,
  type PlusPlan,
  type PlusPlanId,
  type StoreStatus,
} from "@/lib/billing/plans";

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY?.trim() ?? "";
export const purchasesStubbed = process.env.EXPO_PUBLIC_PURCHASES_STUB === "1";

/** Whether this build can sell Plus at all. */
export const storeConfigured = purchasesStubbed || (Platform.OS === "ios" && API_KEY.length > 0);

export class PurchaseError extends Error {
  readonly pending: boolean;
  constructor(message: string, pending = false) {
    super(message);
    this.pending = pending;
  }
}

let configured = false;
let chain: Promise<unknown> = Promise.resolve();
const packages = new Map<PlusPlanId, PurchasesPackage>();
let stubStatus: StoreStatus = NO_STORE_STATUS;
const stubListeners = new Set<(status: StoreStatus) => void>();

function configure(): boolean {
  if (purchasesStubbed) return false;
  if (!storeConfigured) return false;
  if (!configured) {
    Purchases.configure({ apiKey: API_KEY });
    configured = true;
  }
  return true;
}

function serial<T>(task: () => Promise<T>): Promise<T> {
  const next = chain.then(task, task);
  chain = next.catch(() => undefined);
  return next;
}

function statusFrom(info: CustomerInfo): StoreStatus {
  const entitlement = info.entitlements.active[PLUS_ENTITLEMENT];
  if (!entitlement?.isActive) return NO_STORE_STATUS;
  return {
    active: true,
    productId: entitlement.productIdentifier,
    expiresAt: entitlement.expirationDateMillis ?? null,
    willRenew: entitlement.willRenew,
    trial: entitlement.periodType?.toUpperCase() === "TRIAL",
  };
}

/** Points the store at the signed-in account. */
export function signInToStore(uid: string): Promise<StoreStatus | null> {
  if (purchasesStubbed) return Promise.resolve(stubStatus);
  if (!configure()) return Promise.resolve(null);
  return serial(async () => statusFrom((await Purchases.logIn(uid)).customerInfo));
}

/** Forgets the account on sign-out, so the next one starts clean. */
export function signOutOfStore(): Promise<void> {
  if (purchasesStubbed) {
    stubStatus = NO_STORE_STATUS;
    return Promise.resolve();
  }
  if (!configured) return Promise.resolve();
  return serial(async () => {
    if (await Purchases.isAnonymous()) return;
    await Purchases.logOut();
  });
}

export function onStoreStatus(listener: (status: StoreStatus) => void): () => void {
  if (purchasesStubbed) {
    stubListeners.add(listener);
    return () => stubListeners.delete(listener);
  }
  if (!configure()) return () => undefined;
  const handle = (info: CustomerInfo) => listener(statusFrom(info));
  Purchases.addCustomerInfoUpdateListener(handle);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(handle);
  };
}

/** The plans in the default offering, priced for the learner's country. */
export async function loadPlans(): Promise<PlusPlan[]> {
  if (purchasesStubbed) return FALLBACK_PLANS;
  if (!configure()) return [];
  const offerings = await Purchases.getOfferings();
  const offering = offerings.all[PLUS_OFFERING] ?? offerings.current;
  packages.clear();
  const plans: PlusPlan[] = [];
  for (const entry of offering?.availablePackages ?? []) {
    const id = planForPackage(entry.identifier, entry.product.identifier);
    if (!id || packages.has(id)) continue;
    packages.set(id, entry);
    plans.push({ id, productId: entry.product.identifier, price: entry.product.price, priceString: entry.product.priceString, trialDays: 0 });
  }
  // A trial shows only to someone who would actually get it.
  const withIntro = [...packages.values()].filter((entry) => entry.product.introPrice?.price === 0);
  if (withIntro.length) {
    const eligibility = await Purchases.checkTrialOrIntroductoryPriceEligibility(withIntro.map((e) => e.product.identifier)).catch(() => ({}));
    for (const plan of plans) {
      const entry = packages.get(plan.id);
      const status = (eligibility as Record<string, { status?: unknown }>)[plan.productId]?.status;
      const intro = entry?.product.introPrice;
      if (intro && intro.price === 0 && status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE) {
        const unit = String(intro.periodUnit).toUpperCase();
        plan.trialDays = intro.periodNumberOfUnits * (unit === "WEEK" ? 7 : unit === "MONTH" ? 30 : 1);
      }
    }
  }
  return sortPlans(plans);
}

/** Buys a plan. Null when the learner cancels; throws PurchaseError with a calm message otherwise. */
export async function purchasePlan(id: PlusPlanId): Promise<StoreStatus | null> {
  if (purchasesStubbed) {
    stubStatus = { active: true, productId: id, expiresAt: Date.now() + 7 * 86_400_000, willRenew: true, trial: id === "yearly" };
    for (const listener of stubListeners) listener(stubStatus);
    return stubStatus;
  }
  if (!configure()) throw new PurchaseError("Purchases aren't available in this build.");
  const entry = packages.get(id);
  if (!entry) throw new PurchaseError("That plan isn't available right now. Try again in a moment.");
  try {
    // Queued behind a pending logIn, so the purchase lands on the account.
    return await serial(async () => statusFrom((await Purchases.purchasePackage(entry)).customerInfo));
  } catch (error) {
    if (isCancelled(error)) return null;
    throw new PurchaseError(purchaseMessage(error), isPaymentPending(error));
  }
}

export async function restorePurchases(): Promise<StoreStatus> {
  if (purchasesStubbed) return stubStatus;
  if (!configure()) throw new PurchaseError("Purchases aren't available in this build.");
  try {
    return await serial(async () => statusFrom(await Purchases.restorePurchases()));
  } catch (error) {
    throw new PurchaseError(purchaseMessage(error));
  }
}

/** Opens the App Store's own subscription management. */
export async function manageSubscription(): Promise<void> {
  if (!configure()) return;
  await Purchases.showManageSubscriptions();
}
