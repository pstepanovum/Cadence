// FILE: src/lib/server/email/templates/index.ts
//
// Every Cadence email, by id, with its category and a fixture. The queue
// (../queue.ts) stores a template id and its props; the preview script, the
// test sender and the tests render every entry from its fixture.
import type { EmailCategory, EmailList, RenderedEmail } from "../layout";
import * as account from "./account";
import * as billing from "./billing";
import * as engagement from "./engagement";
import * as security from "./security";

export interface TemplateProps {
  welcome: account.WelcomeProps;
  "verify-email": account.VerifyEmailProps;
  "password-reset": account.PasswordResetProps;
  "password-changed": account.PasswordChangedProps;
  "email-changed": account.EmailChangedProps;
  "new-sign-in": account.NewSignInProps;
  "deletion-scheduled": account.DeletionScheduledProps;
  "account-deleted": account.DeletionCompletedProps;
  "data-export-ready": account.DataExportReadyProps;
  "plus-welcome": billing.PlusWelcomeProps;
  "trial-started": billing.TrialStartedProps;
  "trial-ending": billing.TrialEndingProps;
  "payment-receipt": billing.PaymentReceiptProps;
  "billing-issue": billing.BillingIssueProps;
  "plus-canceled": billing.PlusCanceledProps;
  "plus-ended": billing.PlusEndedProps;
  "plan-changed": billing.PlanChangedProps;
  "refund-issued": billing.RefundIssuedProps;
  "mcp-authorized": security.McpAuthorizedProps;
  "device-paired": security.DevicePairedProps;
  "suspicious-activity": security.SuspiciousActivityProps;
  "streak-at-risk": engagement.StreakAtRiskProps;
  "weekly-summary": engagement.WeeklySummaryProps;
  "badge-earned": engagement.BadgeEarnedProps;
  "inactive-nudge": engagement.InactiveNudgeProps;
  "newsletter-confirm": engagement.NewsletterConfirmProps;
  "newsletter-welcome": engagement.NewsletterWelcomeProps;
}

export type TemplateId = keyof TemplateProps;

export interface TemplateEntry<Id extends TemplateId> {
  id: Id;
  name: string;
  group: "account" | "billing" | "security" | "engagement";
  category: EmailCategory;
  /** The list an opt-in template belongs to; its unsubscribe link leaves that list. */
  list?: EmailList;
  render: (props: TemplateProps[Id]) => RenderedEmail;
  fixture: TemplateProps[Id];
}

const T0 = Date.UTC(2026, 9, 24, 9, 30);
const DAY = 24 * 60 * 60 * 1000;
const UNSUB = "https://cadence.pstepanov.dev/api/email/unsubscribe?token=preview";

export const TEMPLATES: { [Id in TemplateId]: TemplateEntry<Id> } = {
  welcome: { id: "welcome", name: "Welcome", group: "account", category: "transactional", render: account.renderWelcome, fixture: { name: "Maria Lopez" } },
  "verify-email": { id: "verify-email", name: "Verify email", group: "account", category: "transactional", render: account.renderVerifyEmail, fixture: { email: "maria@example.com", verifyUrl: "https://cadence.pstepanov.dev/verify-email?mode=verifyEmail&oobCode=PREVIEW" } },
  "password-reset": { id: "password-reset", name: "Password reset", group: "account", category: "transactional", render: account.renderPasswordReset, fixture: { email: "maria@example.com", resetUrl: "https://cadence.pstepanov.dev/reset-password?mode=resetPassword&oobCode=PREVIEW", expiresInMinutes: 60 } },
  "password-changed": { id: "password-changed", name: "Password changed", group: "account", category: "transactional", render: account.renderPasswordChanged, fixture: { email: "maria@example.com", changedAt: T0 } },
  "email-changed": { id: "email-changed", name: "Email changed", group: "account", category: "transactional", render: account.renderEmailChanged, fixture: { audience: "old", oldEmail: "maria@example.com", newEmail: "maria.lopez@example.org", changedAt: T0 } },
  "new-sign-in": { id: "new-sign-in", name: "New sign-in", group: "account", category: "transactional", render: account.renderNewSignIn, fixture: { device: "Safari on macOS", at: T0 } },
  "deletion-scheduled": { id: "deletion-scheduled", name: "Account deletion scheduled", group: "account", category: "transactional", render: account.renderDeletionScheduled, fixture: { completesBy: T0 + DAY, hadPlus: true } },
  "account-deleted": { id: "account-deleted", name: "Account deleted", group: "account", category: "transactional", render: account.renderDeletionCompleted, fixture: { completedAt: T0 } },
  "data-export-ready": { id: "data-export-ready", name: "Data export ready", group: "account", category: "transactional", render: account.renderDataExportReady, fixture: { downloadUrl: "https://cadence.pstepanov.dev/account?export=ready", expiresAt: T0 + DAY } },
  "plus-welcome": { id: "plus-welcome", name: "Plus started", group: "billing", category: "transactional", render: billing.renderPlusWelcome, fixture: { productId: "dev.pstepanov.cadence.plus.monthly", store: "web", renewsAt: T0 + 30 * DAY } },
  "trial-started": { id: "trial-started", name: "Trial started", group: "billing", category: "transactional", render: billing.renderTrialStarted, fixture: { productId: "dev.pstepanov.cadence.plus.yearly", store: "web", trialEndsAt: T0 + 7 * DAY } },
  "trial-ending": { id: "trial-ending", name: "Trial ending in 2 days", group: "billing", category: "transactional", render: billing.renderTrialEnding, fixture: { productId: "dev.pstepanov.cadence.plus.yearly", trialEndsAt: T0 + 2 * DAY, portalUrl: "https://cadence.pstepanov.dev/account" } },
  "payment-receipt": { id: "payment-receipt", name: "Payment receipt", group: "billing", category: "transactional", render: billing.renderPaymentReceipt, fixture: { productId: "dev.pstepanov.cadence.plus.yearly", amountMinor: 9999, currency: "usd", paidAt: T0, invoiceUrl: "https://invoice.stripe.com/i/preview", invoiceNumber: "CAD-0001" } },
  "billing-issue": { id: "billing-issue", name: "Payment failed", group: "billing", category: "transactional", render: billing.renderBillingIssue, fixture: { store: "web", updateUrl: "https://cadence.pstepanov.dev/account", graceEndsAt: T0 + 7 * DAY } },
  "plus-canceled": { id: "plus-canceled", name: "Subscription canceled", group: "billing", category: "transactional", render: billing.renderPlusCanceled, fixture: { store: "web", endsAt: T0 + 20 * DAY } },
  "plus-ended": { id: "plus-ended", name: "Subscription expired", group: "billing", category: "transactional", render: billing.renderPlusEnded, fixture: { purgeAt: T0 + 90 * DAY } },
  "plan-changed": { id: "plan-changed", name: "Plan changed", group: "billing", category: "transactional", render: billing.renderPlanChanged, fixture: { fromProductId: "dev.pstepanov.cadence.plus.monthly", toProductId: "dev.pstepanov.cadence.plus.yearly", effectiveAt: T0, store: "web" } },
  "refund-issued": { id: "refund-issued", name: "Refund issued", group: "billing", category: "transactional", render: billing.renderRefundIssued, fixture: { amountMinor: 1499, currency: "usd", refundedAt: T0 } },
  "mcp-authorized": { id: "mcp-authorized", name: "Connector authorized", group: "security", category: "transactional", render: security.renderMcpAuthorized, fixture: { clientName: "Study Notes", destination: "notes.example.com", scopes: ["cadence:read", "cadence:write"], at: T0 } },
  "device-paired": { id: "device-paired", name: "Device added", group: "security", category: "transactional", render: security.renderDevicePaired, fixture: { device: "iPhone", platform: "iOS", at: T0 } },
  "suspicious-activity": { id: "suspicious-activity", name: "Suspicious activity", group: "security", category: "transactional", render: security.renderSuspiciousActivity, fixture: { summary: "12 failed sign-ins in an hour", at: T0 } },
  "streak-at-risk": { id: "streak-at-risk", name: "Streak at risk", group: "engagement", category: "reminder", list: "reminders", render: engagement.renderStreakAtRisk, fixture: { name: "Maria", streak: 12, unsubscribeUrl: UNSUB } },
  "weekly-summary": { id: "weekly-summary", name: "Weekly summary", group: "engagement", category: "reminder", list: "reminders", render: engagement.renderWeeklySummary, fixture: { name: "Maria", minutes: 86, activeDays: 5, streak: 12, focus: "the TH sounds in think and this", unsubscribeUrl: UNSUB } },
  "badge-earned": { id: "badge-earned", name: "Badge earned", group: "engagement", category: "reminder", list: "reminders", render: engagement.renderBadgeEarned, fixture: { name: "Maria", badge: "Two-week streak", description: "14 days of practice in a row.", unsubscribeUrl: UNSUB } },
  "inactive-nudge": { id: "inactive-nudge", name: "Inactive nudge", group: "engagement", category: "reminder", list: "reminders", render: engagement.renderInactiveNudge, fixture: { name: "Maria", daysAway: 9, unsubscribeUrl: UNSUB } },
  "newsletter-confirm": { id: "newsletter-confirm", name: "Newsletter confirmation", group: "engagement", category: "transactional", render: engagement.renderNewsletterConfirm, fixture: { confirmUrl: "https://cadence.pstepanov.dev/newsletter/confirmed" } },
  "newsletter-welcome": { id: "newsletter-welcome", name: "Newsletter welcome", group: "engagement", category: "marketing", list: "newsletter", render: engagement.renderNewsletterWelcome, fixture: { unsubscribeUrl: UNSUB } },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export function isTemplateId(value: unknown): value is TemplateId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TEMPLATES, value);
}

export function renderTemplate<Id extends TemplateId>(id: Id, props: TemplateProps[Id]): RenderedEmail {
  return (TEMPLATES[id] as TemplateEntry<Id>).render(props);
}

export function renderFixture(id: TemplateId): RenderedEmail {
  const entry = TEMPLATES[id] as TemplateEntry<TemplateId>;
  return (entry.render as (props: unknown) => RenderedEmail)(entry.fixture);
}
