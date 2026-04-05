// FILE: src/app/conversation/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Conversation Practice",
  robots: { index: false, follow: false },
};
import { cookies } from "next/headers";
import { ConversationModuleGrid } from "@/components/conversation/ConversationModuleGrid";
import { ModuleProgress } from "@/components/ui/module-progress";
import { Navbar } from "@/components/ui/navbar";
import {
  CONVERSATION_PROGRESS_COOKIE,
  getConversationModulesWithProgress,
  parseConversationProgress,
} from "@/lib/conversation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ConversationPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const progress = parseConversationProgress(
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );
  const modules = getConversationModulesWithProgress(progress);

  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="conversation" />
        <ModuleProgress />
        <ConversationModuleGrid modules={modules} />
      </div>
    </main>
  );
}
