// Shared types for the module/lesson learning system.

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
