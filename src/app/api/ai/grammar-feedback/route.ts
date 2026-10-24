// FILE: src/app/api/ai/grammar-feedback/route.ts
//
// Spoken grammar feedback: flags grammar errors in what the learner said, with
// a corrected sentence and the grammar point to read. Send either multipart
// {audio, level} (transcribed first) or JSON {transcript, level}. Every issue
// is checked server-side: its grammar point must exist in the packs and its
// quote must really be in the transcript.
//
// Answer: {transcript, issues: [{quote, corrected, grammarPointId, note, url}]}
import { NextResponse } from "next/server";

import { isCefrLevel, type CefrLevel } from "@/lib/platform/content-model";
import { authorizeAi, readAudio, readCappedForm, runCharged } from "@/lib/server/ai-route";
import { grammarFor, transcriberFor } from "@/lib/server/engines";
import { isGeminiConfigured } from "@/lib/server/engines/gemini";
import { appOrigin } from "@/lib/server/env";
import { errorResponse } from "@/lib/server/http";
import { contentLibrary, grammarCandidates } from "@/lib/server/packs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await authorizeAi(request, "grammar_feedback");
  if (!access.ok) return access.response;
  if (!isGeminiConfigured()) return errorResponse(501, "capability_missing", "Spoken grammar feedback isn't available on this server.");

  const isForm = (request.headers.get("content-type") ?? "").includes("multipart/form-data");
  let transcript = "";
  let level: CefrLevel = "B1";
  let audioSeconds = 0;
  let audio = null;
  if (isForm) {
    const form = await readCappedForm(request);
    if (form instanceof Response) return form;
    const checked = await readAudio(form);
    if (checked instanceof Response) return checked;
    audio = checked;
    audioSeconds = checked.seconds;
    const raw = form.get("level");
    if (isCefrLevel(raw)) level = raw;
  } else {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    transcript = typeof body?.transcript === "string" ? body.transcript.trim().slice(0, 4000) : "";
    if (isCefrLevel(body?.level)) level = body.level;
    if (!transcript) return errorResponse(400, "bad_request", "Send a recording or a transcript.");
  }

  const library = await contentLibrary();
  const candidates = grammarCandidates(library, level);
  const result = await runCharged(access, "grammar_feedback", { audioSeconds }, async () => {
    const text = audio ? (await transcriberFor(request).transcribe(audio)).text : transcript;
    const issues = await grammarFor().check(text, level, candidates);
    return { transcript: text, issues: issues.map((issue) => ({ ...issue, url: `${appOrigin()}/learn/grammar/${encodeURIComponent(issue.grammarPointId)}` })) };
  });
  return result.ok ? NextResponse.json(result.value) : result.response;
}
