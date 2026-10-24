// FILE: src/app/api/reference-audio/route.ts
//
// Reference (model) audio for a phrase. Lesson and flashcard audio is
// pre-generated in the content packs, so this is the rare request-time path.
// Own Cadence: the local TTS engine, ungated. Hosted cloud: Plus, the daily
// character quota, Google Cloud Text-to-Speech with a Cloud Storage cache.
// GET ?text=&instruct=  and  POST {text, instruct?, voice?} answer audio.
import { speak } from "@/lib/server/ai-tts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  return speak(request, { text: params.get("text"), instruct: params.get("instruct"), voice: params.get("voice") });
}

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return speak(request, body);
}
