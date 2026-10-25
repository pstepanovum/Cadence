// FILE: src/app/(landing)/newsletter/page.tsx
import type { Metadata } from "next";
import { NewsletterForm } from "@/components/newsletter/NewsletterForm";
import { Card } from "@/components/ui/card";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Cadence product updates and occasional offers, a few emails a month at most.",
};

export default function NewsletterPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Newsletter" title="New lessons, new sounds, the odd offer.">
        What changed in Cadence and, now and then, a discount on Cadence Plus. A few
        emails a month at most.
      </PageIntro>
      <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="bg-white">
          <NewsletterForm source="page" />
        </Card>
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-carbon-black">How it works</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-7 text-iron-grey">
            <li>Enter your email. We send one message with a confirmation link.</li>
            <li>Click the link. Until you do, you get nothing else from us.</li>
            <li>Every email has an unsubscribe link at the bottom. One click and you are off.</li>
          </ol>
          <p className="mt-3 text-sm leading-7 text-iron-grey">
            Signed in? You can also turn it on or off on your account page.
          </p>
        </Card>
      </section>
    </PageShell>
  );
}
