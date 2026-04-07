// FILE: src/components/ui/module-progress.tsx
import { cookies } from "next/headers";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ModuleProgressFrame } from "@/components/ui/module-progress-frame";
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
  variant = "default",
}: {
  label: string;
  countLabel: string;
  percent: number;
  variant?: "default" | "dark";
}) {
  const isDark = variant === "dark";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`eyebrow text-[10px] whitespace-nowrap ${isDark ? "text-white" : "text-sage-green"}`}
        >
          {label}
        </span>
        <span
          className={`text-xs font-semibold tabular-nums ${isDark ? "text-white" : "text-hunter-green"}`}
        >
          {countLabel}
        </span>
      </div>
      <div
        className={`h-2.5 w-full overflow-hidden rounded-full ${isDark ? "bg-white/20" : "bg-alabaster-grey"}`}
      >
        <div
          className="h-full rounded-full bg-sage-green"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export async function ModuleProgress({
  variant = "default",
}: { variant?: "default" | "dark" } = {}) {
  const supabase = await createSupabaseServerClient();
  const runtime = await getRequestRuntime();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const cookieStore = await cookies();
  const conversationProgress = parseConversationProgress(
    cookieStore.get(CONVERSATION_PROGRESS_COOKIE)?.value,
  );
  const completedConversation =
    getCompletedConversationCount(conversationProgress);
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
    <ModuleProgressFrame runtime={runtime}>
      <ProgressBar
        label="Module progress"
        countLabel={`${completedModules}/${Math.max(totalModules, 0)}`}
        percent={modulePercent}
        variant={variant}
      />
      <div
        className={`hidden h-10 w-px rounded-full lg:block ${variant === "dark" ? "bg-white/20" : "bg-alabaster-grey"}`}
      />
      <ProgressBar
        label="Overall progress"
        countLabel={`${overallCompleted}/${overallTotal}`}
        percent={overallPercent}
        variant={variant}
      />
    </ModuleProgressFrame>
  );
}
