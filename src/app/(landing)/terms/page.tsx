// FILE: src/app/(landing)/terms/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/components/ui/contact";
import { GITHUB_URL } from "@/components/ui/footer";
import { LegalBody, type LegalSection } from "@/components/ui/legal-page";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Cadence, including Cadence Plus subscriptions.",
};

const UPDATED = "October 24, 2026";
const mail = <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>;

const sections: LegalSection[] = [
  { id: "acceptance", title: "Agreeing to these terms", body: <p>By using Cadence you agree to these terms. If you do not agree, do not use it. They apply to the website, the desktop app and the iPhone app.</p> },
  {
    id: "service",
    title: "The service",
    body: <p>Cadence is a platform for practising advanced English. Practice without AI is free. Running Cadence on your own computer is free and open source. Cadence Plus is a paid subscription for AI on our servers. We may change or stop parts of the service with reasonable notice.</p>,
  },
  {
    id: "accounts",
    title: "Accounts",
    body: <p>You must be at least 13 to create an account. Keep your password safe; you are responsible for activity on your account. Tell us at {mail} if you think someone else is using it. Do not create accounts for other people without their consent or with false details.</p>,
  },
  {
    id: "plus",
    title: "Cadence Plus subscriptions",
    body: (
      <>
        <p>Plus costs $14.99 per month or $99.99 per year (prices may vary by country and include tax where required). The yearly plan starts with a 7-day free trial for people who have not had one before; you are charged when the trial ends unless you cancel at least 24 hours before.</p>
        <p>Subscriptions renew automatically at the same price for the same period until cancelled. Cancel on the web from your <Link href="/account" className="underline">account page</Link>, or on iPhone in Settings › your name › Subscriptions. Cancelling stops the next renewal; Plus stays on until the end of the period you paid for.</p>
        <p>Purchases on iPhone are made through Apple and are also subject to Apple&apos;s Licensed Application End User License Agreement; refunds for them are handled by Apple. For web purchases, contact us at {mail}.</p>
        <p>Plus includes daily limits on cloud AI (described on the <Link href="/pricing" className="underline">pricing page</Link>) to keep the service fair and running.</p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Do not try to break, overload or probe the security of the service without written permission.</li>
        <li>Do not use automated tools to create accounts or send requests in bulk.</li>
        <li>Do not use the coach or any feature to produce harmful, abusive or illegal content.</li>
      </ul>
    ),
  },
  {
    id: "ip",
    title: "Open source and your content",
    body: (
      <>
        <p>The Cadence code is open source under the MIT licence (<a href={GITHUB_URL} className="underline">source</a>). The Cadence name and logo are not covered by that licence. Third-party material is credited in the project&apos;s CREDITS file under its own licence.</p>
        <p>You keep what you record and write. You let us process it only to give you feedback and keep your progress, as the <Link href="/privacy" className="underline">Privacy Policy</Link> describes.</p>
      </>
    ),
  },
  {
    id: "warranty",
    title: "No guarantees",
    body: <p>Cadence is provided as is. Automatic scoring and feedback can be wrong, especially with unusual accents or noisy recordings. It is a practice aid, not a substitute for a teacher.</p>,
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: <p>As far as the law allows, Cadence and its contributors are not liable for indirect or consequential losses from using the service, including lost progress. Nothing here limits rights you have under consumer law.</p>,
  },
  {
    id: "termination",
    title: "Ending your use",
    body: <p>You can delete your account at any time on your <Link href="/account" className="underline">account page</Link>. We may suspend accounts that break these terms.</p>,
  },
  {
    id: "law",
    title: "Governing law",
    body: <p>These terms are governed by the laws of the European Union and the Netherlands, and disputes go to the courts of Amsterdam, unless your local consumer law says otherwise.</p>,
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: <p>We will tell you at least 14 days before material changes take effect. Questions: {mail}. Last updated {UPDATED}.</p>,
  },
];

export default function TermsPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Terms of Service" title="The terms for using Cadence.">
        Last updated {UPDATED}.
      </PageIntro>
      <LegalBody sections={sections} />
    </PageShell>
  );
}
