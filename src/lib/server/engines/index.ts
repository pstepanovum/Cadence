// FILE: src/lib/server/engines/index.ts
//
// One interface per AI capability, with the provider picked by environment
// variable so a provider is swapped by config, not code (docs/PLATFORM.md
// section 6.1):
//
//   ENGINE_SCORER       local | cloud-run              (cloud: cloud-run, own: local)
//   ENGINE_TRANSCRIBER  local | whisper-cpu | gemini   (cloud: gemini until the benchmark says otherwise)
//   ENGINE_TTS          local | google-tts             (cloud: google-tts)
//   ENGINE_COACH        local | gemini                 (cloud: gemini)
//   ENGINE_GRAMMAR      local | gemini                 (cloud: gemini)
//
// `local` is the learner's own engines (ai-engine and coach-engine, as before,
// on the desktop's ports for the desktop app); `cloud-run` and `whisper-cpu`
// are the same ai-engine image running as cadence-ai, reached with a Google
// ID token. Nothing here decides who may call: that is ../ai-gate.ts.
import { createHash } from "node:crypto";

import { getAiEngineUrlForRequest, getCoachEngineUrlForRequest } from "../../runtime/request-runtime";
import { isHostedCloud } from "../env";
import { audioBlob, type AudioUpload } from "./audio";
import { MODELS, generateJson } from "./gemini";
import { accessToken, engineNeedsIdToken, idToken } from "./google-auth";
import {
  COACH_MAX_OUTPUT_TOKENS,
  COACH_SCHEMA,
  GRAMMAR_SCHEMA,
  PLACEMENT_SCHEMA,
  coachContents,
  coachSystemPrompt,
  filterGrammarIssues,
  grammarSystemPrompt,
  placementSystemPrompt,
  sanitizeCoachText,
  type CoachScenario,
  type CoachTurn,
  type GrammarCandidate,
  type GrammarIssue,
} from "./prompts";
import type { CefrLevel } from "../../platform/content-model";

export class EngineError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 502, code = "engine_failed") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface SpeechScorer {
  score(audio: AudioUpload, target: string): Promise<unknown>;
}
export interface Transcriber {
  transcribe(audio: AudioUpload): Promise<{ text: string }>;
}
export interface Synthesizer {
  speak(text: string, options?: { voice?: string; instruct?: string }): Promise<{ audio: ArrayBuffer; contentType: string; cached: boolean }>;
}
export interface CoachInput {
  scenario: CoachScenario | null;
  topic?: string;
  history: CoachTurn[];
  summary?: string;
  start: boolean;
  /** The existing local coach-engine payload, passed through unchanged. */
  legacy?: Record<string, unknown>;
}
export interface CoachOutput {
  coachMessage: string;
  learnerReply: string;
  summary: string;
}
export interface CoachModel {
  turn(input: CoachInput): Promise<CoachOutput>;
}
export interface GrammarAnalyzer {
  check(transcript: string, level: CefrLevel, candidates: GrammarCandidate[]): Promise<GrammarIssue[]>;
  place(transcript: string, writtenLevel: CefrLevel): Promise<unknown>;
}

type Env = Record<string, string | undefined>;

function choice(name: string, allowed: string[], cloudDefault: string, ownDefault: string, env: Env = process.env): string {
  const value = env[name]?.trim();
  if (value && allowed.includes(value)) return value;
  return isHostedCloud(env) ? cloudDefault : ownDefault;
}

// HTTP to the ai-engine image ----------------------------------------------------

function cloudAiUrl(request: Request): string {
  return (process.env.CADENCE_AI_URL?.trim() || getAiEngineUrlForRequest(request)).replace(/\/$/, "");
}

async function engineFetch(url: string, init: RequestInit, timeoutMs = 60_000): Promise<Response> {
  const headers = new Headers(init.headers);
  if (engineNeedsIdToken(url)) headers.set("Authorization", `Bearer ${await idToken(url)}`);
  try {
    return await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new EngineError("The speech engine is offline or still warming up. Try again in a moment.", 503, "engine_unreachable");
  }
}

async function engineJson(response: Response, what: string): Promise<unknown> {
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const detail = payload && "detail" in payload ? String(payload.detail) : `${what} failed.`;
    throw new EngineError(detail, response.status >= 500 ? 502 : response.status, "engine_failed");
  }
  return payload;
}

function engineScorer(base: string): SpeechScorer {
  return {
    async score(audio, target) {
      const form = new FormData();
      form.set("audio", audioBlob(audio), audio.filename);
      form.set("text", target);
      return engineJson(await engineFetch(`${base}/assess`, { method: "POST", body: form }), "Scoring");
    },
  };
}

function engineTranscriber(base: string): Transcriber {
  return {
    async transcribe(audio) {
      const form = new FormData();
      form.set("audio", audioBlob(audio), audio.filename);
      const payload = (await engineJson(await engineFetch(`${base}/transcribe`, { method: "POST", body: form }), "Transcription")) as Record<string, unknown> | null;
      return { text: String(payload?.text ?? payload?.transcript ?? "").trim() };
    },
  };
}

// Gemini ---------------------------------------------------------------------

const geminiTranscriber: Transcriber = {
  async transcribe(audio) {
    const result = await generateJson<{ text?: unknown }>({
      model: MODELS.transcribe,
      system: "Transcribe the English speech in the audio exactly as spoken, including mistakes. Do not correct grammar. Output JSON only: {\"text\": string}.",
      contents: [{ role: "user", parts: [{ inlineData: { mimeType: audio.mimeType, data: Buffer.from(audio.bytes).toString("base64") } }] }],
      schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] },
      maxOutputTokens: 600,
      temperature: 0,
    });
    return { text: typeof result.text === "string" ? result.text.trim().slice(0, 4000) : "" };
  },
};

const geminiCoach: CoachModel = {
  async turn(input) {
    const raw = await generateJson<Record<string, unknown>>({
      model: MODELS.coach,
      system: coachSystemPrompt(input.scenario),
      contents: coachContents(input),
      schema: COACH_SCHEMA,
      maxOutputTokens: COACH_MAX_OUTPUT_TOKENS,
      temperature: 0.8,
    });
    const coachMessage = sanitizeCoachText(raw.coachMessage);
    if (!coachMessage) throw new EngineError("The coach had nothing to say. Try again.");
    let learnerReply = sanitizeCoachText(raw.learnerReply, 200);
    if (learnerReply && !/[.!?]$/.test(learnerReply)) learnerReply = `${learnerReply}.`;
    return { coachMessage, learnerReply, summary: sanitizeCoachText(raw.summary, 300) };
  },
};

const geminiGrammar: GrammarAnalyzer = {
  async check(transcript, level, candidates) {
    if (!transcript.trim() || candidates.length === 0) return [];
    const raw = await generateJson<unknown>({
      model: MODELS.analysis,
      system: grammarSystemPrompt(level, candidates),
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ transcript }) }] }],
      schema: GRAMMAR_SCHEMA,
      maxOutputTokens: 600,
      temperature: 0.1,
    });
    return filterGrammarIssues(raw, transcript, new Set(candidates.map((c) => c.id)));
  },
  async place(transcript, writtenLevel) {
    return generateJson<unknown>({
      model: MODELS.analysis,
      system: placementSystemPrompt(writtenLevel),
      contents: [{ role: "user", parts: [{ text: JSON.stringify({ transcript }) }] }],
      schema: PLACEMENT_SCHEMA,
      maxOutputTokens: 300,
      temperature: 0.1,
    });
  },
};

// Local coach engine (Qwen) ------------------------------------------------------

function localCoach(base: string): CoachModel {
  return {
    async turn(input) {
      const payload = input.legacy ?? {
        action: input.start ? "start" : "continue",
        topic: input.scenario?.title ?? input.topic ?? "open discussion",
        mode: "target",
        history: input.history.map((turn) => ({ role: turn.role === "coach" ? "coach" : "user", content: turn.text })),
      };
      const response = await engineFetch(`${base}/coach-turn`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }, 120_000);
      const result = (await engineJson(response, "The coach")) as { turn?: { coachMessage?: unknown; learnerReply?: unknown } } | null;
      return { coachMessage: String(result?.turn?.coachMessage ?? ""), learnerReply: String(result?.turn?.learnerReply ?? ""), summary: "" };
    },
  };
}

const unavailableGrammar: GrammarAnalyzer = {
  async check() {
    throw new EngineError("Spoken grammar feedback needs a newer Cadence server.", 501, "capability_missing");
  },
  async place() {
    throw new EngineError("Spoken placement analysis needs a newer Cadence server.", 501, "capability_missing");
  },
};

// Text to speech ------------------------------------------------------------------

function localSynthesizer(base: string): Synthesizer {
  return {
    async speak(text, options = {}) {
      const form = new FormData();
      form.set("text", text);
      if (options.instruct) form.set("instruct", options.instruct);
      const response = await engineFetch(`${base}/reference-audio`, { method: "POST", body: form }, 120_000);
      if (!response.ok) await engineJson(response, "Reference audio");
      return { audio: await response.arrayBuffer(), contentType: response.headers.get("content-type") ?? "audio/wav", cached: false };
    },
  };
}

export const TTS_VOICES: Record<string, { languageCode: string; name: string }> = {
  "en-US": { languageCode: "en-US", name: process.env.TTS_VOICE_US?.trim() || "en-US-Neural2-F" },
  "en-GB": { languageCode: "en-GB", name: process.env.TTS_VOICE_GB?.trim() || "en-GB-Neural2-B" },
};

/** The cache key the content pipeline uses too: sha256 of voice|rate|text. */
export function ttsCacheKey(voice: string, rate: number, text: string): string {
  return createHash("sha256").update(`${voice}|${rate}|${text}`).digest("hex");
}

const googleTts: Synthesizer = {
  async speak(text, options = {}) {
    const voice = TTS_VOICES[options.voice ?? "en-US"] ?? TTS_VOICES["en-US"];
    const rate = 1;
    const key = ttsCacheKey(voice.name, rate, text);
    const bucket = process.env.TTS_CACHE_BUCKET?.trim();
    const token = await accessToken();
    const object = `tts/${key}.mp3`;

    if (bucket) {
      const cached = await fetch(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(object)}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (cached?.ok) return { audio: await cached.arrayBuffer(), contentType: "audio/mpeg", cached: true };
    }

    const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ input: { text }, voice, audioConfig: { audioEncoding: "MP3", speakingRate: rate } }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => null)) as { audioContent?: string } | null;
    if (!response.ok || !payload?.audioContent) throw new EngineError("Text to speech failed. Try again.");
    const audio = Buffer.from(payload.audioContent, "base64");

    if (bucket) {
      // Best effort: a failed cache write costs one more synthesis later, nothing else.
      await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(object)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "audio/mpeg" },
        body: audio,
        signal: AbortSignal.timeout(5000),
      }).catch(() => undefined);
    }
    return { audio: audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer, contentType: "audio/mpeg", cached: false };
  },
};

// Selection ------------------------------------------------------------------

export function scorerFor(request: Request): SpeechScorer {
  const provider = choice("ENGINE_SCORER", ["local", "cloud-run"], "cloud-run", "local");
  return engineScorer(provider === "cloud-run" ? cloudAiUrl(request) : getAiEngineUrlForRequest(request).replace(/\/$/, ""));
}

export function transcriberFor(request: Request): Transcriber {
  const provider = choice("ENGINE_TRANSCRIBER", ["local", "whisper-cpu", "gemini"], "gemini", "local");
  if (provider === "gemini") return geminiTranscriber;
  return engineTranscriber(provider === "whisper-cpu" ? cloudAiUrl(request) : getAiEngineUrlForRequest(request).replace(/\/$/, ""));
}

export function synthesizerFor(request: Request): Synthesizer {
  const provider = choice("ENGINE_TTS", ["local", "google-tts"], "google-tts", "local");
  return provider === "google-tts" ? googleTts : localSynthesizer(getAiEngineUrlForRequest(request).replace(/\/$/, ""));
}

export function coachFor(request: Request): CoachModel {
  const provider = choice("ENGINE_COACH", ["local", "gemini"], "gemini", "local");
  return provider === "gemini" ? geminiCoach : localCoach(getCoachEngineUrlForRequest(request).replace(/\/$/, ""));
}

export function grammarFor(): GrammarAnalyzer {
  const provider = choice("ENGINE_GRAMMAR", ["local", "gemini"], "gemini", "gemini");
  return provider === "gemini" ? geminiGrammar : unavailableGrammar;
}
