// FILE: src/app/dashboard/page.tsx
import type { Metadata } from "next";
import { QuickPracticeHome } from "@/components/audio/QuickPracticeHome";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ModuleWithProgress } from "@/lib/learn";

async function fetchModulesWithProgress(): Promise<ModuleWithProgress[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const [modulesResult, userResult] = await Promise.all([
      supabase.from("modules").select("*").order("sort_order"),
      supabase.auth.getUser(),
    ]);
    const modules = modulesResult.data ?? [];
    const user = userResult.data.user;
    if (!user) return modules.map((m) => ({ ...m, progress: null }));

    const { data: progress } = await supabase
      .from("user_progress")
      .select("*")
      .eq("user_id", user.id);

    const progressMap = new Map((progress ?? []).map((p) => [p.module_id, p]));
    return modules.map((m) => ({
      ...m,
      progress:
        (progressMap.get(m.id) as ModuleWithProgress["progress"]) ?? null,
    }));
  } catch {
    return [];
  }
}
// FILE: src/app/dashboard/page.tsx
export default async function DashboardPage() {
  const modules = await fetchModulesWithProgress();

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="home" />
        <ModuleProgress />
        <QuickPracticeHome modules={modules} />

        <footer className="mt-8 flex justify-center pb-8">
          <SignOutButton />
        </footer>
      </div>
    </main>
  );
}
