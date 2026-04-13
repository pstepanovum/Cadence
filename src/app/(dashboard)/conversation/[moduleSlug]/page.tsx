// FILE: src/app/conversation/[moduleSlug]/page.tsx
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
import { cookies } from "next/headers";
import { ChevronRight } from "griddy-icons";
import { requireAppUser } from "@/lib/app-session";
import { ConversationSession } from "@/components/conversation/ConversationSession";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import {
  CONVERSATION_MODULES,
  CONVERSATION_PROGRESS_COOKIE,
  getConversationModule,
  isConversationModuleUnlocked,
} from "@/lib/conversation";
import { loadConversationProgressForMode } from "@/lib/conversation-progress-sync";

interface PageProps {
  params: Promise<{ moduleSlug: string }>;
}

export default async function ConversationModulePage({ params }: PageProps) {
  const { moduleSlug } = await params;
  const session = await requireAppUser(`/conversation/${moduleSlug}`);

  const conversationModule = getConversationModule(moduleSlug);
  if (!conversationModule) {
    notFound();
  }

  const cookieStore = await cookies();
  const progress = await loadConversationProgressForMode(
    session.mode,
    session.user.id,
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );

  if (!isConversationModuleUnlocked(conversationModule, progress)) {
    redirect("/conversation");
  }

  const nextModule =
    CONVERSATION_MODULES.find(
      (item) => item.sortOrder === conversationModule.sortOrder + 1,
    ) ??
    null;

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="conversation" />
        <ModuleProgress />

        <div className="rounded-full bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
          <div className="flex flex-wrap items-center gap-2">
            <span>Conversation track</span>
            <ChevronRight size={14} color="#adb5bd" />
            <span className="font-medium text-hunter-green">
              {conversationModule.title}
            </span>
          </div>
        </div>

        <ConversationSession
          module={conversationModule}
          nextModuleSlug={nextModule?.slug ?? null}
        />
      </div>
    </main>
  );
}
