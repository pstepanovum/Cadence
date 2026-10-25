// FILE: src/app/(dashboard)/phrases/page.tsx
import type { Metadata } from "next";
import { PhraseBank } from "@/components/advanced/PhraseBank";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Phrase bank", description: "High-frequency chunks, collocations and sentence frames for B2 to C2 speakers, by situation." };

export default function PhrasesPage() {
  return (
    <AppPage current="phrases">
      <PhraseBank />
    </AppPage>
  );
}
