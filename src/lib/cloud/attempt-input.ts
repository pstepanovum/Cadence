// FILE: src/lib/cloud/attempt-input.ts
//
// Validating the scores and attempts clients send. Pure, tested in
// tests/cloud/attempt-input.test.ts. Firestore refuses oversized documents, so
// nothing a client sends is stored without a bound on its size.

export const ATTEMPT_TEXT_MAX_LENGTH = 200;
/** Serialized size above which phoneme detail is dropped rather than stored. */
export const PHONEME_DETAIL_MAX_BYTES = 32 * 1024;

/** Scores are percentages; anything outside 0–100 is clamped to it. */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface AttemptInput {
  lessonId: string;
  lessonWordId: string;
  word: string;
  score: number;
  ipaTarget: string | null;
  ipaTranscript: string | null;
  phonemeDetail: Record<string, unknown> | null;
  attemptNumber: number;
}

export type AttemptParseResult =
  | { ok: true; value: AttemptInput }
  | { ok: false; error: string };

function boundedString(value: unknown): string | null {
  return typeof value === "string" && value.length <= ATTEMPT_TEXT_MAX_LENGTH ? value : null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function boundedDetail(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value)) return null;
  try {
    const json = JSON.stringify(value);
    return new TextEncoder().encode(json).length <= PHONEME_DETAIL_MAX_BYTES
      ? (JSON.parse(json) as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseAttemptInput(body: unknown): AttemptParseResult {
  const input = isPlainObject(body) ? body : {};
  const lessonId = boundedString(input.lesson_id);
  const lessonWordId = boundedString(input.lesson_word_id);
  const word = boundedString(input.word);
  const score = input.score;

  if (!lessonId || !lessonWordId || !word || typeof score !== "number" || !Number.isFinite(score)) {
    return { ok: false, error: "lesson_id, lesson_word_id, word and score are required." };
  }

  const attemptNumber =
    typeof input.attempt_number === "number" && Number.isFinite(input.attempt_number)
      ? Math.min(10_000, Math.max(1, Math.round(input.attempt_number)))
      : 1;

  return {
    ok: true,
    value: {
      lessonId,
      lessonWordId,
      word,
      score: clampScore(score),
      ipaTarget: boundedString(input.ipa_target),
      ipaTranscript: boundedString(input.ipa_transcript),
      phonemeDetail: boundedDetail(input.phoneme_detail),
      attemptNumber,
    },
  };
}
