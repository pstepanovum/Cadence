import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/ui/footer";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Contact Support",
  description:
    "Get in touch with the Cadence team — report a bug, ask a question, or share feedback on the product.",
  robots: { index: true, follow: true },
};

const contactOptions = [
  {
    eyebrow: "Bug reports & feature requests",
    title: "GitHub Issues",
    body: "The best place to report a bug or suggest a feature. Issues are public, so you can see what's already been filed and track progress on fixes.",
    action: { label: "Open an issue", href: "https://github.com/cadence-app/cadence/issues" },
  },
  {
    eyebrow: "General questions",
    title: "Email support",
    body: "For account questions, feedback, or anything that doesn't fit a GitHub issue. Expect a reply within 1–2 business days.",
    action: { label: "Send an email", href: "mailto:support@cadence.app" },
  },
];

const faqs = [
  {
    q: "How do I delete my account?",
    a: 'Email support@cadence.app with your registered email address and the subject line "Delete my account". We\'ll process the request within 5 business days.',
  },
  {
    q: "Can I request a feature?",
    a: 'Yes — open a GitHub issue with the "feature request" label. The roadmap is community-shaped, so upvoted issues move up the build queue.',
  },
  {
    q: "I found a security issue. What should I do?",
    a: "Please disclose it privately by emailing security@cadence.app rather than opening a public issue. We'll respond within 24 hours.",
  },
];

export default function ContactPage() {
  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current="home" />

        <section>
          <Card className="bg-hunter-green text-white">
            <div className="space-y-3 px-2 py-2">
              <p className="eyebrow text-sm text-yellow-green/80">Support</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Contact Support
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/78">
                Report a bug, ask a question, or share feedback. Pick the
                channel that fits best and we&apos;ll get back to you.
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {contactOptions.map((opt) => (
            <Card key={opt.title} className="bg-white">
              <div className="flex h-full flex-col justify-between gap-6">
                <div className="space-y-2">
                  <p className="eyebrow text-sm text-sage-green">{opt.eyebrow}</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">
                    {opt.title}
                  </h2>
                  <p className="text-sm leading-7 text-iron-grey">{opt.body}</p>
                </div>
                <Link
                  href={opt.action.href}
                  className={buttonVariants({ variant: "ghost" })}
                  target={opt.action.href.startsWith("http") ? "_blank" : undefined}
                  rel={opt.action.href.startsWith("http") ? "noopener noreferrer" : undefined}
                >
                  {opt.action.label}
                </Link>
              </div>
            </Card>
          ))}
        </section>

        <section>
          <Card className="bg-vanilla-cream">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Quick answers</p>
              <h2 className="text-2xl font-semibold text-hunter-green">
                Common support questions
              </h2>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {faqs.map((faq) => (
                <div key={faq.q} className="rounded-2xl bg-white px-5 py-4 space-y-2">
                  <p className="text-sm font-semibold text-hunter-green">{faq.q}</p>
                  <p className="text-sm leading-7 text-iron-grey">{faq.a}</p>
                </div>
              ))}
            </div>
          </Card>
        </section>

        <section>
          <Card className="bg-white">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="eyebrow text-sm text-sage-green">Help Center</p>
                <h2 className="text-xl font-semibold text-hunter-green">
                  Looking for self-serve answers?
                </h2>
                <p className="text-sm leading-7 text-iron-grey">
                  The Help Center covers the most common questions about
                  practice, scoring, modules, and your account.
                </p>
              </div>
              <Link href="/help" className={buttonVariants({ variant: "ghost", className: "shrink-0" })}>
                Visit Help Center
              </Link>
            </div>
          </Card>
        </section>

        <Footer />
      </div>
    </main>
  );
}
