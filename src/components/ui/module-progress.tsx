// FILE: src/components/ui/module-progress.tsx
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  CONVERSATION_MODULES,
  CONVERSATION_PROGRESS_COOKIE,
  getCompletedConversationCount,
  parseConversationProgress,
} from "@/lib/conversation";

function ProgressBar({
  label,
  countLabel,
  percent,
}: {
  label: string;
  countLabel: string;
  percent: number;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-[10px] text-sage-green whitespace-nowrap">
          {label}
        </span>
        <span className="text-xs font-semibold tabular-nums text-hunter-green">
          {countLabel}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-vanilla-cream">
        <div
          className="h-full rounded-full bg-sage-green"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export async function ModuleProgress() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cookieStore = await cookies();
  const conversationProgress = parseConversationProgress(
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );
  const completedConversation = getCompletedConversationCount(conversationProgress);
  const totalConversation = CONVERSATION_MODULES.length;

  const [modulesResult, completedResult] = await Promise.all([
    supabase.from("modules").select("id", { count: "exact", head: true }),
    supabase
      .from("user_progress")
      .select("module_id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_completed", true),
  ]);

  const totalModules = modulesResult.count ?? 0;
  const completedModules = completedResult.count ?? 0;
  const modulePercent =
    totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0;
  const overallTotal = totalModules + totalConversation;
  const overallCompleted = completedModules + completedConversation;
  const overallPercent =
    overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0;

  if (overallTotal === 0) return null;

  return (
    <div className="w-full">
      <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-[2rem] bg-white px-5 py-4 sm:px-6 lg:flex-row lg:items-center">
        <ProgressBar
          label="Module progress"
          countLabel={`${completedModules}/${Math.max(totalModules, 0)}`}
          percent={modulePercent}
        />
        <div className="hidden h-10 w-px rounded-full bg-vanilla-cream lg:block" />
        <ProgressBar
          label="Overall progress"
          countLabel={`${overallCompleted}/${overallTotal}`}
          percent={overallPercent}
        />
      </div>
    </div>
  );
}
