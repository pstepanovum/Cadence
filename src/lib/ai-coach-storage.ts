"use client";

import type { SavedAiCoachSession } from "@/lib/ai-coach";

export function getAiCoachStorageKey(userId: string) {
  return `cadence_ai_coach_sessions:${userId}`;
}

export function readSavedAiCoachSessions(userId: string): SavedAiCoachSession[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(getAiCoachStorageKey(userId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((session) => {
      if (!session || typeof session !== "object") {
        return [];
      }

      const candidate = session as Partial<SavedAiCoachSession> & {
        turns?: unknown;
      };

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.topic !== "string" ||
        (candidate.replyMode !== "target" && candidate.replyMode !== "freedom") ||
        typeof candidate.createdAt !== "string" ||
        typeof candidate.updatedAt !== "string" ||
        !Array.isArray(candidate.turns)
      ) {
        return [];
      }

      return [
        {
          id: candidate.id,
          topic: candidate.topic,
          replyMode: candidate.replyMode,
          createdAt: candidate.createdAt,
          updatedAt: candidate.updatedAt,
          turns: candidate.turns as SavedAiCoachSession["turns"],
        } satisfies SavedAiCoachSession,
      ];
    });
  } catch {
    return [];
  }
}

export function writeSavedAiCoachSessions(
  userId: string,
  sessions: SavedAiCoachSession[],
) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      getAiCoachStorageKey(userId),
      JSON.stringify(sessions),
    );
  } catch {
    // ignore
  }
}

export function deleteSavedAiCoachSession(userId: string, sessionId: string) {
  const nextSessions = readSavedAiCoachSessions(userId).filter(
    (session) => session.id !== sessionId,
  );
  writeSavedAiCoachSessions(userId, nextSessions);
  return nextSessions;
}
