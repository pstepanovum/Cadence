// FILE: src/app/(landing)/privacy/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/ui/contact";
import { LegalBody, type LegalSection } from "@/components/ui/legal-page";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Cadence keeps, why, for how long, and how to download or delete it.",
};

const UPDATED = "October 24, 2026";

const sections: LegalSection[] = [
  {
    id: "summary",
    title: "In short",
    body: (
      <>
        <p>Cadence keeps as little as it can. Practice works without an account. A free account keeps one small summary of your progress. Cadence Plus keeps your full history so it can sync between devices. Recordings are never stored. We do not sell data or show ads.</p>
        <p>This policy covers the Cadence website (cadence.pstepanov.dev), the desktop app, and the iPhone app.</p>
      </>
    ),
  },
  {
    id: "no-account",
    title: "Using Cadence without an account",
    body: (
      <p>If you use Cadence without signing in, or on your own Cadence server (the desktop app or a self-hosted copy), your progress stays on your device or that computer. Pairing your phone with your own Cadence sends your practice only to that computer over your local network. Nothing reaches our servers.</p>
    ),
  },
  {
    id: "account",
    title: "What an account keeps",
    body: (
      <>
        <p><strong>Every account:</strong> your email address and a password managed by Firebase Authentication (we never see the password itself), your display name and practice preferences, and one summary document: your streak, total practice minutes, lessons completed per level, placement level, when you last practised, and your 20 most recent results.</p>
        <p><strong>Free accounts</strong> keep nothing else on our servers. Flashcard schedules, every attempt and per-sound scores stay on your device.</p>
        <p><strong>Cadence Plus</strong> also keeps your full progress so it syncs between devices: every practice attempt, the flashcard schedule for each card, scores per sound and per grammar point over time, and coach session summaries and transcripts.</p>
      </>
    ),
  },
  {
    id: "audio",
    title: "Recordings and transcripts",
    body: (
      <>
        <p>Recordings sent for scoring or transcription are limited to 30 seconds and 2 MB, processed in memory, and discarded when the answer is returned. They are never stored.</p>
        <p>Transcripts of what you said are kept only as part of Plus progress (coach sessions and spoken grammar feedback), and never for free accounts.</p>
      </>
    ),
  },
  {
    id: "ai",
    title: "Cloud AI",
    body: (
      <p>For Plus members away from their own Cadence, scoring runs on our servers, and transcription, voices and the coach use Google Cloud (Vertex AI and Cloud Text-to-Speech) under Google Cloud&apos;s data processing terms, which do not let Google use the content to train its models. Lesson text and examples are written ahead of time, so they involve no request about you. Daily limits per person keep the service fair.</p>
    ),
  },
  {
    id: "lapse",
    title: "If Plus ends",
    body: (
      <p>Your summary keeps updating as before. Detailed progress stops syncing and is kept for 90 days, so renewing within that time loses nothing. After 90 days without Plus, the detailed progress is deleted from our servers. What is on your devices stays.</p>
    ),
  },
  {
    id: "payments",
    title: "Payments",
    body: (
      <p>On the web, payments are handled by Stripe; on iPhone, by Apple, with RevenueCat keeping track of the subscription. We never see your card. We store a customer identifier and the state of your subscription (active, renewing, when it ends) so we know whether Plus is on.</p>
    ),
  },
  {
    id: "newsletter",
    title: "Email and the newsletter",
    body: (
      <>
        <p>We send emails your account needs: confirming your address, resetting your password, and receipts or notices about your subscription. They go through Brevo.</p>
        <p>The newsletter (product updates and occasional offers) is opt-in. You are added only after clicking the confirmation link we send, and every newsletter email has an unsubscribe link. You can also turn it off on your <Link href="/account" className="underline">account page</Link>.</p>
      </>
    ),
  },
  {
    id: "connector",
    title: "Connecting an AI app",
    body: (
      <p>If you connect Cadence to an AI app that supports connectors, that app can read your progress overview and streak, look up grammar, run quizzes and add flashcards, and Plus members can let it read detailed history. It happens only after you sign in and approve it, and you can disconnect at any time. What the AI app does with that data is covered by its own policy.</p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>Our database accepts no direct access from apps or browsers; only our servers read and write it. Requests from the apps are checked with Firebase App Check (Apple App Attest on iPhone, reCAPTCHA Enterprise on the web) to keep automated abuse out. Connections use HTTPS. Access tokens for connected AI apps are stored only as one-way hashes.</p>
    ),
  },
  {
    id: "cookies",
    title: "Cookies and local storage",
    body: (
      <p>We use only what the app needs: a sign-in session cookie, your choice of mode and theme, and practice progress saved in your browser. No advertising or cross-site tracking.</p>
    ),
  },
  {
    id: "rights",
    title: "Download or delete your data",
    body: (
      <>
        <p>On your <Link href="/account" className="underline">account page</Link>, <strong>Download my data</strong> gives you everything we keep for your account as a JSON file. <strong>Delete account</strong> removes your account and progress from our servers, removes you from the newsletter, deletes your record at RevenueCat, cancels any web subscription and unlinks your Stripe customer. Stripe keeps invoices for as long as tax law requires. The iPhone app offers the same in its account settings. An Apple subscription must also be cancelled in your iPhone&apos;s Settings.</p>
        <p>You may also ask us to access, correct or delete your data, or object to how it is used, by emailing <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>. We answer within 30 days. In the EU and UK you can also complain to your data protection authority.</p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>Cadence is not directed at children under 13, and we do not knowingly create accounts for them. If you believe a child has an account, email us and we will delete it.</p>,
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>If this policy changes in a way that matters, we will say so in the app or by email before it applies. Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>. Last updated {UPDATED}.</p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Privacy Policy" title="What Cadence keeps, and why.">
        Last updated {UPDATED}.
      </PageIntro>
      <LegalBody sections={sections} />
    </PageShell>
  );
}
