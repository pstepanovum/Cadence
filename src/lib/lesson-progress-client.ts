// Browser-side calls that save lesson and conversation progress. Saving is best
// effort: a failure never interrupts the lesson, but it is logged, not dropped.
import type { AttemptPayload } from "@/lib/learn";

async function send(url: string, method: "POST" | "PATCH", body: unknown): Promise<Response | null> {
  try {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`${method} ${url} failed with ${response.status}`);
      return null;
    }

    return response;
  } catch (error) {
    console.error(`${method} ${url} failed`, error);
    return null;
  }
}

/** Start a lesson session; resolves to its id, or null when it could not be saved. */
export async function startLessonSession(lesson: { id: string; module_id: number }): Promise<string | null> {
  const response = await send("/api/sessions", "POST", {
    lesson_id: lesson.id,
    module_id: lesson.module_id,
  });
  if (!response) return null;

  try {
    const data = (await response.json()) as { sessionId?: string };
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

export async function endLessonSession(
  sessionId: string,
  result: { word_count: number; avg_score: number; passed: boolean },
): Promise<void> {
  await send(`/api/sessions/${sessionId}`, "PATCH", result);
}

export async function recordAttempt(attempt: AttemptPayload): Promise<void> {
  await send("/api/attempts", "POST", attempt);
}

export async function saveExamScore(moduleId: number, examScore: number): Promise<void> {
  await send("/api/progress", "PATCH", { module_id: moduleId, exam_score: examScore });
}

export async function saveConversationScore(moduleSlug: string, score: number, passed: boolean): Promise<void> {
  await send("/api/conversation-progress", "PATCH", { moduleSlug, score, passed });
}
