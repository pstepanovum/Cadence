// FILE: src/app/(landing)/contact/page.tsx
//
// The contact form. Messages land in the owner's support inbox and on the
// dashboard (POST /api/support); answers come back by email.
import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "@/components/support/SupportForm";
import { Card } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/components/ui/contact";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Contact",
  description: "Write to Cadence support. A person replies, usually within two working days.",
};

export default function ContactPage() {
  return (
    <PageShell>
      <PageIntro eyebrow="Contact" title="Write to us.">
        Bugs, billing, your data, a lesson that sounds wrong. A person reads every message and replies, usually within two working days.
      </PageIntro>
      <section className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Card className="bg-white">
          <SupportForm />
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="bg-white">
            <h2 className="font-kicker text-xl text-hunter-green">Quick answers</h2>
            <p className="mt-1 text-sm leading-6 text-iron-grey">
              Passwords, cancelling, refunds and connecting your phone are on the <Link href="/support" className="underline">support page</Link>.
            </p>
          </Card>
          <Card className="bg-white">
            <h2 className="font-kicker text-xl text-hunter-green">Email</h2>
            <p className="mt-1 text-sm leading-6 text-iron-grey">
              Prefer your own mail app? <a href={`mailto:${SUPPORT_EMAIL}`} className="underline">{SUPPORT_EMAIL}</a>
            </p>
          </Card>
        </div>
      </section>
    </PageShell>
  );
}
