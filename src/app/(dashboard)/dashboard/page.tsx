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
import Link from "next/link";

const SHORTCUTS = [
  { href: "/practice", title: "Practice", blurb: "Grammar, quizzes, sentences, flashcards" },
  { href: "/sounds", title: "Sounds", blurb: "Mouth map for every sound" },
  { href: "/practice/flashcards", title: "Flashcards", blurb: "Review what is due today" },
  { href: "/coach", title: "Coach", blurb: "Talk through a real situation" },
];

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
        <nav aria-label="Shortcuts" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {SHORTCUTS.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-[20px] bg-white px-5 py-4 transition-colors hover:bg-platinum">
              <span className="block font-kicker text-xl text-carbon-black">{item.title}</span>
              <span className="block text-sm leading-6 text-iron-grey">{item.blurb}</span>
            </Link>
          ))}
        </nav>
        <QuickPracticeHome modules={modules} />

        <footer className="mt-8 flex justify-center pb-8">
          <SignOutButton mode={session.mode} />
        </footer>
      </div>
    </main>
  );
}
