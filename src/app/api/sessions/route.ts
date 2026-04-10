import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAppSession } from "@/lib/app-session";
import { getLessonByIdFromCatalog } from "@/lib/learn-catalog";
import {
  getLocalLearnState,
  startLocalSession,
  writeLocalLearnState,
} from "@/lib/local-learn";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await getAppSession();

    if (!session.mode || !session.user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as { lesson_id: string; module_id: number };

    if (session.mode === "local") {
      const lesson = await getLessonByIdFromCatalog(body.lesson_id);

      if (!lesson) {
        return NextResponse.json({ error: "Unknown lesson." }, { status: 404 });
      }

      const cookieStore = await cookies();
      const localState = await getLocalLearnState();
      const nextSession = startLocalSession(localState, lesson.slug, body.module_id);
      writeLocalLearnState(cookieStore, nextSession.state);
      return NextResponse.json({ sessionId: nextSession.sessionId }, { status: 201 });
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lesson_sessions")
      .insert({
        user_id: session.user.id,
        lesson_id: body.lesson_id,
        module_id: body.module_id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessionId: data.id }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start session." },
      { status: 500 },
    );
  }
}
