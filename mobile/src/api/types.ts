// Response/request shapes mirrored from the web app's API layer
// (src/lib/pronunciation.ts, src/lib/learn.ts, src/lib/conversation.ts,
// src/lib/ai-coach.ts and the src/app/api/* route handlers).

export type PronunciationStatus = "correct" | "mixed" | "needs-work";

export interface PronunciationHighlight {
  text: string;
  status: PronunciationStatus;
  feedback: string;
  replyStartSec?: number;
  replyEndSec?: number;
}

export interface PronunciationPhoneme {
  symbol: string;
  expected: string;
  heard: string;
  accuracy: number;
  status: PronunciationStatus;
}

export interface PronunciationAssessment {
  targetText: string;
  ipaTarget: string;
  transcript: string;
  overallScore: number;
  summary: string;
  nextStep: string;
  engine: string;
  highlights: PronunciationHighlight[];
  phonemes: PronunciationPhoneme[];
}

// --- Learn ---

export interface Module {
  id: number;
  slug: string;
  title: string;
  description: string;
  phoneme_focus: string[];
  sort_order: number;
}

export interface UserProgress {
  is_unlocked: boolean;
  is_completed: boolean;
  best_exam_score: number | null;
  unlocked_at: string | null;
  completed_at: string | null;
}

export interface ModuleWithProgress extends Module {
  progress: UserProgress | null;
}

export type LessonType = "theory" | "practice" | "exam";

export interface LessonWord {
  id: string;
  word: string;
  ipa: string;
  sort_order: number;
}

export interface Lesson {
  id: string;
  module_id: number;
  slug: string;
  title: string;
  lesson_type: LessonType;
  sort_order: number;
  theory_html: string | null;
  words: LessonWord[];
}

export interface LessonSessionSummary {
  session_id: string | null;
  attempt_count: number;
  best_score: number | null;
  passed: boolean | null;
}

export interface LessonWithSummary extends Lesson {
  session_summary: LessonSessionSummary | null;
}

export interface AttemptPayload {
  lesson_id: string;
  lesson_word_id: string;
  word: string;
  score: number;
  ipa_target: string;
  ipa_transcript: string;
  phoneme_detail: Record<string, unknown>;
  attempt_number: number;
}

export interface Stats {
  total_attempts: number;
  average_score: number;
  modules_completed: number;
  current_streak_days: number;
}

// --- Conversation ---

export interface ConversationTurn {
  id: string;
  coachMessage: string;
  userPrompt: string;
  expectedResponse: string;
  coachingCue: string;
}

export interface ConversationModule {
  slug: string;
  title: string;
  level: string;
  topic: string;
  summary: string;
  scenario: string;
  focus: string[];
  sortOrder: number;
  estimatedMinutes: number;
  passScore: number;
  turns: ConversationTurn[];
}

export interface ConversationProgressEntry {
  bestScore: number;
  lastScore: number;
  passed: boolean;
  completedAt: string | null;
  updatedAt: string;
}

export interface ConversationModuleWithProgress extends ConversationModule {
  progress: ConversationProgressEntry | null;
  isUnlocked: boolean;
  isCompleted: boolean;
}

// --- AI Coach ---

export type CoachMode = "target" | "freedom";

export interface CoachHistoryEntry {
  role: "coach" | "user";
  content: string;
  score?: number | null;
  transcript?: string | null;
}

export interface CoachTurn {
  coachMessage: string;
  learnerReply: string;
}

export interface CoachTurnResponse {
  turn: CoachTurn;
  provider: string;
}

export interface EngineReadiness {
  ready: boolean;
  warming?: boolean;
  /** Only /api/assess reports this: false means the Python engine is down. */
  reachable?: boolean;
  transcriberReady?: boolean;
  message?: string;
}

export interface TranscribeResponse {
  transcript: string;
  engine: string;
}
