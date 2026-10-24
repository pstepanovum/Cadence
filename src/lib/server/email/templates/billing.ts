// FILE: src/lib/server/email/templates/billing.ts
//
// Billing email for Cadence Plus, from Stripe (web) and RevenueCat (App Store)
// events. Transactional: every subscriber gets them. App Store trials are
// Apple's to remind about, so `trial-ending` is only ever sent for web trials.
import {
  appUrl,
  button,
  cleanText,
  compose,
  detailRows,
  escapeHtml,
  formatDate,
  formatMoney,
  heading,
  paragraph,
  safeUrl,
  type RenderedEmail,
} from "../layout";

export type BillingStore = "web" | "app_store";

const PLUS_REASON = "You're getting this because you have Cadence Plus.";
const MANAGE_APP_STORE = "App Store subscriptions are managed by Apple: on your iPhone open Settings, tap your name, then Subscriptions.";

export const PLUS_PRODUCTS: Record<string, { label: string; price: string }> = {
  "dev.pstepanov.cadence.plus.monthly": { label: "Cadence Plus, monthly", price: "$14.99 a month" },
  "dev.pstepanov.cadence.plus.yearly": { label: "Cadence Plus, yearly", price: "$99.99 a year" },
};

export function planLabel(productId: unknown): string {
  return (typeof productId === "string" && PLUS_PRODUCTS[productId]?.label) || "Cadence Plus";
}

function priceLabel(productId: unknown): string {
  return (typeof productId === "string" && PLUS_PRODUCTS[productId]?.price) || "";
}

function manageLine(store: BillingStore): string {
  return store === "app_store" ? MANAGE_APP_STORE : "Manage or cancel any time from your account page.";
}

const PLUS_FEATURES = "Cloud scoring, the coach and spoken grammar feedback wherever you are, and your full progress synced across devices.";

// Plus started / trial started ---------------------------------------------------

export interface PlusWelcomeProps {
  productId: string;
  store: BillingStore;
  renewsAt: number | null;
}

export function renderPlusWelcome(props: PlusWelcomeProps): RenderedEmail {
  const plan = planLabel(props.productId);
  const renews = formatDate(props.renewsAt);
  return compose({
    subject: "Welcome to Cadence Plus",
    preheader: "Everything is unlocked on every device.",
    body: [heading("You're on Cadence Plus"), paragraph(escapeHtml(PLUS_FEATURES)), detailRows([["Plan", plan], ["Price", priceLabel(props.productId)], ["Renews", renews]]), paragraph(escapeHtml(manageLine(props.store)), { muted: true, small: true, spaceAfter: 20 }), button("Open Cadence", appUrl("/dashboard"))],
    text: ["You're on Cadence Plus", PLUS_FEATURES, [`Plan: ${plan}`, priceLabel(props.productId) && `Price: ${priceLabel(props.productId)}`, renews && `Renews: ${renews}`].filter(Boolean).join("\n"), manageLine(props.store), `Open Cadence: ${appUrl("/dashboard")}`],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

export interface TrialStartedProps {
  productId: string;
  store: BillingStore;
  trialEndsAt: number;
}

export function renderTrialStarted(props: TrialStartedProps): RenderedEmail {
  const ends = formatDate(props.trialEndsAt);
  const price = priceLabel(props.productId) || "the plan price";
  const charge = `Your free trial runs until ${ends}. After that it becomes ${price} unless you cancel before then.`;
  const reminder = props.store === "web" ? "We'll email you two days before it ends." : MANAGE_APP_STORE;
  return compose({
    subject: "Your Cadence Plus trial has started",
    preheader: `Free until ${ends}.`,
    body: [heading("Your free trial has started"), paragraph(escapeHtml(PLUS_FEATURES)), detailRows([["Plan", planLabel(props.productId)], ["Trial ends", ends]]), paragraph(escapeHtml(charge)), paragraph(escapeHtml(reminder), { muted: true, small: true, spaceAfter: 20 }), button("Open Cadence", appUrl("/dashboard"))],
    text: ["Your free trial has started", PLUS_FEATURES, charge, reminder, `Open Cadence: ${appUrl("/dashboard")}`],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

// Trial ending (web only) ---------------------------------------------------

export interface TrialEndingProps {
  productId: string;
  trialEndsAt: number;
  portalUrl: string;
}

export function renderTrialEnding(props: TrialEndingProps): RenderedEmail {
  const ends = formatDate(props.trialEndsAt);
  const price = priceLabel(props.productId) || "the plan price";
  const line = `Your Cadence Plus trial ends on ${ends}. Then your card is charged ${price}. To keep Plus, do nothing.`;
  const cancel = "To stop before you're charged, cancel from your account.";
  return compose({
    subject: "Your Cadence Plus trial ends in 2 days",
    preheader: `Charged ${price} on ${ends} unless you cancel.`,
    body: [heading("Your trial ends in 2 days"), paragraph(escapeHtml(line)), paragraph(escapeHtml(cancel), { spaceAfter: 20 }), button("Manage subscription", props.portalUrl)],
    text: ["Your trial ends in 2 days", line, cancel, `Manage subscription: ${safeUrl(props.portalUrl)}`],
    footer: { category: "transactional", reason: "You're getting this because you started a Cadence Plus trial on the web." },
  });
}

// Payment receipt ---------------------------------------------------

export interface PaymentReceiptProps {
  productId: string;
  amountMinor: number;
  currency: string;
  paidAt: number;
  /** Stripe's hosted invoice page. */
  invoiceUrl: string;
  invoiceNumber?: string;
}

export function renderPaymentReceipt(props: PaymentReceiptProps): RenderedEmail {
  const amount = formatMoney(props.amountMinor, props.currency);
  const paid = formatDate(props.paidAt);
  const number = cleanText(props.invoiceNumber, 40);
  return compose({
    subject: `Receipt for Cadence Plus: ${amount}`,
    preheader: `Paid ${paid}. Thank you.`,
    body: [heading("Thanks for your payment"), detailRows([["Plan", planLabel(props.productId)], ["Amount", amount], ["Paid", paid], ["Invoice", number]]), button("View receipt", props.invoiceUrl)],
    text: ["Thanks for your payment", [`Plan: ${planLabel(props.productId)}`, `Amount: ${amount}`, `Paid: ${paid}`, number && `Invoice: ${number}`].filter(Boolean).join("\n"), `View receipt: ${safeUrl(props.invoiceUrl)}`],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

// Payment failed ---------------------------------------------------

export interface BillingIssueProps {
  store: BillingStore;
  /** The Customer Portal for web; ignored for the App Store. */
  updateUrl: string;
  /** Plus keeps working until this time while the payment is retried. */
  graceEndsAt: number | null;
}

export function renderBillingIssue(props: BillingIssueProps): RenderedEmail {
  const grace = formatDate(props.graceEndsAt);
  const keep = grace ? `Plus keeps working until ${grace} while we try again.` : "Plus keeps working for now while we try again.";
  const fix = props.store === "app_store" ? "Update your payment method in the App Store: Settings, your name, then Payment & Shipping." : "Update your card to keep Plus without a break.";
  return compose({
    subject: "Your Cadence Plus payment didn't go through",
    preheader: keep,
    body: [heading("Your payment didn't go through"), paragraph(`We couldn't take the latest payment for Cadence Plus. ${escapeHtml(keep)}`), paragraph(escapeHtml(fix), { spaceAfter: props.store === "web" ? 20 : 0 }), props.store === "web" && button("Update card", props.updateUrl)],
    text: ["Your payment didn't go through", `We couldn't take the latest payment for Cadence Plus. ${keep}`, fix, props.store === "web" ? `Update card: ${safeUrl(props.updateUrl)}` : ""],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

// Canceled / expired / changed / refunded ---------------------------------------

export interface PlusCanceledProps {
  store: BillingStore;
  endsAt: number | null;
}

export function renderPlusCanceled(props: PlusCanceledProps): RenderedEmail {
  const ends = formatDate(props.endsAt);
  const line = ends ? `Your Cadence Plus subscription is canceled. You keep Plus until ${ends}.` : "Your Cadence Plus subscription is canceled.";
  const after = "After that, lessons, quizzes, flashcards and the mouth map stay free, and your own Cadence server still runs AI practice for free. Your detailed cloud progress is kept for 90 days in case you come back.";
  const undo = props.store === "web" ? "Changed your mind? You can turn renewal back on before then." : MANAGE_APP_STORE;
  return compose({
    subject: "Your Cadence Plus subscription is canceled",
    preheader: ends ? `Plus stays on until ${ends}.` : "Thanks for trying Plus.",
    body: [heading("Your subscription is canceled"), paragraph(escapeHtml(line)), paragraph(escapeHtml(after)), paragraph(escapeHtml(undo), { muted: true, small: true, spaceAfter: props.store === "web" ? 20 : 0 }), props.store === "web" && button("Keep Plus", appUrl("/account"))],
    text: ["Your subscription is canceled", line, after, undo, props.store === "web" ? `Keep Plus: ${appUrl("/account")}` : ""],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

export interface PlusEndedProps {
  /** When detailed cloud progress is deleted unless Plus comes back. */
  purgeAt: number | null;
}

export function renderPlusEnded(props: PlusEndedProps): RenderedEmail {
  const purge = formatDate(props.purgeAt);
  const line = "Your Cadence Plus subscription has ended. Your streak, totals and recent results stay in your account, and all practice without AI is still free.";
  const keep = purge ? `Your detailed progress is kept until ${purge}. Renew before then and nothing is lost.` : "Your detailed progress is kept for 90 days. Renew before then and nothing is lost.";
  return compose({
    subject: "Your Cadence Plus subscription has ended",
    preheader: "Your practice and streak carry on.",
    body: [heading("Cadence Plus has ended"), paragraph(escapeHtml(line)), paragraph(escapeHtml(keep), { spaceAfter: 20 }), button("Renew Plus", appUrl("/account"))],
    text: ["Cadence Plus has ended", line, keep, `Renew Plus: ${appUrl("/account")}`],
    footer: { category: "transactional", reason: "You're getting this because you had Cadence Plus." },
  });
}

export interface PlanChangedProps {
  fromProductId: string;
  toProductId: string;
  effectiveAt: number | null;
  store: BillingStore;
}

export function renderPlanChanged(props: PlanChangedProps): RenderedEmail {
  const from = planLabel(props.fromProductId);
  const to = planLabel(props.toProductId);
  const when = formatDate(props.effectiveAt);
  return compose({
    subject: "Your Cadence Plus plan has changed",
    preheader: `Now on ${to}.`,
    body: [heading("Your plan has changed"), detailRows([["Was", from], ["Now", to], ["Price", priceLabel(props.toProductId)], ["From", when]]), paragraph(escapeHtml(manageLine(props.store)), { muted: true, small: true, spaceAfter: 0 })],
    text: ["Your plan has changed", [`Was: ${from}`, `Now: ${to}`, priceLabel(props.toProductId) && `Price: ${priceLabel(props.toProductId)}`, when && `From: ${when}`].filter(Boolean).join("\n"), manageLine(props.store)],
    footer: { category: "transactional", reason: PLUS_REASON },
  });
}

export interface RefundIssuedProps {
  amountMinor: number;
  currency: string;
  refundedAt: number;
}

export function renderRefundIssued(props: RefundIssuedProps): RenderedEmail {
  const amount = formatMoney(props.amountMinor, props.currency);
  const line = `We've refunded ${amount} to your original payment method. Banks usually show it within 5 to 10 days.`;
  return compose({
    subject: `Refund issued: ${amount}`,
    preheader: "It should reach you within 5 to 10 days.",
    body: [heading("Your refund is on its way"), paragraph(escapeHtml(line)), detailRows([["Amount", amount], ["Issued", formatDate(props.refundedAt)]])],
    text: ["Your refund is on its way", line, `Issued: ${formatDate(props.refundedAt)}`],
    footer: { category: "transactional", reason: "You're getting this because a Cadence payment was refunded." },
  });
}
