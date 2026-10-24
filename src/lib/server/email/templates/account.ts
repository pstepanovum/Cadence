// FILE: src/lib/server/email/templates/account.ts
//
// Account email: every signed-up learner gets these, so they come from the
// transactional sender with no unsubscribe link. Each template is a pure
// function of its typed props.
import {
  appUrl,
  button,
  cleanText,
  compose,
  detailRows,
  escapeHtml,
  firstName,
  formatDate,
  formatDateTime,
  heading,
  linkFallback,
  paragraph,
  safeUrl,
  steps,
  strong,
  type RenderedEmail,
} from "../layout";

const ACCOUNT_REASON = "You're getting this because you have a Cadence account.";

function lifetime(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) return minutes === 60 ? "an hour" : `${minutes / 60} hours`;
  return `${minutes} minutes`;
}

// Welcome -----------------------------------------------------------------------

export interface WelcomeProps {
  name?: string;
}

export const WELCOME_STEPS = [
  { title: "Take the placement test", body: "Ten minutes of questions and one short spoken answer to find your level." },
  { title: "Follow today's plan", body: "A 10 to 15 minute mix of sounds, grammar and review, picked for you each day." },
  { title: "Open the mouth map", body: "See where your tongue and lips go for any sound, then record and compare." },
] as const;

export function renderWelcome(props: WelcomeProps): RenderedEmail {
  const name = firstName(props.name);
  const url = appUrl("/dashboard");
  const intro = "Cadence helps you sound clear and confident in English, a few minutes a day. Here is how to start.";
  return compose({
    subject: name ? `Welcome to Cadence, ${name}` : "Welcome to Cadence",
    preheader: "Three first steps, about ten minutes in all.",
    body: [heading(name ? `Welcome, ${name}` : "Welcome to Cadence"), paragraph(escapeHtml(intro), { spaceAfter: 24 }), steps(WELCOME_STEPS), button("Start the placement test", appUrl("/placement"))],
    text: [name ? `Welcome, ${name}` : "Welcome to Cadence", intro, WELCOME_STEPS.map((s, i) => `${i + 1}. ${s.title}\n   ${s.body}`).join("\n\n"), `Start the placement test: ${appUrl("/placement")}`, `Your dashboard: ${url}`],
    footer: { category: "transactional", reason: "You're getting this because you just made a Cadence account." },
  });
}

// Verify email ------------------------------------------------------------------

export interface VerifyEmailProps {
  email: string;
  verifyUrl: string;
}

export function renderVerifyEmail(props: VerifyEmailProps): RenderedEmail {
  const email = cleanText(props.email, 254);
  const url = safeUrl(props.verifyUrl);
  const ignore = "If you didn't make a Cadence account, you can ignore this email.";
  return compose({
    subject: "Confirm your email for Cadence",
    preheader: "One tap to confirm it's really you.",
    body: [heading("Confirm your email"), paragraph(`Tap below to confirm ${strong(email)} for your Cadence account.`), button("Confirm email", url), paragraph(escapeHtml(ignore), { muted: true, small: true, spaceBefore: 16, spaceAfter: 20 }), linkFallback(url)],
    text: ["Confirm your email", `Confirm ${email} for your Cadence account: ${url}`, ignore],
    footer: { category: "transactional", reason: "You're getting this because this address was used to sign up for Cadence." },
  });
}

// Password reset ------------------------------------------------------------------

export interface PasswordResetProps {
  email: string;
  /** Our /reset-password link carrying Firebase's one-time code. */
  resetUrl: string;
  expiresInMinutes?: number;
}

export function renderPasswordReset(props: PasswordResetProps): RenderedEmail {
  const email = cleanText(props.email, 254);
  const url = safeUrl(props.resetUrl);
  const expires = lifetime(Math.max(1, Math.round(props.expiresInMinutes ?? 60)));
  const expiry = `The link works for ${expires}, and only once.`;
  const ignore = "Didn't ask for this? Ignore this email. Your password stays as it is.";
  return compose({
    subject: "Reset your Cadence password",
    preheader: expiry,
    body: [heading("Reset your password"), paragraph(`Someone asked to reset the password for ${strong(email)}. If that was you, choose a new one.`), button("Choose a new password", url), paragraph(escapeHtml(expiry), { muted: true, small: true, spaceBefore: 16, spaceAfter: 8 }), paragraph(escapeHtml(ignore), { muted: true, small: true, spaceAfter: 20 }), linkFallback(url)],
    text: ["Reset your password", `Someone asked to reset the password for ${email}. If that was you, choose a new one: ${url}`, expiry, ignore],
    footer: { category: "transactional", reason: "You're getting this because a password reset was requested for your Cadence account." },
  });
}

// Password changed ------------------------------------------------------------------

export interface PasswordChangedProps {
  email: string;
  changedAt: number;
}

export function renderPasswordChanged(props: PasswordChangedProps): RenderedEmail {
  const when = formatDateTime(props.changedAt);
  const notYou = "If this wasn't you, reset your password now. That signs out every device.";
  return compose({
    subject: "Your Cadence password was changed",
    preheader: "If this was you, there's nothing to do.",
    body: [heading("Your password was changed"), paragraph(`The password for ${strong(cleanText(props.email, 254))} was changed${when ? ` on ${escapeHtml(when)}` : ""}. If this was you, there's nothing to do.`), paragraph(escapeHtml(notYou), { muted: true, spaceAfter: 20 }), button("Reset password", appUrl("/forgot-password"))],
    text: ["Your password was changed", `The password for ${cleanText(props.email, 254)} was changed${when ? ` on ${when}` : ""}. If this was you, there's nothing to do.`, notYou, `Reset password: ${appUrl("/forgot-password")}`],
    footer: { category: "transactional", reason: ACCOUNT_REASON },
  });
}

// Email changed ------------------------------------------------------------------

export interface EmailChangedProps {
  /** Who this copy goes to: the address that was replaced, or the new one. */
  audience: "old" | "new";
  oldEmail: string;
  newEmail: string;
  changedAt: number;
}

export function renderEmailChanged(props: EmailChangedProps): RenderedEmail {
  const oldEmail = cleanText(props.oldEmail, 254);
  const newEmail = cleanText(props.newEmail, 254);
  const when = formatDateTime(props.changedAt);
  const isOld = props.audience === "old";
  const lead = isOld
    ? `Your Cadence sign-in email was changed from ${strong(oldEmail)} to ${strong(newEmail)}.`
    : `${strong(newEmail)} is now the sign-in email for your Cadence account.`;
  const leadText = isOld ? `Your Cadence sign-in email was changed from ${oldEmail} to ${newEmail}.` : `${newEmail} is now the sign-in email for your Cadence account.`;
  const notYou = isOld
    ? "If you didn't make this change, reply to this email right away and we'll help you get your account back."
    : "From now on, account and billing email comes here.";
  return compose({
    subject: isOld ? "Your Cadence email was changed" : "Your new Cadence email is confirmed",
    preheader: isOld ? `Account email now ${newEmail}.` : "Account email will come here from now on.",
    body: [heading(isOld ? "Your email was changed" : "New email confirmed"), paragraph(lead), detailRows([["Changed", when]]), paragraph(escapeHtml(notYou), { muted: !isOld, spaceAfter: 0 })],
    text: [isOld ? "Your email was changed" : "New email confirmed", leadText, when ? `Changed: ${when}` : "", notYou],
    footer: { category: "transactional", reason: isOld ? "You're getting this because this address was the sign-in email for a Cadence account." : ACCOUNT_REASON },
  });
}

// New sign-in ------------------------------------------------------------------

export interface NewSignInProps {
  device: string;
  approximateLocation?: string;
  at: number;
}

export function renderNewSignIn(props: NewSignInProps): RenderedEmail {
  const device = cleanText(props.device, 80) || "A new device";
  const where = cleanText(props.approximateLocation, 80);
  const when = formatDateTime(props.at);
  const notYou = "Not you? Change your password now. That signs out every device, including this one.";
  return compose({
    subject: "New sign-in to your Cadence account",
    preheader: `${device}${when ? `, ${when}` : ""}`,
    body: [heading("New sign-in"), paragraph("Your Cadence account was just used on a device we haven't seen before."), detailRows([["Device", device], ["Where", where], ["When", when]]), paragraph(escapeHtml(notYou), { muted: true, spaceAfter: 20 }), button("Change password", appUrl("/forgot-password"))],
    text: ["New sign-in", "Your Cadence account was just used on a device we haven't seen before.", [`Device: ${device}`, where && `Where: ${where}`, when && `When: ${when}`].filter(Boolean).join("\n"), notYou, `Change password: ${appUrl("/forgot-password")}`],
    footer: { category: "transactional", reason: "You're getting this because we let you know about every new device on your account." },
  });
}

// Deletion ------------------------------------------------------------------

export interface DeletionScheduledProps {
  /** When the deletion finishes; it usually runs within minutes. */
  completesBy: number;
  hadPlus: boolean;
}

export function renderDeletionScheduled(props: DeletionScheduledProps): RenderedEmail {
  const by = formatDate(props.completesBy);
  const billing = props.hadPlus
    ? "Your Cadence Plus subscription is canceled with it. App Store subscriptions are managed by Apple: check Settings, then your name, then Subscriptions."
    : "";
  const notYou = "If you didn't ask for this, reply to this email straight away.";
  return compose({
    subject: "Your Cadence account is being deleted",
    preheader: by ? `Everything is removed by ${by}.` : "Everything is being removed.",
    body: [heading("We're deleting your account"), paragraph(`As you asked, we're removing your Cadence account and all its progress${by ? ` by ${escapeHtml(by)}` : ""}. You'll get one more email when it's done.`), billing && paragraph(escapeHtml(billing)), paragraph(escapeHtml(notYou), { muted: true, small: true, spaceAfter: 0 })],
    text: ["We're deleting your account", `As you asked, we're removing your Cadence account and all its progress${by ? ` by ${by}` : ""}. You'll get one more email when it's done.`, billing, notYou],
    footer: { category: "transactional", reason: "You're getting this because you asked us to delete your Cadence account." },
  });
}

export interface DeletionCompletedProps {
  completedAt: number;
}

export function renderDeletionCompleted(props: DeletionCompletedProps): RenderedEmail {
  const when = formatDate(props.completedAt);
  const kept = "Invoices for past payments are kept for tax records, as the law requires. Nothing else remains.";
  return compose({
    subject: "Your Cadence account has been deleted",
    preheader: "Your account and progress are gone.",
    body: [heading("Your account is deleted"), paragraph(`Your Cadence account and its progress were removed${when ? ` on ${escapeHtml(when)}` : ""}. This is the last email you'll get from us.`), paragraph(escapeHtml(kept), { muted: true, small: true, spaceAfter: 20 }), paragraph("Thanks for practising with Cadence. You're welcome back any time.", { spaceAfter: 0 })],
    text: ["Your account is deleted", `Your Cadence account and its progress were removed${when ? ` on ${when}` : ""}. This is the last email you'll get from us.`, kept, "Thanks for practising with Cadence. You're welcome back any time."],
    footer: { category: "transactional", reason: "You're getting this because your Cadence account was deleted." },
  });
}

// Data export ------------------------------------------------------------------

export interface DataExportReadyProps {
  downloadUrl: string;
  expiresAt: number;
}

export function renderDataExportReady(props: DataExportReadyProps): RenderedEmail {
  const url = safeUrl(props.downloadUrl, appUrl("/account"));
  const expires = formatDateTime(props.expiresAt);
  const note = `The file is JSON: your profile, progress, flashcards and settings. The link works until ${expires || "it expires"} and only while you're signed in.`;
  return compose({
    subject: "Your Cadence data is ready",
    preheader: "Download your progress as a JSON file.",
    body: [heading("Your data is ready"), paragraph("The copy of your Cadence data you asked for is ready to download."), button("Download my data", url), paragraph(escapeHtml(note), { muted: true, small: true, spaceBefore: 16, spaceAfter: 20 }), linkFallback(url)],
    text: ["Your data is ready", "The copy of your Cadence data you asked for is ready to download.", `Download: ${url}`, note],
    footer: { category: "transactional", reason: "You're getting this because you asked for a copy of your Cadence data." },
  });
}
