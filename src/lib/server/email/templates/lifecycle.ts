// FILE: src/lib/server/email/templates/lifecycle.ts
//
// The first two weeks of an account without Plus (src/lib/server/lifecycle.ts
// decides who gets which, and when):
//
//   day 1    lifecycle-start   the fastest way to start          list: lifecycle
//   day 3    lifecycle-habit   streaks, reminders, daily goal    list: lifecycle
//   day 6    lifecycle-plus    what Plus adds, price and terms   list: lifecycle
//   day 10   sale-offer        the App Store offer code          list: newsletter
//   day 13   sale-reminder     the same offer, ending soon       list: newsletter
//
// Every category is on unless the account turned it off (unset means on, see
// src/lib/platform/email-consent.ts): the tips go to every account without
// Plus that did not turn them off, the sale to every account without Plus
// that did not turn off product news and offers. Every feature named here exists in the app, and
// every price and trial comes from the billing code, not from copy.
import { YEARLY_TRIAL_DAYS } from "../../billing/stripe-map";
import { PLUS_DAILY_LIMITS } from "../../../platform/engine-routing";
import { BADGE_STREAKS } from "../../badges";
import {
  appUrl,
  bigNumber,
  button,
  checklist,
  cleanText,
  compose,
  count,
  detailRows,
  escapeHtml,
  eyebrow,
  firstName,
  formatDate,
  inlineLink,
  withIcon,
  type EmailIcon,
  offerBlock,
  panel,
  paragraph,
  plural,
  safeUrl,
  stats,
  steps,
  type RenderedEmail,
} from "../layout";
import { offerRedeemUrl } from "../offer";
import { PLUS_PRODUCTS } from "./billing";

const TIPS_REASON = "You're getting this because you made a Cadence account. It's one of a few short getting-started emails in your first two weeks.";
const OFFERS_REASON = "You're getting this because product news and offers are on for your Cadence account.";

const MONTHLY = PLUS_PRODUCTS["dev.pstepanov.cadence.plus.monthly"].price;
const YEARLY = PLUS_PRODUCTS["dev.pstepanov.cadence.plus.yearly"].price;

// Day 1: start ------------------------------------------------------------------

export interface LifecycleStartProps {
  name?: string;
  unsubscribeUrl: string;
}

export const START_STEPS = [
  { title: "Pick one sound", body: "Open the mouth map and choose a sound you find hard. It shows where your tongue, lips and jaw go, in American and British English." },
  { title: "Compare it with its neighbour", body: "Compare puts two sounds side by side, like ship and sheep, and shows the one movement that tells them apart." },
  { title: "Review a few flashcards", body: "Flashcards use spaced repetition, so a couple of minutes a day keeps new words from slipping away." },
] as const;

const PLAY_TIP = "On iPhone, the Play tab has five quick word games: flashcards, a meaning quiz, a spelling bee, word scramble and minimal-pair listening.";
const PLACEMENT = "Not taken the placement test yet? It's a short written quiz that sets your level, A1 to C2, so Today's plan fits you.";

export function renderLifecycleStart(props: LifecycleStartProps): RenderedEmail {
  const name = firstName(props.name);
  const lead = "The fastest way into Cadence is one small win. Here's a first session that takes about five minutes and needs nothing set up.";
  const url = appUrl("/sounds");
  const placement = appUrl("/account/level/placement");
  return compose({
    subject: "The fastest way to start with Cadence",
    preheader: "A five-minute first session: one sound, one comparison, a few flashcards.",
    kicker: "",
    title: name ? `${name}, start with five minutes` : "Start with five minutes",
    body: [
      paragraph(escapeHtml(lead), { lead: true, spaceAfter: 24 }),
      bigNumber({ value: "5", label: "minutes, start to finish", caption: "One sound, one comparison, a few cards.", icon: "clock" }),
      steps(START_STEPS),
      button("Open the mouth map", url, { spaceAfter: 20 }),
      paragraph(`${escapeHtml(PLACEMENT)} ${inlineLink("Take it now", placement)}`, { muted: true, small: true, spaceAfter: 28 }),
      panel(withIcon("gamepad", `${eyebrow("Tip", { spaceAfter: 6 })}${paragraph(escapeHtml(PLAY_TIP), { spaceAfter: 0 })}`), { spaceAfter: 0 }),
    ],
    text: [lead, START_STEPS.map((s, i) => `${i + 1}. ${s.title}\n   ${s.body}`).join("\n\n"), `Open the mouth map: ${url}`, `${PLACEMENT} ${placement}`, `Tip: ${PLAY_TIP}`],
    footer: { category: "lifecycle", reason: TIPS_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

// Day 3: habit ------------------------------------------------------------------

export interface LifecycleHabitProps {
  name?: string;
  /** The current streak, in days. */
  streak: number;
  /** Minutes practised since signing up. */
  minutes: number;
  /** Lessons finished since signing up. */
  lessons: number;
  unsubscribeUrl: string;
}

export function habitTips(): { icon: EmailIcon; text: string }[] {
  return [
    { icon: "clock", text: "Practise at about the same time each day. Any day with practice in it counts towards your streak." },
    { icon: "flame", text: "Turn on reminders in the iPhone app's Settings: a daily reminder at the time you choose, and an evening streak check." },
    { icon: "list-checks", text: "Set a daily goal in Settings and let Today's plan fill it. Five minutes is enough on a busy day." },
    { icon: "award", text: `Streaks earn badges at ${BADGE_STREAKS.slice(0, -1).join(", ")} and ${BADGE_STREAKS.at(-1)} days.` },
  ];
}

export function renderLifecycleHabit(props: LifecycleHabitProps): RenderedEmail {
  const name = firstName(props.name);
  const streak = count(props.streak);
  const minutes = count(props.minutes);
  const lessons = count(props.lessons);
  const going = streak >= 2;
  const hero = going
    ? bigNumber({ value: String(streak), label: "day streak", caption: "Practise once today and it keeps growing.", icon: "flame" })
    : bigNumber({ value: "5", label: "minutes a day", caption: "Enough to keep a streak going and hear the difference within a week.", icon: "clock" });
  const lead = going ? "You've started a rhythm. Here's how to keep it without thinking about it." : "Short and daily beats long and rare. Here's how to make practice something you just do.";
  const tips = habitTips();
  const url = appUrl("/today");
  return compose({
    subject: going ? `You're on a ${streak}-day streak. Here's how to keep it` : "Make English practice a daily habit",
    preheader: "Same time each day, a reminder, a small goal. That's the whole trick.",
    kicker: "",
    title: name ? `${name}, make it daily` : "Make it daily",
    body: [
      hero,
      minutes > 0 ? stats([{ value: String(minutes), label: "minutes practised", icon: "clock" }, { value: String(lessons), label: plural(lessons, "lesson").replace(/^\d+ /, "") + " done", icon: "book-open" }]) : false,
      paragraph(escapeHtml(lead), { lead: true, spaceAfter: 20 }),
      checklist(tips),
      button("Practise now", url),
    ],
    text: [
      going ? `Streak: ${streak} days` : "Five minutes a day is enough.",
      minutes > 0 ? `Minutes practised: ${minutes}\nLessons done: ${lessons}` : false,
      lead,
      tips.map((tip) => `- ${tip.text}`).join("\n"),
      `Practise now: ${url}`,
    ],
    footer: { category: "lifecycle", reason: TIPS_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

// Day 6: Plus -------------------------------------------------------------------

export interface LifecyclePlusProps {
  name?: string;
  unsubscribeUrl: string;
}

export const PLUS_BENEFITS: readonly { icon: EmailIcon; text: string }[] = [
  { icon: "mic", text: "Pronunciation scoring down to the sound, on every recording" },
  { icon: "messages-square", text: "The AI coach for open conversation, with spoken grammar feedback" },
  { icon: "audio-lines", text: "Transcription and natural voices, wherever you practise" },
  { icon: "cloud", text: "Your full progress synced across your devices" },
  { icon: "layers", text: "Every sound and grammar point tracked over time" },
];

export function plusTerms(): string {
  return `Plus renews automatically at the plan price until you cancel. The ${YEARLY_TRIAL_DAYS}-day free trial is for the yearly plan and first-time subscribers; cancel before it ends and you won't be charged (on iPhone, at least 24 hours before). Cancel any time: on the web from your account page, on iPhone in Settings, your name, Subscriptions. Prices in US dollars; the App Store shows your local price.`;
}

export function renderLifecyclePlus(props: LifecyclePlusProps): RenderedEmail {
  const name = firstName(props.name);
  const lead = "Lessons, quizzes, flashcards and the mouth map stay free. Plus runs the AI parts on Cadence's servers, so they work wherever you are.";
  const allowance = `Each day includes ${Math.round(PLUS_DAILY_LIMITS.audioSeconds / 60)} minutes of scored audio and ${PLUS_DAILY_LIMITS.coachTurns} coach turns. That's several hours of real practice.`;
  const url = appUrl("/pricing");
  const terms = plusTerms();
  return compose({
    subject: "What Cadence Plus adds to your practice",
    preheader: `Scoring, the AI coach and sync. ${YEARLY_TRIAL_DAYS} days free on the yearly plan.`,
    kicker: "Cadence Plus",
    title: name ? `${name}, practise with AI anywhere` : "Practise with AI anywhere",
    body: [
      paragraph(escapeHtml(lead), { lead: true, spaceAfter: 24 }),
      bigNumber({ value: String(YEARLY_TRIAL_DAYS), label: "days free on yearly", caption: `Then ${YEARLY}, or ${MONTHLY} on the monthly plan.`, icon: "sparkles" }),
      eyebrow("What Plus adds"),
      checklist(PLUS_BENEFITS),
      detailRows([["Monthly", MONTHLY], ["Yearly", YEARLY], ["Free trial", `${YEARLY_TRIAL_DAYS} days, yearly plan`]]),
      paragraph(escapeHtml(allowance), { muted: true, small: true, spaceAfter: 20 }),
      button("See Cadence Plus", url, { spaceAfter: 24 }),
      paragraph(escapeHtml(terms), { muted: true, small: true, spaceAfter: 0 }),
    ],
    text: [
      lead,
      `${YEARLY_TRIAL_DAYS} days free on the yearly plan. Then ${YEARLY}, or ${MONTHLY} on the monthly plan.`,
      `What Plus adds:\n${PLUS_BENEFITS.map((b) => `- ${b.text}`).join("\n")}`,
      allowance,
      `See Cadence Plus: ${url}`,
      terms,
    ],
    footer: { category: "lifecycle", reason: TIPS_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

// Days 10 and 13: the sale --------------------------------------------------------

export interface SaleProps {
  name?: string;
  /** The App Store offer code. */
  code: string;
  /** What it gives, short: "50% off". */
  label: string;
  /** The last moment the code works. */
  endsAt: number;
  unsubscribeUrl: string;
}

const REDEEM_STEPS = [
  { title: "Tap the button on your iPhone", body: "It opens the App Store with the code already filled in." },
  { title: "Check and confirm", body: "Apple shows the offer price and the terms before anything is charged." },
  { title: "Open Cadence", body: "Signed in to this account, Plus turns on straight away." },
] as const;

function saleTerms(ends: string): string {
  return `The code is redeemed in the App Store on iPhone and applies to a Cadence Plus subscription. After the offer period, Plus renews at the regular price (${MONTHLY} or ${YEARLY}) until you cancel in Settings, your name, Subscriptions. The code works until ${ends}.`;
}

const BY_HAND = "Not on your iPhone right now? In the App Store, tap your profile picture, then Redeem Gift Card or Code, and enter the code.";

function saleParts(props: SaleProps) {
  const code = cleanText(props.code, 64).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const label = cleanText(props.label, 40);
  const ends = formatDate(props.endsAt);
  const short = ends.replace(/ \d{4}$/, "");
  return { code, label, ends, short, url: safeUrl(offerRedeemUrl(code)), name: firstName(props.name) };
}

export function renderSaleOffer(props: SaleProps): RenderedEmail {
  const { code, label, ends, short, url, name } = saleParts(props);
  const lead = "Everything that makes practice faster: scoring down to the sound, the AI coach and your progress synced across your devices.";
  return compose({
    subject: `${label} Cadence Plus, until ${short}`,
    preheader: `Use code ${code} in the App Store. Ends ${ends}.`,
    kicker: "Limited-time offer",
    title: name ? `${name}, an offer on Plus` : "An offer on Cadence Plus",
    body: [
      offerBlock({ kicker: "Your App Store code", headline: label, code, ends: `Ends ${ends}` }),
      paragraph(escapeHtml(lead), { lead: true, spaceAfter: 24 }),
      eyebrow("How to redeem"),
      steps(REDEEM_STEPS),
      button("Redeem on iPhone", url, { spaceAfter: 20 }),
      paragraph(escapeHtml(BY_HAND), { muted: true, small: true, spaceAfter: 12 }),
      paragraph(escapeHtml(saleTerms(ends)), { muted: true, small: true, spaceAfter: 0 }),
    ],
    text: [`${label} Cadence Plus with code ${code}. Ends ${ends}.`, lead, REDEEM_STEPS.map((s, i) => `${i + 1}. ${s.title}: ${s.body}`).join("\n"), `Redeem on iPhone: ${url}`, BY_HAND, saleTerms(ends)],
    footer: { category: "marketing", reason: OFFERS_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}

export function renderSaleReminder(props: SaleProps): RenderedEmail {
  const { code, label, ends, short, url, name } = saleParts(props);
  const lead = `One reminder, and that's it: your code still works until ${ends}. After that, Plus is back to its regular price.`;
  return compose({
    subject: `Last days: ${label} Cadence Plus ends ${short}`,
    preheader: `Code ${code} works until ${ends}.`,
    kicker: "Offer ends soon",
    title: name ? `${name}, last call` : "Last call",
    body: [
      offerBlock({ kicker: "Your App Store code", headline: label, code, ends: `Ends ${ends}` }),
      paragraph(escapeHtml(lead), { lead: true, spaceAfter: 20 }),
      button("Redeem on iPhone", url, { spaceAfter: 20 }),
      paragraph(escapeHtml(BY_HAND), { muted: true, small: true, spaceAfter: 12 }),
      paragraph(escapeHtml(saleTerms(ends)), { muted: true, small: true, spaceAfter: 0 }),
    ],
    text: [`${label} Cadence Plus with code ${code}. Ends ${ends}.`, lead, `Redeem on iPhone: ${url}`, BY_HAND, saleTerms(ends)],
    footer: { category: "marketing", reason: OFFERS_REASON, unsubscribeUrl: props.unsubscribeUrl },
  });
}
