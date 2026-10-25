// FILE: src/app/(dashboard)/account/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AccountPanel } from "@/components/account/AccountPanel";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { requireAppUser } from "@/lib/app-session";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await requireAppUser("/account");
  const { checkout } = await searchParams;
  const isLocal = session.mode === "local";

  return (
    <AppPage current="account">
      <AppIntro
        eyebrow="Account"
        title={isLocal ? "This computer's Cadence" : session.user.email ?? "Your account"}
        actions={
          <>
            <Button href="/profile" variant="ghost">Practice preferences</Button>
            <Button href="/account/level" variant="ghost">Level</Button>
            <SignOutButton mode={session.mode ?? "local"} />
            <span className="inline-flex items-center gap-2 text-sm text-iron-grey">
              <ThemeToggle /> Theme
            </span>
          </>
        }
      >
        {isLocal
          ? "You are using Cadence without an account. Progress stays on this device, and AI runs on your own computer, free."
          : "Your plan, emails and data."}
      </AppIntro>

      {isLocal ? (
        <Card className="bg-white">
          <h2 className="font-kicker text-xl text-hunter-green">Want progress on every device?</h2>
          <p className="mt-1 text-sm leading-7 text-iron-grey">
            A free account keeps your streak and lesson stats in sync. You can keep using your own Cadence for AI either way.
          </p>
          {isFirebaseConfigured ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button href="/signup">Create a free account</Button>
              <Link href="/pricing" className="inline-flex min-h-12 items-center px-3 text-sm font-semibold text-sage-text underline underline-offset-2">See plans</Link>
            </div>
          ) : null}
        </Card>
      ) : (
        <AccountPanel email={session.user.email} checkout={typeof checkout === "string" ? checkout : null} />
      )}
    </AppPage>
  );
}
