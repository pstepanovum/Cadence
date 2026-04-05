import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/ui/footer";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Cadence collects, uses, and protects your data. Free, open source, and built with minimal data collection.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "What we collect",
    body: `When you create an account, we collect your email address and a securely hashed password via Supabase Auth. We also store your learning progress — which modules you have unlocked, lesson session scores, and streak data — so you can pick up where you left off across devices.

Audio recordings you submit for assessment are processed in real time by the AI engine to extract phoneme data. Audio is not permanently stored on our servers after the assessment is complete.

When you subscribe to Cadence Pro, payment is processed entirely by Stripe. We do not see or store your card number, CVC, or full billing details — only a Stripe customer ID and subscription status are stored in your account metadata.`,
  },
  {
    title: "How we use your data",
    body: `Your email is used to authenticate your account, send transactional messages (e.g. email confirmation, password reset), and deliver billing receipts via Stripe. Your progress data is used solely to power your learning dashboard — we do not sell it or share it with third parties for advertising.

Aggregated, anonymised usage patterns may be used to improve the product, such as identifying which phoneme targets are most commonly practised or which modules have high drop-off rates.`,
  },
  {
    title: "Billing and subscriptions",
    body: `Cadence Pro is a monthly subscription at $14.99/month, with a 7-day free trial. Your card is not charged until the trial ends. You can cancel at any time from your Profile page — cancellation takes effect at the end of the current billing period, and you keep full access until then.

All payment processing is handled by Stripe, Inc. Stripe stores your card details under their own privacy policy (stripe.com/privacy). We receive only a tokenised reference to your payment method. Subscription status events (trial started, payment succeeded, cancellation) are delivered to us via Stripe webhooks and stored on your account to control access.`,
  },
  {
    title: "Cookies and tracking",
    body: `Cadence uses only the cookies necessary for authentication (a Supabase session cookie) and to remember your conversation practice progress (a first-party cookie). We do not use third-party tracking pixels, advertising networks, or cross-site tracking technologies by default.

You can manage optional analytics and marketing preferences at any time via the "Your Privacy Choices" link in the footer.`,
  },
  {
    title: "Third-party services",
    body: `We use the following third-party services:

• Supabase — database and authentication, hosted in the EU. Data is processed under a DPA consistent with GDPR.
• Stripe — payment processing and subscription management. Stripe is PCI DSS Level 1 certified.
• Brevo — transactional email (confirmation, password reset). Email is only sent when you request it or explicitly opt in.

The AI models that power phoneme scoring and the AI coach run locally within our infrastructure and do not transmit your audio or text to third-party AI providers.`,
  },
  {
    title: "Your rights",
    body: `You have the right to access, correct, or delete your personal data at any time. To request a copy of your data or to delete your account, email us at privacy@cadence.app. We will respond within 5 business days.

To cancel your subscription, visit your Profile page — no email required. To request deletion of your Stripe billing records, contact privacy@cadence.app and we will submit a deletion request to Stripe on your behalf.

If you are in the EU or UK, you also have the right to data portability and the right to lodge a complaint with your local data protection authority.`,
  },
  {
    title: "Data retention",
    body: `We retain your account data for as long as your account is active. If you delete your account, all personally identifiable data is removed within 30 days. Stripe billing records are subject to Stripe's own retention policy (typically 7 years for financial records). Anonymised, aggregated usage statistics may be retained indefinitely for product improvement.`,
  },
  {
    title: "Open source",
    body: `Cadence is open source. You can inspect the codebase, including all data-handling logic, on GitHub. We believe transparent code is a meaningful privacy guarantee alongside legal policies.`,
  },
  {
    title: "Changes to this policy",
    body: `If we make material changes to this policy, we will notify you by email (if you have an account) or by posting a prominent notice on the website at least 14 days before the change takes effect. Continued use of Cadence after that date constitutes acceptance of the updated policy.`,
  },
  {
    title: "Contact",
    body: `Questions about privacy? Email privacy@cadence.app or visit our Contact page. For urgent security concerns, email security@cadence.app.`,
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current="home" />

        <section>
          <Card className="bg-hunter-green text-white">
            <div className="space-y-3 px-2 py-2">
              <p className="eyebrow text-sm text-yellow-green/80">Legal</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Privacy Policy
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/78">
                Last updated: April 2026. Cadence is built on minimal data
                collection — we only store what&apos;s needed to make the
                product work.
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.36fr_0.64fr] lg:items-start">
          <Card className="bg-vanilla-cream lg:sticky lg:top-6">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Contents</p>
              <nav>
                <ul className="space-y-1">
                  {sections.map((s) => (
                    <li key={s.title}>
                      <a
                        href={`#${s.title.toLowerCase().replace(/\s+/g, "-")}`}
                        className="text-sm text-iron-grey transition-colors hover:text-hunter-green"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </Card>

          <div className="space-y-4">
            {sections.map((s) => (
              <Card
                key={s.title}
                id={s.title.toLowerCase().replace(/\s+/g, "-")}
                className="bg-white scroll-mt-6"
              >
                <h2 className="text-xl font-semibold text-hunter-green">
                  {s.title}
                </h2>
                <div className="mt-3 space-y-4">
                  {s.body.split("\n\n").map((para, i) => (
                    <p key={i} className="text-sm leading-7 text-iron-grey">
                      {para}
                    </p>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <Card className="bg-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="eyebrow text-sm text-sage-green">Questions?</p>
                <p className="text-sm leading-7 text-iron-grey">
                  Reach out to{" "}
                  <Link
                    href="mailto:privacy@cadence.app"
                    className="font-medium text-hunter-green hover:underline"
                  >
                    privacy@cadence.app
                  </Link>{" "}
                  or visit our Contact page.
                </p>
              </div>
              <Link href="/contact" className={buttonVariants({ variant: "ghost", className: "shrink-0" })}>
                Contact Support
              </Link>
            </div>
          </Card>
        </section>

        <Footer />
      </div>
    </main>
  );
}
