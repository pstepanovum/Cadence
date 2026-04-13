import type { Metadata } from "next";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import { JustSpeakStudio } from "@/components/just-speak/JustSpeakStudio";
import { requireAppUser } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Just Speak",
  robots: { index: false, follow: false },
};

export default async function JustSpeakPage() {
  await requireAppUser("/just-speak");

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar />
        <ModuleProgress />
        <JustSpeakStudio />
      </div>
    </main>
  );
}
