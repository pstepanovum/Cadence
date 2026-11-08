// FILE: src/app/(dashboard)/account/connections/page.tsx
//
// Connected apps, where the "New app connected" security email points.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConnectedApps } from "@/components/account/ConnectedApps";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { requireAppUser } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Connected apps",
  robots: { index: false, follow: false },
};

export default async function ConnectionsPage() {
  const session = await requireAppUser("/account/connections");
  // Connections belong to a cloud account; your own Cadence has none.
  if (session.mode !== "cloud") redirect("/account");
  return (
    <AppPage current="account">
      <AppIntro eyebrow="Account" title="Connected apps" actions={<Button href="/account" variant="ghost">Back to account</Button>}>
        Review what can reach your account, and disconnect anything you don&apos;t recognise.
      </AppIntro>
      <ConnectedApps />
    </AppPage>
  );
}
