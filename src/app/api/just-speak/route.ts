// FILE: src/app/api/just-speak/route.ts
//
// Free speaking: transcribe, then feedback on what was said. Own Cadence runs
// the local engine; the hosted cloud needs Plus and charges the recording's
// length plus one analysis against the daily quota.
import { NextResponse } from "next/server";

import { generateJustSpeakFeedbackWithGemini, isJustSpeakGeminiConfigured } from "@/lib/just-speak-gemini";
import { authorizeAi, readAudio, readCappedForm, runCharged } from "@/lib/server/ai-route";
import { transcriberFor } from "@/lib/server/engines";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const access = await authorizeAi(request, "grammar_feedback");
  if (!access.ok) return access.response;
  const form = await readCappedForm(request);
  if (form instanceof Response) return form;
  const audio = await readAudio(form);
  if (audio instanceof Response) return audio;

  const result = await runCharged(access, "grammar_feedback", { audioSeconds: audio.seconds }, async () => {
    const { text } = await transcriberFor(request).transcribe(audio);
    const feedback = isJustSpeakGeminiConfigured()
      ? await generateJustSpeakFeedbackWithGemini({ whisperTranscript: text, overallScore: null, engineTranscript: null, phonemeDetail: { whisperTranscript: text } })
      : null;
    return { whisperTranscript: text, feedback };
  });
  return result.ok ? NextResponse.json(result.value) : result.response;
}
