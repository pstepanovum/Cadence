import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Bootstrap module 1 as unlocked for a new user. */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const { error } = await supabase.from("user_progress").upsert(
      {
        user_id: user.id,
        module_id: 1,
        is_unlocked: true,
        unlocked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module_id", ignoreDuplicates: true },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to bootstrap progress." },
      { status: 500 },
    );
  }
}

/** Complete a module's exam and unlock the next module. */
export async function PATCH(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await request.json() as { module_id: number; exam_score: number };
    const { module_id, exam_score } = body;
    const passed = exam_score >= 70;

    // Fetch current best score
    const { data: existing } = await supabase
      .from("user_progress")
      .select("best_exam_score")
      .eq("user_id", user.id)
      .eq("module_id", module_id)
      .single();

    const newBest = Math.max(exam_score, existing?.best_exam_score ?? 0);

    // Update this module's progress
    await supabase.from("user_progress").upsert(
      {
        user_id: user.id,
        module_id,
        is_unlocked: true,
        is_completed: passed,
        best_exam_score: newBest,
        completed_at: passed ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,module_id" },
    );

    // Unlock next module if passed
    if (passed && module_id < 10) {
      await supabase.from("user_progress").upsert(
        {
          user_id: user.id,
          module_id: module_id + 1,
          is_unlocked: true,
          unlocked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,module_id", ignoreDuplicates: false },
      );
    }

    return NextResponse.json({ passed, best_exam_score: newBest });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update progress." },
      { status: 500 },
    );
  }
}
