// FILE: src/app/(dashboard)/slang/quiz/page.tsx
import type { Metadata } from "next";
import { SlangQuiz } from "@/components/advanced/Slang";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Slang quiz", description: "Meaning, fit the context and the natural reply, with spaced review." };

export default function SlangQuizPage() {
  return (
    <AppPage current="phrases">
      <SlangQuiz />
    </AppPage>
  );
}
