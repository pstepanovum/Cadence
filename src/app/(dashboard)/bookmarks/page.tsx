import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import { requireAppUser } from "@/lib/app-session";

export const metadata: Metadata = {
  title: "Bookmarks",
  robots: { index: false, follow: false },
};

export default async function BookmarksPage() {
  await requireAppUser("/bookmarks");

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar />
        <ModuleProgress />
        <Card className="bg-white">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-sage-green">Bookmarks</p>
            <h1 className="text-3xl font-semibold text-hunter-green sm:text-4xl">
              Save and revisit your important items.
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-iron-grey">
              This section is connected to the sidebar so the dedicated bookmarks flow can be added next.
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
