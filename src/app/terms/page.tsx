import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { Footer } from "@/components/ui/footer";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Cadence — free, open source pronunciation practice for non-native English speakers.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "Acceptance of terms",
    body: `By accessing or using Cadence, you agree to these Terms of Service. If you do not agree, do not use the product. These terms apply to all visitors, registered users, and anyone who accesses any part of the service.`,
  },
  {
    title: "The service",
    body: `Cadence is an AI-powered pronunciation practice platform for non-native English speakers. It is free to use and open source. We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable notice.`,
  },
  {
    title: "Accounts",
    body: `You must be at least 13 years old to create an account. You are responsible for keeping your login credentials secure and for all activity that occurs under your account. If you suspect unauthorised access, contact us at support@cadence.app immediately.

You may not create accounts on behalf of others without their consent, impersonate any person, or register with false information.`,
  },
  {
    title: "Acceptable use",
    body: `You agree not to:

— Attempt to reverse-engineer, scrape, or extract training data from the AI models
— Use Cadence to generate, distribute, or promote harmful, abusive, or illegal content
— Probe or test the security of the service without written permission
— Use automated tools to create accounts, submit assessments in bulk, or otherwise abuse the platform

Cadence is open source — contributions and forks are welcome under the project's open source licence. Commercial reuse of the service itself requires separate written agreement.`,
  },
  {
    title: "Intellectual property",
    body: `The Cadence codebase is open source and available under its stated licence on GitHub. The Cadence name, logo, and brand assets are not included under that licence and may not be used without permission.

You retain ownership of any audio you submit. By submitting audio, you grant us a limited licence to process it for the sole purpose of generating phoneme feedback. Audio is not retained after processing is complete.`,
  },
  {
    title: "Disclaimer of warranties",
    body: `Cadence is provided "as is" without warranty of any kind, express or implied. We do not guarantee that the service will be error-free, uninterrupted, or that the phoneme scoring will be accurate for every accent, language background, or recording environment.

Pronunciation feedback is intended as a practice aid, not a substitute for professional language instruction.`,
  },
  {
    title: "Limitation of liability",
    body: `To the maximum extent permitted by applicable law, Cadence and its contributors shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service — including but not limited to loss of data, loss of progress, or interruption of practice.`,
  },
  {
    title: "Termination",
    body: `We may suspend or terminate your account if you violate these terms. You may delete your account at any time by emailing support@cadence.app. Upon termination, your right to use the service ends immediately, but these terms otherwise survive termination.`,
  },
  {
    title: "Governing law",
    body: `These terms are governed by the laws of the European Union, without regard to conflict of law principles. Any disputes shall be resolved in the courts of Amsterdam, the Netherlands, unless otherwise required by local consumer protection law.`,
  },
  {
    title: "Changes to these terms",
    body: `We may update these terms at any time. We will notify you by email or by posting a notice at least 14 days before material changes take effect. Continued use after that date means you accept the updated terms.`,
  },
  {
    title: "Contact",
    body: `Questions about these terms? Email legal@cadence.app or visit our Contact page.`,
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen px-5 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <Navbar current="home" />

        <section>
          <Card className="bg-hunter-green text-white">
            <div className="space-y-3 px-2 py-2">
              <p className="eyebrow text-sm text-yellow-green/80">Legal</p>
              <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
                Terms of Service
              </h1>
              <p className="max-w-2xl text-base leading-8 text-white/78">
                Last updated: April 2026. Please read these terms before using
                Cadence. Using the service means you agree to them.
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
                    <p key={i} className="text-sm leading-7 text-iron-grey whitespace-pre-line">
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
                    href="mailto:legal@cadence.app"
                    className="font-medium text-hunter-green hover:underline"
                  >
                    legal@cadence.app
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
