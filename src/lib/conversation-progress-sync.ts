import "server-only";

import type { AppMode } from "@/lib/app-mode";
import type { ConversationProgressMap } from "@/lib/conversation";
import { parseConversationProgress } from "@/lib/conversation";
import { listConversationProgress } from "@/lib/cloud/store";

/**
 * Local mode: progress lives in `cadence_conversation_progress` cookie only.
 * Cloud mode: merge the cookie with users/{uid}/conversationProgress (database wins per module).
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

  try {
    // Database wins per module; the cookie fills in anything not saved yet.
    return { ...fromCookie, ...(await listConversationProgress(userId)) };
  } catch (error) {
    console.error("Could not read conversation progress:", error);
    return fromCookie;
  }
}
