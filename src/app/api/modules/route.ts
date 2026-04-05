import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModuleWithProgress } from "@/lib/learn";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { data: modules, error: modulesError } = await supabase
      .from("modules")
      .select("*")
      .order("sort_order");

    if (modulesError) {
      return NextResponse.json({ error: modulesError.message }, { status: 500 });
    }

    if (!user) {
      const result: ModuleWithProgress[] = (modules ?? []).map((m) => ({
        ...m,
        progress: null,
      }));
      return NextResponse.json(result);
    }

    const { data: progress } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", user.id);

    const progressMap = new Map(
      (progress ?? []).map((p) => [p.module_id, p]),
    );

    const result: ModuleWithProgress[] = (modules ?? []).map((m) => ({
      ...m,
      progress: progressMap.get(m.id) ?? null,
    }));

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch modules." },
      { status: 500 },
    );
  }
}
