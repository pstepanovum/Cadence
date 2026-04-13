import "server-only";

import type { AppMode } from "@/lib/app-mode";
import type { ConversationProgressMap } from "@/lib/conversation";
import { parseConversationProgress } from "@/lib/conversation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Local mode: progress lives in `cadence_conversation_progress` cookie only.
 * Cloud mode: merge cookie with `conversation_progress` rows (database wins per module).
 */
export async function loadConversationProgressForMode(
  mode: AppMode,
  userId: string | null,
  cookieRaw: string | undefined,
): Promise<ConversationProgressMap> {
  const fromCookie = parseConversationProgress(cookieRaw);

  if (mode !== "cloud" || !userId) {
    return fromCookie;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversation_progress")
    .select("module_slug,best_score,last_score,passed,completed_at,updated_at")
    .eq("user_id", userId);

  if (error || !data?.length) {
    return fromCookie;
  }

  const merged: ConversationProgressMap = { ...fromCookie };
  for (const row of data) {
    merged[row.module_slug] = {
      bestScore: row.best_score,
      lastScore: row.last_score,
      passed: row.passed,
      completedAt: row.completed_at,
      updatedAt: row.updated_at,
    };
  }
  return merged;
}
