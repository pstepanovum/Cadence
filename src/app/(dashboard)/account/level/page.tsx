// FILE: src/app/(dashboard)/account/level/page.tsx
import type { Metadata } from "next";
import { LevelSettings } from "@/components/levels/LevelSettings";
import { AppIntro, AppPage } from "@/components/ui/app-page";
import { Button } from "@/components/ui/button";
import { requireAppUser } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Level",
  robots: { index: false, follow: false },
};

export default async function LevelPage() {
  const session = await requireAppUser("/account/level");
  const signedIn = session.mode === "cloud";
  return (
    <AppPage current="account">
      <AppIntro eyebrow="Account" title="Level" actions={<Button href="/account" variant="ghost">Back to account</Button>}>
        {signedIn ? "Kept on your account and on this browser." : "Kept on this browser."}
      </AppIntro>
      <LevelSettings signedIn={signedIn} />
    </AppPage>
  );
}
