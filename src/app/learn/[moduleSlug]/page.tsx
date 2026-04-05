// FILE: src/app/learn/[moduleSlug]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { LessonList } from "@/components/learn/LessonList";
import type { LessonWithSummary, ModuleWithProgress } from "@/lib/learn";

interface PageProps {
  params: Promise<{ moduleSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleSlug } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: module } = await supabase
    .from("modules")
    .select("title, description")
    .eq("slug", moduleSlug)
    .single();

  return {
    title: module?.title ?? "Module",
    description: module?.description ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { moduleSlug } = await params;
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

  if (!progress?.is_unlocked) {
    redirect("/learn");
  }

  const { data: lessonsRaw } = await supabase
    .from("lessons")
    .select("*, lesson_words(*)")
    .eq("module_id", module.id)
    .order("sort_order");

  const lessonIds = (lessonsRaw ?? []).map((lesson) => lesson.id);

  const { data: sessions } = await supabase
    .from("lesson_sessions")
    .select("lesson_id, avg_score, passed, id")
    .eq("user_id", user.id)
    .in("lesson_id", lessonIds)
    .not("ended_at", "is", null);

  const sessionMap = new Map<
    string,
    { best_score: number | null; passed: boolean | null; attempt_count: number }
  >();

  for (const session of sessions ?? []) {
    const existing = sessionMap.get(session.lesson_id);
    if (!existing) {
      sessionMap.set(session.lesson_id, {
        best_score: session.avg_score,
        passed: session.passed,
        attempt_count: 1,
      });
    } else {
      sessionMap.set(session.lesson_id, {
        best_score: Math.max(existing.best_score ?? 0, session.avg_score ?? 0),
        passed: existing.passed || session.passed,
        attempt_count: existing.attempt_count + 1,
      });
    }
  }

  const lessons: LessonWithSummary[] = (lessonsRaw ?? []).map((lesson) => {
    const summary = sessionMap.get(lesson.id);
    return {
      id: lesson.id,
      module_id: lesson.module_id,
      slug: lesson.slug,
      title: lesson.title,
      lesson_type: lesson.lesson_type,
      sort_order: lesson.sort_order,
      theory_html: lesson.theory_html,
      words: (lesson.lesson_words ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          a.sort_order - b.sort_order,
      ),
      session_summary: summary ? { session_id: null, ...summary } : null,
    };
  });

  const moduleWithProgress: ModuleWithProgress = {
    ...module,
    progress: progress ?? null,
  };

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />
        <LessonList module={moduleWithProgress} lessons={lessons} />
      </div>
    </main>
  );
}
