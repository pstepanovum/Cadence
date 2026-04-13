// FILE: src/app/(dashboard)/coach/page.tsx
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
import { cn } from "@/lib/utils";

export default async function CoachPage() {
  const session = await requireAppUser("/coach");
  const runtime = await getRequestRuntime();
  const isDesktop = runtime === "desktop";

  return (
    <main
      data-lenis-prevent
      className={cn(
        "box-border flex w-full flex-col overflow-hidden overscroll-none p-4 sm:p-5 lg:p-6",
        isDesktop ? "min-h-0 max-h-full min-w-0 flex-1" : "h-[100dvh] max-h-[100dvh]",
      )}
    >
      <div className="mx-auto flex w-full max-w-[1600px] shrink-0 flex-col gap-4">
        <Navbar current="coach" />
        <ModuleProgress />
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col overflow-hidden">
        <AiCoachPlayground
          userId={session.user.id}
          showOverviewCard={!isDesktop}
          showEngineDiagnostics={session.mode === "local"}
        />
      </div>
    </main>
  );
}
