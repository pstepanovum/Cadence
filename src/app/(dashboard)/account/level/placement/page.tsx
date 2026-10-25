// FILE: src/app/(dashboard)/account/level/placement/page.tsx
import type { Metadata } from "next";
import { PlacementTest } from "@/components/levels/PlacementTest";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { requireAppUser } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Placement test",
  robots: { index: false, follow: false },
};

export default async function PlacementPage() {
  const session = await requireAppUser("/account/level/placement");
  return (
    <AppPage current="account">
      <AppIntro eyebrow="Level" title="Placement test" actions={<Button href="/account/level" variant="ghost">Back to level</Button>}>
        Grammar, vocabulary and reading, harder or easier as you go. Pick your best guess, or say you don&apos;t know.
      </AppIntro>
      <PlacementTest signedIn={session.mode === "cloud"} />
    </AppPage>
  );
}
