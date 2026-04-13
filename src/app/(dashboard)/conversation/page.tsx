// FILE: src/app/conversation/page.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conversation Practice",
  robots: { index: false, follow: false },
};
import { cookies } from "next/headers";
import { requireAppUser } from "@/lib/app-session";
import { ConversationModuleGrid } from "@/components/conversation/ConversationModuleGrid";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import {
  CONVERSATION_PROGRESS_COOKIE,
  getConversationModulesWithProgress,
} from "@/lib/conversation";
import { loadConversationProgressForMode } from "@/lib/conversation-progress-sync";

export default async function ConversationPage() {
  const session = await requireAppUser("/conversation");

  const cookieStore = await cookies();
  const progress = await loadConversationProgressForMode(
    session.mode,
    session.user.id,
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );
  const modules = getConversationModulesWithProgress(progress);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 pt-4 pb-10 sm:px-5 sm:pt-5 sm:pb-12 lg:px-6 lg:pt-6 lg:pb-14">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="conversation" />
        <ModuleProgress />
        <ConversationModuleGrid modules={modules} />
      </div>
    </main>
  );
}
