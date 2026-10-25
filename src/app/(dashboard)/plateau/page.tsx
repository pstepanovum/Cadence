// FILE: src/app/(dashboard)/plateau/page.tsx
import type { Metadata } from "next";
import { PlateauTrack } from "@/components/advanced/PlateauTrack";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Plateau track", description: "A twelve-week program for the errors that persist at C1 and C2." };

export default function PlateauPage() {
  return (
    <AppPage current="phrases">
      <PlateauTrack />
    </AppPage>
  );
}
