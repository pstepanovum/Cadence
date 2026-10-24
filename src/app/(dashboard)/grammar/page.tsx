// FILE: src/app/(dashboard)/grammar/page.tsx
import type { Metadata } from "next";
import { GrammarBrowser } from "@/components/learn-hub/GrammarBrowser";
import { parseLevel } from "@/components/learn-hub/modes";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = {
  title: "Grammar",
  description: "English grammar by CEFR level, A1 to C2, with examples and common mistakes.",
};

export default async function GrammarPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  return (
    <AppPage current="practice">
      <GrammarBrowser initialLevel={parseLevel((await searchParams).level)} />
    </AppPage>
  );
}
