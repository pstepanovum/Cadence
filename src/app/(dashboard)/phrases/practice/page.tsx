// FILE: src/app/(dashboard)/phrases/practice/page.tsx
import type { Metadata } from "next";
import { PhrasePractice } from "@/components/advanced/PhrasePractice";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Phrase practice", description: "Today's phrases: hear and repeat, gap fill, rephrase and shadowing." };

export default function PhrasePracticePage() {
  return (
    <AppPage current="phrases">
      <PhrasePractice />
    </AppPage>
  );
}
