// FILE: src/app/(dashboard)/slang/page.tsx
import type { Metadata } from "next";
import { SlangDictionary } from "@/components/advanced/Slang";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Modern slang", description: "Current slang and informal English: meaning, where it fits, who says it, and what sounds dated." };

export default function SlangPage() {
  return (
    <AppPage current="phrases">
      <SlangDictionary />
    </AppPage>
  );
}
