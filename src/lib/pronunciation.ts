// FILE: src/lib/pronunciation.ts
export type PronunciationStatus = "correct" | "mixed" | "needs-work";

export interface PronunciationHighlight {
  text: string;
  status: PronunciationStatus;
  feedback: string;
  /** Start time (seconds) in the learner's recording for this word, from the scorer. */
  replyStartSec?: number;
  /** End time (seconds) in the learner's recording for this word. */
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
