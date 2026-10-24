// FILE: src/app/(dashboard)/practice/page.tsx
import type { Metadata } from "next";
import { parseLevel } from "@/components/learn-hub/modes";
import { PracticeHub } from "@/components/learn-hub/PracticeHub";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = {
  title: "Practice",
  description: "Grammar by CEFR level, quizzes, sentence building, matching and flashcards with spaced repetition.",
};

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const level = parseLevel((await searchParams).level);
  return (
    <AppPage current="practice">
      <PracticeHub initialLevel={level} />
    </AppPage>
  );
}
