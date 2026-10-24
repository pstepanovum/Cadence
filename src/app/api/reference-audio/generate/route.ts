// FILE: src/app/api/reference-audio/generate/route.ts
//
// The same as POST /api/reference-audio, kept for clients that call this path.
import { speak } from "@/lib/server/ai-tts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  return speak(request, body);
}
