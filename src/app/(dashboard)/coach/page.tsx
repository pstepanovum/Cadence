// FILE: src/app/coach/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Coach",
  robots: { index: false, follow: false },
};
import { AiCoachPlayground } from "@/components/coach/AiCoachPlayground";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import { requireAppUser } from "@/lib/app-session";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export default async function CoachPage() {
  const session = await requireAppUser("/coach");
  const runtime = await getRequestRuntime();

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="coach" />
        <ModuleProgress />
        <AiCoachPlayground
          userId={session.user.id}
          showOverviewCard={runtime !== "desktop"}
        />
      </div>
    </main>
  );
}
