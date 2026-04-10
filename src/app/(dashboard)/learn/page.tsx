// FILE: src/app/learn/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Learn",
  robots: { index: false, follow: false },
};
import { requireAppUser } from "@/lib/app-session";
import { getModulesWithProgressForMode } from "@/lib/learn-data";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { ModuleGrid } from "@/components/learn/ModuleGrid";

export default async function LearnPage() {
  const session = await requireAppUser("/learn");
  const modules = await getModulesWithProgressForMode(
    session.mode,
    session.user.id,
  );

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />
        <ModuleGrid modules={modules} />
      </div>
    </main>
  );
}
