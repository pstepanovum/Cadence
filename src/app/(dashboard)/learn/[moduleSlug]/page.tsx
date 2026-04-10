// FILE: src/app/learn/[moduleSlug]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireAppUser } from "@/lib/app-session";
import { Navbar } from "@/components/ui/navbar";
import { ModuleProgress } from "@/components/ui/module-progress";
import { LessonList } from "@/components/learn/LessonList";
import { getModuleLessonDataForMode } from "@/lib/learn-data";
import { getModuleFromCatalog } from "@/lib/learn-catalog";

interface PageProps {
  params: Promise<{ moduleSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { moduleSlug } = await params;
  const moduleEntry = await getModuleFromCatalog(moduleSlug);

  return {
    title: moduleEntry?.title ?? "Module",
    description: moduleEntry?.description ?? undefined,
    robots: { index: false, follow: false },
  };
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { moduleSlug } = await params;
  const session = await requireAppUser(`/learn/${moduleSlug}`);
  const moduleLessonData = await getModuleLessonDataForMode(
    session.mode,
    session.user.id,
    moduleSlug,
  );

  if (!moduleLessonData) notFound();

  if (!moduleLessonData.module.progress?.is_unlocked) {
    redirect("/learn");
  }

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="learn" />
        <ModuleProgress />
        <LessonList
          module={moduleLessonData.module}
          lessons={moduleLessonData.lessons}
        />
      </div>
    </main>
  );
}
