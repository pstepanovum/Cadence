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
  parseConversationProgress,
} from "@/lib/conversation";

export default async function ConversationPage() {
  await requireAppUser("/conversation");

  const cookieStore = await cookies();
  const progress = parseConversationProgress(
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );
  const modules = getConversationModulesWithProgress(progress);

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="conversation" />
        <ModuleProgress />
        <ConversationModuleGrid modules={modules} />
      </div>
    </main>
  );
}
