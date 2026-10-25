// FILE: src/app/(dashboard)/recordings/page.tsx
import type { Metadata } from "next";
import { RecordingsLibrary } from "@/components/advanced/RecordingsLibrary";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Recordings", description: "Your own recordings, kept in this browser, to compare with the target." };

export default function RecordingsPage() {
  return (
    <AppPage current="phrases">
      <RecordingsLibrary />
    </AppPage>
  );
}
