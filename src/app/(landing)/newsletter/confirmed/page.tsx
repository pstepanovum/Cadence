// FILE: src/app/(landing)/newsletter/confirmed/page.tsx
//
// Where Brevo's double opt-in sends people after they click the link in the
// confirmation email (the list's redirect URL).
import type { Metadata } from "next";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "You are subscribed",
  robots: { index: false, follow: false },
};

export default function NewsletterConfirmedPage() {
  return (
    <PageShell>
      <Card className="bg-white">
        <div className="grid items-center gap-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <p className="eyebrow text-sm text-sage-text">Newsletter</p>
            <h1 className="text-3xl font-semibold text-hunter-green sm:text-4xl">You are on the list.</h1>
            <p className="max-w-xl text-base leading-8 text-iron-grey">
              Thanks for confirming. Expect product updates and the occasional offer.
              Every email has an unsubscribe link.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button href="/practice">Start practising</Button>
              <Button href="/" variant="ghost">Back to the home page</Button>
            </div>
          </div>
          <Image src="/illustration/success-1.svg" alt="" width={320} height={260} className="mx-auto h-auto w-full max-w-[16rem]" />
        </div>
      </Card>
    </PageShell>
  );
}
