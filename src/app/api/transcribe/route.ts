// FILE: src/app/api/transcribe/route.ts
//
// Transcribes a recording. Own Cadence: the local Whisper engine, ungated.
// Hosted cloud: Plus, App Check and the daily audio quota; the provider is
// ENGINE_TRANSCRIBER (see src/lib/server/engines). Audio is processed in
// memory and never stored.
import { NextResponse } from "next/server";

import { authorizeAi, readAudio, readCappedForm, runCharged } from "@/lib/server/ai-route";
import { transcriberFor } from "@/lib/server/engines";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await authorizeAi(request, "transcribe");
  if (!access.ok) return access.response;
  const form = await readCappedForm(request);
  if (form instanceof Response) return form;
  const audio = await readAudio(form);
  if (audio instanceof Response) return audio;

  const result = await runCharged(access, "transcribe", { audioSeconds: audio.seconds }, () => transcriberFor(request).transcribe(audio));
  return result.ok ? NextResponse.json({ text: result.value.text, transcript: result.value.text }) : result.response;
}
