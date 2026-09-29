import { api, apiFetch, apiJson } from "@/api/client";
import { requireTransport } from "@/api/transport";
import type {
  CoachHistoryEntry,
  CoachMode,
  CoachTurnResponse,
  ConversationModuleWithProgress,
  EngineReadiness,
  LessonWithSummary,
  ModuleWithProgress,
  AttemptPayload,
  PronunciationAssessment,
  Stats,
  TranscribeResponse,
} from "@/api/types";

export interface RecordedAudio {
  uri: string;
  name: string;
  type: string;
}

function audioFormData(audio: RecordedAudio): FormData {
  const form = new FormData();
  // RN's FormData accepts {uri, name, type} file descriptors.
  form.append("audio", {
    uri: audio.uri,
    name: audio.name,
    type: audio.type,
  } as unknown as Blob);
  return form;
}

// --- AI / audio ---

export function assess(audio: RecordedAudio, text: string): Promise<PronunciationAssessment> {
  const form = audioFormData(audio);
  form.append("text", text);
  return api<PronunciationAssessment>("/api/assess", { method: "POST", body: form });
}

export function transcribe(audio: RecordedAudio): Promise<TranscribeResponse> {
  return api<TranscribeResponse>("/api/transcribe", {
    method: "POST",
    body: audioFormData(audio),
  });
}

export async function getAssessReadiness(): Promise<EngineReadiness & { status: number }> {
  const response = await apiFetch("/api/assess");
  const body = (await response.json().catch(() => ({}))) as EngineReadiness;
  return { ...body, status: response.status };
}

/**
 * Cheap, auth-free liveness probe. Screens use it to tell "the server is down"
 * apart from "this account is empty".
 */
export async function getHealth(): Promise<{ ok: boolean; service?: string }> {
  const response = await apiFetch("/api/health");
  if (!response.ok) return { ok: false };
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; service?: string };
  return { ok: body.ok === true, service: body.service };
}

/**
 * Reference audio is streamed straight into the player rather than fetched, so
 * it needs a full URL. In local mode that points at the paired computer, which
 * means the URL changes if the computer's address changes: callers must build
 * it at play time, not cache it.
 */
export function referenceAudioUrl(text: string, instruct?: string): string {
  const params = new URLSearchParams({ text });
  if (instruct) params.set("instruct", instruct);
  return `${requireTransport().baseUrl}/api/reference-audio?${params.toString()}`;
}

// --- Learn ---

export function getModules(): Promise<ModuleWithProgress[]> {
  return api<ModuleWithProgress[]>("/api/modules");
}

export function getLessons(moduleId: number): Promise<LessonWithSummary[]> {
  return api<LessonWithSummary[]>(`/api/modules/${moduleId}/lessons`);
}

export function getStats(): Promise<Stats> {
  return api<Stats>("/api/stats");
}

export function createSession(lessonId: string, moduleId: number): Promise<{ sessionId: string }> {
  return apiJson("/api/sessions", "POST", { lesson_id: lessonId, module_id: moduleId });
}

export function finishSession(
  sessionId: string,
  payload: { word_count: number; avg_score: number; passed: boolean },
): Promise<unknown> {
  return apiJson(`/api/sessions/${sessionId}`, "PATCH", payload);
}

export function recordAttempt(payload: AttemptPayload): Promise<unknown> {
  return apiJson("/api/attempts", "POST", payload);
}

export function submitExamScore(
  moduleId: number,
  examScore: number,
): Promise<{ passed: boolean; best_exam_score: number }> {
  return apiJson("/api/progress", "PATCH", { module_id: moduleId, exam_score: examScore });
}

/**
 * New cloud accounts have no `user_progress` rows until their first exam, so
 * module 1 renders as locked and the whole Learn tab is a dead end. This is the
 * bootstrap the web app runs for the same reason; it is idempotent.
 */
export function unlockFirstModule(): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/progress", { method: "POST" });
}

// --- AI Coach ---

export async function getCoachReadiness(): Promise<EngineReadiness> {
  // The route answers 503 with a perfectly useful `{ready:false, message}`
  // body when the coach is offline, so this must not go through `api()`, which
  // throws that body away on a non-2xx response.
  const response = await apiFetch("/api/ai-coach");
  const body = (await response.json().catch(() => ({}))) as EngineReadiness;
  return { ...body, ready: body.ready === true };
}

export function coachTurn(payload: {
  action: "start" | "continue";
  topic: string;
  mode: CoachMode;
  history: CoachHistoryEntry[];
}): Promise<CoachTurnResponse> {
  return apiJson("/api/ai-coach", "POST", payload);
}

// --- Conversation ---

export async function getConversationModules(): Promise<ConversationModuleWithProgress[]> {
  const body = await api<{ modules: ConversationModuleWithProgress[] }>(
    "/api/conversation-progress",
  );
  return body.modules;
}

export function saveConversationResult(payload: {
  moduleSlug: string;
  score: number;
  passed: boolean;
}): Promise<unknown> {
  return apiJson("/api/conversation-progress", "PATCH", payload);
}
