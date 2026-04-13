// FILE: src/app/learn/[moduleSlug]/[lessonSlug]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "griddy-icons";
import { requireAppUser } from "@/lib/app-session";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { TheoryLesson } from "@/components/learn/TheoryLesson";
import { PracticeLesson } from "@/components/learn/PracticeLesson";
import { ExamLesson } from "@/components/learn/ExamLesson";
import { getLessonDataForMode } from "@/lib/learn-data";
import { getModuleFromCatalog, getLessonFromCatalog } from "@/lib/learn-catalog";

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleSlug, lessonSlug } = await params;
  const moduleEntry = await getModuleFromCatalog(moduleSlug);
  const lesson = moduleEntry
    ? await getLessonFromCatalog(moduleEntry.id, lessonSlug)
    : null;

  const title = lesson?.title
    ? `${lesson.title}${moduleEntry?.title ? ` — ${moduleEntry.title}` : ""}`
    : "Lesson";

  return {
    title,
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({ params }: PageProps) {
  const { moduleSlug, lessonSlug } = await params;
  const session = await requireAppUser(`/learn/${moduleSlug}/${lessonSlug}`);
  const lessonData = await getLessonDataForMode(
    session.mode,
    session.user.id,
    moduleSlug,
    lessonSlug,
  );

  if (!lessonData) notFound();
  if (!lessonData.module.progress?.is_unlocked) redirect("/learn");

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />

        <div className="rounded-full bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Module {lessonData.module.sort_order}: {lessonData.module.title}
            </span>
            <ChevronRight size={14} color="#adb5bd" />
            <span className="font-medium text-hunter-green">
              {lessonData.lesson.title}
            </span>
          </div>
        </div>

        {lessonData.lesson.lesson_type === "theory" ? (
          <TheoryLesson
            lesson={lessonData.lesson}
            moduleSlug={moduleSlug}
            nextLessonSlug={lessonData.nextLessonSlug}
          />
        ) : null}

        {lessonData.lesson.lesson_type === "practice" ? (
          <PracticeLesson lesson={lessonData.lesson} moduleSlug={moduleSlug} />
        ) : null}

        {lessonData.lesson.lesson_type === "exam" ? (
          <ExamLesson
            lesson={lessonData.lesson}
            moduleId={lessonData.module.id}
            moduleSlug={moduleSlug}
            nextModuleSlug={lessonData.nextModuleSlug}
          />
        ) : null}
      </div>
    </main>
  );
}
