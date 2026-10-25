// FILE: src/app/(dashboard)/phrases/[id]/page.tsx
import type { Metadata } from "next";
import { PhraseDetail } from "@/components/advanced/PhraseDetail";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Phrase", description: "A phrase with its meaning, an example to hear and record, and drills." };

export default async function PhrasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppPage current="phrases">
      <PhraseDetail id={decodeURIComponent(id)} />
    </AppPage>
  );
}
