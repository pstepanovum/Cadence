import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getLearnCatalog } from "@/lib/learn-catalog";
import { getLocalLearnState, getLocalLessonSummary } from "@/lib/local-learn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const { moduleId } = await params;
  const moduleIdNum = parseInt(moduleId, 10);

  if (isNaN(moduleIdNum)) {
    return NextResponse.json({ error: "Invalid module ID." }, { status: 400 });
  }

  try {
    const session = await getAppSession();
    const catalog = await getLearnCatalog();
    const normalizedLessons = (
      catalog.lessonsByModuleId.get(moduleIdNum) ?? []
    ).map((lesson) => ({
      ...lesson,
    }));

    if (!session.mode || !session.user) {
      return NextResponse.json(normalizedLessons);
    }

    if (session.mode === "local") {
      const localState = await getLocalLearnState();
      return NextResponse.json(
        normalizedLessons.map((lesson) => ({
          ...lesson,
          session_summary: getLocalLessonSummary(localState, lesson.slug),
        })),
      );
    }

    const supabase = await createSupabaseServerClient();
    const lessonIds = normalizedLessons.map((lesson) => lesson.id);
    const { data: sessions } = await supabase
      .from("lesson_sessions")
      .select("lesson_id, avg_score, passed, id")
      .eq("user_id", session.user.id)
      .in("lesson_id", lessonIds)
      .not("ended_at", "is", null);

    const sessionMap = new Map<string, { best_score: number | null; passed: boolean | null; attempt_count: number }>();
    for (const s of sessions ?? []) {
      const existing = sessionMap.get(s.lesson_id);
      if (!existing) {
        sessionMap.set(s.lesson_id, {
          best_score: s.avg_score,
          passed: s.passed,
          attempt_count: 1,
        });
      } else {
        sessionMap.set(s.lesson_id, {
          best_score: Math.max(existing.best_score ?? 0, s.avg_score ?? 0),
          passed: existing.passed || s.passed,
          attempt_count: existing.attempt_count + 1,
        });
      }
    }

    const withSummary = normalizedLessons.map((lesson) => {
      const summary = sessionMap.get(lesson.id);
      return {
        ...lesson,
        session_summary: summary
          ? {
              session_id: null,
              attempt_count: summary.attempt_count,
              best_score: summary.best_score,
              passed: summary.passed,
            }
          : null,
      };
    });

    return NextResponse.json(withSummary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch lessons." },
      { status: 500 },
    );
  }
}
