// FILE: src/lib/server/ai-tts.ts
//
// Request-time reference audio, shared by /api/reference-audio and its older
// /generate path. See the route for the rules.
import { NextResponse } from "next/server";

import { authorizeAi, runCharged } from "./ai-route";
import { synthesizerFor } from "./engines/index";

const MAX_CHARS = 400;

export async function speak(request: Request, input: { text?: unknown; instruct?: unknown; voice?: unknown }) {
  const text = typeof input.text === "string" ? input.text.trim() : "";
  if (!text) return NextResponse.json({ error: "Target text is required." }, { status: 400 });
  if (text.length > MAX_CHARS) return NextResponse.json({ error: `Keep the text under ${MAX_CHARS} characters.` }, { status: 400 });
  const instruct = typeof input.instruct === "string" ? input.instruct.trim().slice(0, 200) : undefined;
  const voice = input.voice === "en-GB" ? "en-GB" : "en-US";

  const access = await authorizeAi(request, "tts");
  if (!access.ok) return access.response;
  const result = await runCharged(access, "tts", { characters: text.length }, () => synthesizerFor(request).speak(text, { instruct, voice }));
  if (!result.ok) return result.response;
  return new Response(result.value.audio, {
    headers: { "Content-Type": result.value.contentType, "Cache-Control": "private, max-age=86400" },
  });
}
