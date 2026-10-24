// FILE: src/app/api/ai/placement/route.ts
//
// The spoken half of the placement test. The written quiz is scored on the
// device; this analyses the 30-second spoken answer and moves the written
// estimate by at most one level. Send multipart {audio, writtenLevel} or JSON
// {transcript, writtenLevel}. Without AI the app keeps the written estimate.
//
// Answer: {level, confidence, strengths[], focus[], spokenUsed, transcript}
import { NextResponse } from "next/server";

import { isCefrLevel, type CefrLevel } from "@/lib/platform/content-model";
import { authorizeAi, readAudio, readCappedForm, runCharged } from "@/lib/server/ai-route";
import { grammarFor, transcriberFor } from "@/lib/server/engines";
import { isGeminiConfigured } from "@/lib/server/engines/gemini";
import { combinePlacement } from "@/lib/server/engines/prompts";
import { errorResponse } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await authorizeAi(request, "placement");
  if (!access.ok) return access.response;
  if (!isGeminiConfigured()) return errorResponse(501, "capability_missing", "Spoken placement isn't available on this server.");

  const isForm = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
  let writtenLevel: CefrLevel | null = null;
  let transcript = "";
  let audio = null;
  if (isForm) {
    const form = await readCappedForm(request);
    if (form instanceof Response) return form;
    const checked = await readAudio(form);
    if (checked instanceof Response) return checked;
    audio = checked;
    const raw = form.get("writtenLevel");
    if (isCefrLevel(raw)) writtenLevel = raw;
  } else {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, 4000) : "";
    if (isCefrLevel(body?.writtenLevel)) writtenLevel = body.writtenLevel;
  }
  if (!writtenLevel) return errorResponse(400, "bad_request", "writtenLevel is required.");
  if (!audio && !transcript) return errorResponse(400, "bad_request", "Send a recording or a transcript.");

  const level = writtenLevel;
  const result = await runCharged(access, "placement", { audioSeconds: audio?.seconds ?? 0 }, async () => {
    const text = audio ? (await transcriberFor(request).transcribe(audio)).text : transcript;
    const analysed = text.split(/\s+/).length >= 8 ? await grammarFor().place(text, level) : null;
    return { ...combinePlacement(level, analysed), transcript: text };
  });
  return result.ok ? NextResponse.json(result.value) : result.response;
}
