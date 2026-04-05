import { NextResponse } from "next/server";
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
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: lessons, error: lessonsError } = await supabase
      .from("lessons")
      .select("*, lesson_words(*)")
      .eq("module_id", moduleIdNum)
      .order("sort_order");

    if (lessonsError) {
      return NextResponse.json({ error: lessonsError.message }, { status: 500 });
    }

    // Normalize: sort words within each lesson
    const normalizedLessons = (lessons ?? []).map((lesson) => ({
      ...lesson,
      words: (lesson.lesson_words ?? []).sort(
        (a: { sort_order: number }, b: { sort_order: number }) =>
          a.sort_order - b.sort_order,
      ),
      lesson_words: undefined,
    }));

    if (!user) {
      return NextResponse.json(normalizedLessons);
    }

    // Attach best session summary for each lesson
    const lessonIds = normalizedLessons.map((l) => l.id);
    const { data: sessions } = await supabase
      .from("lesson_sessions")
      .select("lesson_id, avg_score, passed, id")
      .eq("user_id", user.id)
      .in("lesson_id", lessonIds)
      .not("ended_at", "is", null);

    // Per lesson: find best session
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
