import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as {
      word_count: number;
      avg_score: number;
      passed: boolean;
    };

    const { data, error } = await supabase
      .from("lesson_sessions")
      .update({
        ended_at: new Date().toISOString(),
        word_count: body.word_count,
        avg_score: Math.round(body.avg_score),
        passed: body.passed,
      })
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to end session." },
      { status: 500 },
    );
  }
}
