// FILE: src/lib/server/email/templates/engagement.ts
//
// Opt-in mail. Reminders (streak at risk, weekly summary, badges, the inactive
// nudge) go only to learners who turned reminders on; the newsletter only to
// people who confirmed it through Brevo's double opt-in. Every one carries an
// unsubscribe link for its own list, and the footer says why it came.
import {
  BREVO_DOI_PLACEHOLDER,
  appUrl,
  button,
  cleanText,
  compose,
  count,
  escapeHtml,
  firstName,
  heading,
  linkFallback,
  paragraph,
  plural,
  stats,
  type RenderedEmail,
} from "../layout";

const REMINDER_REASON = "You're getting this because you turned on practice reminders in Cadence.";
const NEWSLETTER_REASON = "You're getting this because you subscribed to the Cadence newsletter.";

export interface StreakAtRiskProps {
  name?: string;
  streak: number;
  unsubscribeUrl: string;
}

export function renderStreakAtRisk(props: StreakAtRiskProps): RenderedEmail {
  const name = firstName(props.name);
  const days = count(props.streak);
  const line = `You're on a ${plural(days, "day")} streak. Five minutes today keeps it going.`;
  return compose({
    subject: `Keep your ${plural(days, "day")} streak going`,
    preheader: "Five minutes is enough.",
    body: [heading(name ? `${name}, your streak is waiting` : "Your streak is waiting"), paragraph(escapeHtml(line), { spaceAfter: 20 }), button("Practise for 5 minutes", appUrl("/dashboard"))],
    text: [name ? `${name}, your streak is waiting` : "Your streak is waiting", line, `Practise for 5 minutes: ${appUrl("/dashboard")}`],
    footer: { category: "reminder", reason: REMINDER_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

export interface WeeklySummaryProps {
  name?: string;
  minutes: number;
  activeDays: number;
  streak: number;
  /** One sentence on what to work on next, e.g. "the TH sounds". */
  focus?: string;
  unsubscribeUrl: string;
}

export function renderWeeklySummary(props: WeeklySummaryProps): RenderedEmail {
  const name = firstName(props.name);
  const minutes = count(props.minutes);
  const active = Math.min(7, count(props.activeDays));
  const streak = count(props.streak);
  const focus = cleanText(props.focus, 120);
  const lead = minutes > 0 ? "Here's your week in Cadence." : "A quiet week. A few minutes today is a good restart.";
  const next = focus ? `Next up: ${focus}.` : "Next up: today's plan picks what to practise.";
  return compose({
    subject: minutes > 0 ? `Your week: ${plural(minutes, "minute")} of practice` : "Your week in Cadence",
    preheader: `${plural(active, "active day")}, ${plural(streak, "day")} streak.`,
    body: [heading(name ? `Your week, ${name}` : "Your week"), paragraph(escapeHtml(lead), { spaceAfter: 20 }), stats([{ value: String(minutes), label: "minutes" }, { value: `${active}/7`, label: "active days" }, { value: String(streak), label: "day streak" }]), paragraph(escapeHtml(next), { spaceAfter: 20 }), button("See today's plan", appUrl("/dashboard"))],
    text: [name ? `Your week, ${name}` : "Your week", lead, `Minutes: ${minutes}\nActive days: ${active}/7\nStreak: ${streak}`, next, `See today's plan: ${appUrl("/dashboard")}`],
    footer: { category: "reminder", reason: REMINDER_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

export interface BadgeEarnedProps {
  name?: string;
  badge: string;
  description: string;
  unsubscribeUrl: string;
}

export function renderBadgeEarned(props: BadgeEarnedProps): RenderedEmail {
  const badge = cleanText(props.badge, 60) || "A new badge";
  const description = cleanText(props.description, 160);
  return compose({
    subject: `You earned a badge: ${badge}`,
    preheader: description || "A new badge on your Cadence account.",
    body: [heading(`You earned ${badge}`), description && paragraph(escapeHtml(description)), paragraph("Keep the rhythm going.", { spaceAfter: 20 }), button("See your progress", appUrl("/dashboard"))],
    text: [`You earned ${badge}`, description, "Keep the rhythm going.", `See your progress: ${appUrl("/dashboard")}`],
    footer: { category: "reminder", reason: REMINDER_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

export interface InactiveNudgeProps {
  name?: string;
  daysAway: number;
  unsubscribeUrl: string;
}

export function renderInactiveNudge(props: InactiveNudgeProps): RenderedEmail {
  const name = firstName(props.name);
  const away = count(props.daysAway);
  const line = "Your progress is right where you left it. Today's plan is short and picks up from there.";
  return compose({
    subject: "Your English practice is waiting",
    preheader: "Ten minutes picks up where you left off.",
    body: [heading(name ? `Welcome back, ${name}` : "Ready when you are"), paragraph(`It's been ${escapeHtml(plural(away, "day"))}. ${escapeHtml(line)}`, { spaceAfter: 20 }), button("Start today's plan", appUrl("/dashboard"))],
    text: [name ? `Welcome back, ${name}` : "Ready when you are", `It's been ${plural(away, "day")}. ${line}`, `Start today's plan: ${appUrl("/dashboard")}`],
    footer: { category: "reminder", reason: REMINDER_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

// Newsletter ---------------------------------------------------

export interface NewsletterConfirmProps {
  /**
   * Brevo's `{{ doubleoptin }}` placeholder when uploaded as the DOI template
   * (scripts/email/brevo-doi-template.ts), or a real link in previews.
   */
  confirmUrl?: string;
}

export function renderNewsletterConfirm(props: NewsletterConfirmProps): RenderedEmail {
  const url = props.confirmUrl ?? BREVO_DOI_PLACEHOLDER;
  const what = "About one email a month: new lessons, practice ideas and what changed in Cadence. Nothing else.";
  const ignore = "Didn't sign up? Ignore this email and you won't hear from us.";
  return compose({
    subject: "Confirm your Cadence newsletter subscription",
    preheader: "One tap to confirm.",
    body: [heading("Confirm your subscription"), paragraph(escapeHtml(what), { spaceAfter: 20 }), button("Yes, subscribe me", url), paragraph(escapeHtml(ignore), { muted: true, small: true, spaceBefore: 16, spaceAfter: 20 }), linkFallback(url)],
    text: ["Confirm your subscription", what, `Yes, subscribe me: ${url}`, ignore],
    // Not marketing yet: nobody is on the list until they confirm.
    footer: { category: "transactional", reason: "You're getting this because this address was entered on cadence.pstepanov.dev to get the newsletter." },
  });
}

export interface NewsletterWelcomeProps {
  unsubscribeUrl: string;
}

export function renderNewsletterWelcome(props: NewsletterWelcomeProps): RenderedEmail {
  const line = "You're subscribed. Expect about one email a month with new lessons and practice ideas.";
  const meanwhile = "Meanwhile, every lesson, quiz and the mouth map are free to use.";
  return compose({
    subject: "You're subscribed to the Cadence newsletter",
    preheader: "About one email a month.",
    body: [heading("You're subscribed"), paragraph(escapeHtml(line)), paragraph(escapeHtml(meanwhile), { spaceAfter: 20 }), button("Open Cadence", appUrl("/dashboard"))],
    text: ["You're subscribed", line, meanwhile, `Open Cadence: ${appUrl("/dashboard")}`],
    footer: { category: "marketing", reason: NEWSLETTER_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}
