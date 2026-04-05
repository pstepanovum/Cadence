// FILE: src/app/learn/[moduleSlug]/[lessonSlug]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ChevronRight } from "griddy-icons";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { TheoryLesson } from "@/components/learn/TheoryLesson";
import { PracticeLesson } from "@/components/learn/PracticeLesson";
import { ExamLesson } from "@/components/learn/ExamLesson";
import type { Lesson, LessonWord } from "@/lib/learn";

interface PageProps {
  params: Promise<{ moduleSlug: string; lessonSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleSlug, lessonSlug } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: module }, { data: lesson }] = await Promise.all([
    supabase.from("modules").select("title").eq("slug", moduleSlug).single(),
    supabase.from("lessons").select("title").eq("slug", lessonSlug).single(),
  ]);

  const title = lesson?.title
    ? `${lesson.title}${module?.title ? ` — ${module.title}` : ""}`
    : "Lesson";

  return {
    title,
    robots: { index: false, follow: false },
  };
}

export default async function LessonPage({ params }: PageProps) {
  const { moduleSlug, lessonSlug } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: module } = await supabase
    .from("modules")
    .select("*")
    .eq("slug", moduleSlug)
    .single();

  if (!module) notFound();

  const { data: progress } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("module_id", module.id)
    .single();

  if (!progress?.is_unlocked) redirect("/learn");

  const { data: lessonRaw } = await supabase
    .from("lessons")
    .select("*, lesson_words(*)")
    .eq("slug", lessonSlug)
    .eq("module_id", module.id)
    .single();

  if (!lessonRaw) notFound();

  const lesson: Lesson = {
    id: lessonRaw.id,
    module_id: lessonRaw.module_id,
    slug: lessonRaw.slug,
    title: lessonRaw.title,
    lesson_type: lessonRaw.lesson_type,
    sort_order: lessonRaw.sort_order,
    theory_html: lessonRaw.theory_html,
    words: ((lessonRaw.lesson_words ?? []) as LessonWord[]).sort(
      (a: LessonWord, b: LessonWord) => a.sort_order - b.sort_order,
    ),
  };

  let nextLessonSlug: string | null = null;
  if (lesson.lesson_type === "theory") {
    const { data: nextLesson } = await supabase
      .from("lessons")
      .select("slug")
      .eq("module_id", module.id)
      .eq("sort_order", lesson.sort_order + 1)
      .single();
    nextLessonSlug = nextLesson?.slug ?? null;
  }

  let nextModuleSlug: string | null = null;
  if (lesson.lesson_type === "exam" && module.id < 10) {
    const { data: nextModule } = await supabase
      .from("modules")
      .select("slug")
      .eq("id", module.id + 1)
      .single();
    nextModuleSlug = nextModule?.slug ?? null;
  }

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />

        <div className="rounded-full bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              Module {module.sort_order}: {module.title}
            </span>
            <ChevronRight size={14} color="#adb5bd" />
            <span className="font-medium text-hunter-green">{lesson.title}</span>
          </div>
        </div>

        {lesson.lesson_type === "theory" ? (
          <TheoryLesson
            lesson={lesson}
            moduleSlug={moduleSlug}
            nextLessonSlug={nextLessonSlug}
          />
        ) : null}

        {lesson.lesson_type === "practice" ? (
          <PracticeLesson lesson={lesson} moduleSlug={moduleSlug} />
        ) : null}

        {lesson.lesson_type === "exam" ? (
          <ExamLesson
            lesson={lesson}
            moduleId={module.id}
            moduleSlug={moduleSlug}
            nextModuleSlug={nextModuleSlug}
          />
        ) : null}
      </div>
    </main>
  );
}
