// FILE: src/app/(landing)/support/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/components/ui/contact";
import { GITHUB_URL } from "@/components/ui/footer";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Support",
  description: "Help with your Cadence account, subscription, your own Cadence server and the apps.",
};

const TOPICS: { title: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    title: "Account",
    items: [
      { q: "I forgot my password.", a: <>Use <Link href="/forgot-password" className="underline">Reset your password</Link>. The link in the email works for an hour.</> },
      { q: "I did not get the confirmation email.", a: <>Check spam, then send it again from <Link href="/verify-email" className="underline">Confirm your email</Link>. Your account works meanwhile.</> },
      { q: "How do I download or delete my data?", a: <>On your <Link href="/account" className="underline">account page</Link>: Download my data, then Delete account. In the iPhone app the same options are in your account settings.</> },
    ],
  },
  {
    title: "Cadence Plus",
    items: [
      { q: "How do I cancel?", a: <>Bought on the web: <Link href="/account" className="underline">account page</Link> › Manage or cancel. Bought on iPhone: Settings › your name › Subscriptions › Cadence. Plus stays on until the end of the paid period.</> },
      { q: "How do I get a refund?", a: <>For the web, email us. For iPhone purchases, Apple handles refunds at reportaproblem.apple.com.</> },
      { q: "I subscribed on iPhone; why does the website not show Plus?", a: <>Sign in with the same account on both. Plus follows your account wherever you bought it. On iPhone, Restore Purchases in the app fixes a subscription that did not attach.</> },
      { q: "It says the daily limit is reached.", a: <>Plus includes generous daily cloud AI limits that reset at midnight UTC. Your own Cadence on your computer has no limit.</> },
    ],
  },
  {
    title: "Your own Cadence",
    items: [
      { q: "How do I connect my phone?", a: <>Install the <Link href="/download" className="underline">desktop app</Link>, choose Phone › Connect a Phone, and scan the code with the Cadence app on the same Wi-Fi. See <Link href="/connect-phone" className="underline">Connect your phone</Link>.</> },
      { q: "My phone cannot find my computer.", a: <>Both must be on the same Wi-Fi, and the computer awake with Cadence open. Guest networks often block devices from seeing each other.</> },
      { q: "Does it cost anything?", a: <>No. Running Cadence yourself is free forever and open source.</> },
    ],
  },
  {
    title: "Recording",
    items: [
      { q: "Cadence cannot hear me.", a: <>Allow microphone access for Cadence in your browser or device settings, then reload. Recordings are at most 30 seconds.</> },
    ],
  },
];

export default function SupportPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Support" title="How can we help?">
        Most answers are below. If not, email us and a person replies, usually within two working days.
      </PageIntro>
      <section className="grid gap-4 md:grid-cols-2">
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-hunter-green">Email</h2>
          <p className="mt-1 text-sm leading-6 text-iron-grey">Accounts, billing, privacy requests, anything else.</p>
          <Button href={`mailto:${SUPPORT_EMAIL}`} className="mt-4">{SUPPORT_EMAIL}</Button>
        </Card>
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-hunter-green">Bugs and ideas</h2>
          <p className="mt-1 text-sm leading-6 text-iron-grey">Cadence is open source. Report a bug or suggest a feature in public.</p>
          <Button href={`${GITHUB_URL}/issues`} variant="ghost" className="mt-4">Open an issue</Button>
        </Card>
      </section>
      {TOPICS.map((topic) => (
        <Card key={topic.title} className="bg-white">
          <h2 className="font-kicker text-2xl text-hunter-green">{topic.title}</h2>
          <dl className="mt-3 divide-y divide-platinum">
            {topic.items.map((item) => (
              <div key={item.q} className="py-3">
                <dt className="font-semibold text-hunter-green">{item.q}</dt>
                <dd className="mt-1 text-sm leading-7 text-iron-grey">{item.a}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </PageShell>
  );
}
