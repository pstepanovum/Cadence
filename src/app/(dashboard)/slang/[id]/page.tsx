// FILE: src/app/(dashboard)/slang/[id]/page.tsx
import type { Metadata } from "next";
import { SlangDetail } from "@/components/advanced/Slang";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Slang", description: "One slang entry: meaning, where it fits, examples to hear and record." };

export default async function SlangEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <AppPage current="phrases">
      <SlangDetail id={decodeURIComponent(id)} />
    </AppPage>
  );
}
