// FILE: src/app/learn/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Learn",
  robots: { index: false, follow: false },
};
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { ModuleGrid } from "@/components/learn/ModuleGrid";
import type { ModuleWithProgress } from "@/lib/learn";

export default async function LearnPage() {
  const supabase = await createSupabaseServerClient();

  const [modulesResult, userResult] = await Promise.all([
    supabase.from("modules").select("*").order("sort_order"),
    supabase.auth.getUser(),
  ]);

  const modules = modulesResult.data ?? [];
  const user = userResult.data.user;

  if (!user) {
    redirect("/login");
  }

  let progressMap = new Map<number, ModuleWithProgress["progress"]>();

  const { data: existing } = await supabase
    .from("user_progress")
    .select("module_id")
    .eq("user_id", user.id)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from("user_progress").insert({
      user_id: user.id,
      module_id: 1,
      is_unlocked: true,
      unlocked_at: new Date().toISOString(),
    });
  }

  const { data: progress } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", user.id);

  progressMap = new Map(
    (progress ?? []).map((p) => [
      p.module_id as number,
      p as ModuleWithProgress["progress"],
    ]),
  );

  const modulesWithProgress: ModuleWithProgress[] = modules.map((m) => ({
    ...m,
    progress: progressMap.get(m.id) ?? null,
  }));

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />
        <ModuleGrid modules={modulesWithProgress} />
      </div>
    </main>
  );
}
