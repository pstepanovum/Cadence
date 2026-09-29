import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CoachMode, PronunciationAssessment } from "@/api/types";

// AsyncStorage port of the web app's localStorage coach history
// (src/lib/ai-coach-storage.ts) — same key shape, per-user.

export interface CoachSessionTurn {
  id: string;
  coachMessage: string;
  learnerReply: string;
  assessment: PronunciationAssessment | null;
  freeTranscript: string | null;
}

export interface SavedCoachSession {
  id: string;
  topic: string;
  replyMode: CoachMode;
  createdAt: string;
  updatedAt: string;
  turns: CoachSessionTurn[];
}

const MAX_SESSIONS = 30;

function storageKey(userId: string) {
  return `cadence_ai_coach_sessions:${userId}`;
}

export async function readCoachSessions(userId: string): Promise<SavedCoachSession[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedCoachSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveCoachSession(
  userId: string,
  session: SavedCoachSession,
): Promise<void> {
  const sessions = await readCoachSessions(userId);
  const existingIndex = sessions.findIndex((item) => item.id === session.id);
  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
  } else {
    sessions.unshift(session);
  }
  sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify(sessions.slice(0, MAX_SESSIONS)),
  );
}

export async function deleteCoachSession(userId: string, sessionId: string): Promise<void> {
  const sessions = await readCoachSessions(userId);
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify(sessions.filter((item) => item.id !== sessionId)),
  );
}
