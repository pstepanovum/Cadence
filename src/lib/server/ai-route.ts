// FILE: src/lib/server/ai-route.ts
//
// The shared shape of an AI route: authorize (ai-gate), read and check the
// upload, charge the quota, call the engine, settle or refund. Errors from an
// engine become a clear JSON error, never a stack trace.
import type { AiCapability, UsageRequest } from "../platform/engine-routing";
import { AUDIO_MAX_BYTES } from "../platform/engine-routing";
import { authorizeAi, chargeAi, type AiAccess } from "./ai-gate";
import { readAudioField, type AudioUpload } from "./engines/audio";
import { EngineError } from "./engines/index";
import { GeminiError } from "./engines/gemini";
import { errorResponse } from "./http";

export type Granted = Extract<AiAccess, { ok: true }>;

/** Multipart bodies are refused by declared size before they are read. */
export async function readCappedForm(request: Request): Promise<FormData | Response> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > AUDIO_MAX_BYTES + 64 * 1024) {
    return errorResponse(413, "audio_too_large", "That recording is too large. Keep it under 30 seconds.");
  }
  const form = await request.formData().catch(() => null);
  return form ?? errorResponse(400, "bad_request", "Send the recording as multipart form data.");
}

export async function readAudio(form: FormData): Promise<AudioUpload | Response> {
  const check = await readAudioField(form);
  return check.ok ? check.audio : errorResponse(check.status, check.error, check.message);
}

export function engineErrorResponse(error: unknown): Response {
  if (error instanceof EngineError) return errorResponse(error.status, error.code, error.message);
  if (error instanceof GeminiError) return errorResponse(502, "engine_failed", "The AI service didn't answer. Try again in a moment.");
  console.error("AI engine call failed:", error instanceof Error ? error.message : error);
  return errorResponse(502, "engine_failed", "The AI service didn't answer. Try again in a moment.");
}

/** Charges, runs, then settles the spend or refunds the charge. */
export async function runCharged<T>(access: Granted, capability: AiCapability, usage: UsageRequest, run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  const charged = await chargeAi(access, capability, usage);
  if (!charged.ok) return charged;
  try {
    const value = await run();
    await charged.charge.settle();
    return { ok: true, value };
  } catch (error) {
    await charged.charge.refund();
    return { ok: false, response: engineErrorResponse(error) };
  }
}

export { authorizeAi };
