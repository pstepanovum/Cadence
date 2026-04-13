import { NextResponse } from "next/server";
import { getAiEngineUrlForRequest } from "@/lib/runtime/request-runtime";
import {
  generateJustSpeakFeedbackWithGemini,
  isJustSpeakGeminiConfigured,
} from "@/lib/just-speak-gemini";

export const runtime = "nodejs";

type TranscribePayload = {
  text?: string;
  transcript?: string;
  [key: string]: unknown;
};

function pickTranscript(payload: TranscribePayload | null): string {
  const v = String(payload?.text ?? payload?.transcript ?? "").trim();
  return v;
}

export async function POST(request: Request) {
  const engineUrl = getAiEngineUrlForRequest(request);
  const formData = await request.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return NextResponse.json({ error: "An audio file is required." }, { status: 400 });
  }

  const transcribeFormData = new FormData();
  transcribeFormData.set("audio", audio, audio.name || "attempt.wav");

  try {
    const transcribeRes = await fetch(`${engineUrl}/transcribe`, {
      method: "POST",
      body: transcribeFormData,
      cache: "no-store",
    });

    const transcribeJson = (await transcribeRes.json().catch(() => null)) as
      | TranscribePayload
      | null;

    if (!transcribeRes.ok) {
      const message =
        transcribeJson && typeof transcribeJson === "object" && "detail" in transcribeJson
          ? String((transcribeJson as { detail?: unknown }).detail)
          : "FastAPI transcription failed.";
      return NextResponse.json({ error: message }, { status: transcribeRes.status });
    }

    const whisperTranscript = pickTranscript(transcribeJson);

    const feedback = isJustSpeakGeminiConfigured()
      ? await generateJustSpeakFeedbackWithGemini({
          whisperTranscript,
          overallScore: null,
          engineTranscript: null,
          phonemeDetail: { whisperTranscript },
        })
      : null;

    return NextResponse.json({
      whisperTranscript,
      feedback,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Just Speak is offline. Make sure the local ai-engine service is healthy, then try again.",
      },
      { status: 503 },
    );
  }
}

