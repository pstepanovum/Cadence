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
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />
        <ModuleGrid modules={modules} />
      </div>
    </main>
  );
}
