import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Stats } from "@/lib/learn";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const [attemptsResult, progressResult, sessionsResult] = await Promise.all([
      supabase
        .from("lesson_attempts")
        .select("score")
        .eq("user_id", user.id),
      supabase
        .from("user_progress")
        .select("is_completed")
        .eq("user_id", user.id)
        .eq("is_completed", true),
      supabase
        .from("lesson_sessions")
        .select("started_at")
        .eq("user_id", user.id)
        .not("ended_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(60),
    ]);

    const attempts = attemptsResult.data ?? [];
    const total_attempts = attempts.length;
    const average_score =
      total_attempts > 0
        ? Math.round(
            attempts.reduce((sum, a) => sum + (a.score ?? 0), 0) / total_attempts,
          )
        : 0;

    const modules_completed = (progressResult.data ?? []).length;

    // Streak: count consecutive days with at least one session
    const sessionDates = new Set(
      (sessionsResult.data ?? []).map((s) =>
        new Date(s.started_at).toISOString().slice(0, 10),
      ),
    );

    let current_streak_days = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (sessionDates.has(key)) {
        current_streak_days++;
      } else {
        break;
      }
    }

    const stats: Stats = {
      total_attempts,
      average_score,
      modules_completed,
      current_streak_days,
    };

    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch stats." },
      { status: 500 },
    );
  }
}
