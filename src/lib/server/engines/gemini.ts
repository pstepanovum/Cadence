// FILE: src/lib/server/engines/gemini.ts
//
// One JSON-only call to Gemini. On the hosted cloud it goes through Vertex AI
// with the service account (no key anywhere); a developer machine can use
// GEMINI_API_KEY with the Gemini API instead. Every call has a fixed system
// instruction, a response schema, an output cap and no tools.
import { accessToken } from "./google-auth";
import { firebaseProjectId, isHostedCloud } from "../env";

export const MODELS = {
  /** Coach turns: the cheapest model that holds a conversation. */
  coach: process.env.GEMINI_COACH_MODEL?.trim() || "gemini-2.5-flash-lite",
  /** Spoken grammar feedback and placement analysis. */
  analysis: process.env.GEMINI_ANALYSIS_MODEL?.trim() || "gemini-2.5-flash",
  /** Cloud transcription, when the benchmark picks Gemini. */
  transcribe: process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || "gemini-2.5-flash-lite",
} as const;

export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };
export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequest {
  model: string;
  system: string;
  contents: GeminiContent[];
  schema: object;
  maxOutputTokens: number;
  temperature?: number;
}

export function isGeminiConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return viaVertex(env) ? Boolean(firebaseProjectId(env)) : Boolean(env.GEMINI_API_KEY?.trim());
}

function viaVertex(env: Record<string, string | undefined> = process.env): boolean {
  if (env.GEMINI_BACKEND === "vertex") return true;
  if (env.GEMINI_BACKEND === "api-key") return false;
  return isHostedCloud(env);
}

export class GeminiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function generateJson<T>(request: GeminiRequest, timeoutMs = 30_000): Promise<T> {
  const body = {
    systemInstruction: { parts: [{ text: request.system }] },
    contents: request.contents,
    generationConfig: {
      temperature: request.temperature ?? 0.7,
      maxOutputTokens: request.maxOutputTokens,
      responseMimeType: "application/json",
      responseSchema: request.schema,
    },
  };

  let url: string;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (viaVertex()) {
    const project = firebaseProjectId();
    const region = process.env.VERTEX_REGION?.trim() || "us-central1";
    url = `https://${region}-aiplatform.googleapis.com/v1/projects/${project}/locations/${region}/publishers/google/models/${encodeURIComponent(request.model)}:generateContent`;
    headers.Authorization = `Bearer ${await accessToken()}`;
  } else {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) throw new GeminiError("GEMINI_API_KEY is not set.");
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(request.model)}:generateContent`;
    headers["x-goog-api-key"] = key;
  }

  const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  const data = (await response.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  if (!response.ok) throw new GeminiError(`Gemini answered ${response.status}.`, response.status);
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new GeminiError("Gemini returned something that isn't JSON.");
  }
}
