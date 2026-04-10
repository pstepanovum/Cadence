// FILE: src/app/dashboard/page.tsx
import type { Metadata } from "next";
import { QuickPracticeHome } from "@/components/audio/QuickPracticeHome";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};
import { requireAppUser } from "@/lib/app-session";
import { getModulesWithProgressForMode } from "@/lib/learn-data";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { SignOutButton } from "@/components/ui/sign-out-button";

export default async function DashboardPage() {
  const session = await requireAppUser("/dashboard");
  const modules = await getModulesWithProgressForMode(
    session.mode,
    session.user.id,
  );

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="home" />
        <ModuleProgress />
        <QuickPracticeHome modules={modules} />

        <footer className="mt-8 flex justify-center pb-8">
          <SignOutButton mode={session.mode} />
        </footer>
      </div>
    </main>
  );
}
