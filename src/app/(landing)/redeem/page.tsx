// FILE: src/app/(landing)/redeem/page.tsx
//
// Friend codes, redeemed on the website only (src/components/redeem/RedeemPanel.tsx).
// Not linked from the iPhone app, which never mentions codes.
import type { Metadata } from "next";
import { RedeemPanel } from "@/components/redeem/RedeemPanel";
import { PageIntro, PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = {
  title: "Redeem a code",
  description: "Turn on Cadence Plus with a code from a friend.",
  robots: { index: false, follow: false },
};

export default async function RedeemPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const { code } = await searchParams;
  const initial = typeof code === "string" ? code : "";
  return (
    <PageShell>
      <PageIntro eyebrow="Redeem" title="Redeem a code.">
        A code turns on Cadence Plus for a set time: cloud scoring, voices, the coach and sync on every device. No card, and it ends by itself.
      </PageIntro>
      <div className="mx-auto w-full max-w-xl">
        <RedeemPanel initialCode={initial} />
      </div>
    </PageShell>
  );
}
