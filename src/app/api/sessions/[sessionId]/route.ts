import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import {
  finishLocalSession,
  getLocalLearnState,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as {
      word_count: number;
      avg_score: number;
      passed: boolean;
    };

    if (session.mode === "local") {
      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      const nextState = finishLocalSession(localState, sessionId, {
        avgScore: body.avg_score,
        passed: body.passed,
      });
      writeLocalLearnState(cookieStore, nextState);

      return NextResponse.json({
        id: sessionId,
        word_count: body.word_count,
        avg_score: Math.round(body.avg_score),
        passed: body.passed,
      });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lesson_sessions")
      .update({
        ended_at: new Date().toISOString(),
        word_count: body.word_count,
        avg_score: Math.round(body.avg_score),
        passed: body.passed,
      })
      .eq("id", sessionId)
      .eq("user_id", session.user.id)
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
