// FILE: src/lib/ai-coach.ts
import type { PronunciationAssessment } from "@/lib/pronunciation";

export type AiCoachRole = "coach" | "user";
export type AiCoachReplyMode = "target" | "freedom";
export type AiCoachPhase =
  | "idle"
  | "starting"
  | "coach"
  | "recording"
  | "assessing"
  | "result"
  | "continuing";

export interface AiCoachTurn {
  id: string;
  coachMessage: string;
  learnerReply: string;
  assessment: PronunciationAssessment | null;
  freeTranscript: string | null;
  replyAudioUrl: string | null;
}

export interface AiCoachGeneratedTurn {
  coachMessage: string;
  learnerReply: string;
}

export interface AiCoachHistoryEntry {
  role: AiCoachRole;
  content: string;
  score?: number | null;
  transcript?: string | null;
}

export interface AiCoachRequestPayload {
  action: "start" | "continue";
  topic: string;
  mode?: AiCoachReplyMode;
  history: AiCoachHistoryEntry[];
}

export interface AiCoachResponsePayload {
  turn: AiCoachGeneratedTurn;
}

export interface AiCoachStatusPayload {
  ready: boolean;
  message: string;
}

export interface AiCoachTranscriptPayload {
  transcript: string;
  engine: string;
  durationHintSeconds?: number;
  modelReady?: boolean;
  loadError?: string | null;
}

export interface SavedAiCoachSession {
  id: string;
  topic: string;
  replyMode: AiCoachReplyMode;
  createdAt: string;
  updatedAt: string;
  turns: AiCoachTurn[];
}
