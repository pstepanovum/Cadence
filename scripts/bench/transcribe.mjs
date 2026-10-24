#!/usr/bin/env node
// FILE: scripts/bench/transcribe.mjs
//
// The cloud transcription benchmark behind docs/PLATFORM.md section 6.2:
// Gemini audio input against Whisper on CPU, on a fixed, openly licensed
// English set (the first clips of LibriSpeech dev-clean, CC BY 4.0, through
// Hugging Face's librispeech_asr_dummy). Prints word error rate, latency and
// cost per audio minute for each engine as a Markdown table.
//
//   node scripts/bench/transcribe.mjs [--clips 10] [--engines gemini,whisper]
//
// Gemini: GEMINI_API_KEY from the environment or ~/.config/pstepanov/gemini.env
// (read, never printed); model GEMINI_BENCH_MODEL (default
// gemini-2.5-flash-lite), the same prompt as the server's transcriber. This
// calls a paid API: ten clips cost well under one US cent.
// Whisper: BENCH_PYTHON (default the ai-engine's .venv-web-arm64 python, with
// torch and transformers), WHISPER_BENCH_MODEL (default openai/whisper-small),
// 2 CPU threads like cadence-ai's 2 vCPU. Needs ffmpeg to turn FLAC into the
// 16 kHz WAV the iOS app records.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CACHE = join(ROOT, "build/bench/librispeech");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const CLIPS = Math.max(1, Math.min(70, Number(option("clips", "10")) || 10));
const ENGINES = option("engines", "gemini,whisper").split(",").map((e) => e.trim());

// Prices in USD (cloud.google.com/vertex-ai/generative-ai/pricing and
// cloud.google.com/run/pricing, October 2026). Override with env if they move.
const PRICE = {
  geminiAudioInPerMTok: Number(process.env.BENCH_GEMINI_AUDIO_IN ?? 0.3),
  geminiTextInPerMTok: Number(process.env.BENCH_GEMINI_TEXT_IN ?? 0.1),
  geminiOutPerMTok: Number(process.env.BENCH_GEMINI_OUT ?? 0.4),
  runVcpuSecond: Number(process.env.BENCH_RUN_VCPU_S ?? 0.000024),
  runGibSecond: Number(process.env.BENCH_RUN_GIB_S ?? 0.0000025),
};
const RUN_VCPU = 2;
const RUN_GIB = 4;

const SYSTEM = 'Transcribe the English speech in the audio exactly as spoken, including mistakes. Do not correct grammar. Output JSON only: {"text": string}.';

function geminiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const file = join(homedir(), ".config/pstepanov/gemini.env");
  if (!existsSync(file)) return null;
  const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*["']?([^"'\s]+)/m.exec(readFileSync(file, "utf8"));
  return match ? match[1] : null;
}

/** Downloads (once) the first CLIPS clips with their reference text, as 16 kHz mono WAV. */
async function clips() {
  mkdirSync(CACHE, { recursive: true });
  const index = join(CACHE, "index.json");
  let rows = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : [];
  if (rows.length < CLIPS) {
    const url = `https://datasets-server.huggingface.co/rows?dataset=hf-internal-testing%2Flibrispeech_asr_dummy&config=clean&split=validation&offset=0&length=${CLIPS}`;
    const body = await (await fetch(url)).json();
    rows = [];
    for (const { row } of body.rows) {
      const flac = join(CACHE, `${row.id}.flac`);
      const wav = join(CACHE, `${row.id}.wav`);
      if (!existsSync(wav)) {
        writeFileSync(flac, Buffer.from(await (await fetch(row.audio[0].src)).arrayBuffer()));
        execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", flac, "-ac", "1", "-ar", "16000", "-sample_fmt", "s16", wav]);
      }
      rows.push({ id: row.id, wav, text: row.text });
    }
    writeFileSync(index, JSON.stringify(rows, null, 1));
  }
  return rows.slice(0, CLIPS).map((row) => {
    const bytes = readFileSync(row.wav);
    return { ...row, bytes, seconds: (bytes.length - 44) / 32000 };
  });
}

function words(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/'/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level edit distance: substitutions + deletions + insertions. */
function edits(reference, hypothesis) {
  const previous = Array.from({ length: hypothesis.length + 1 }, (_, i) => i);
  for (let i = 1; i <= reference.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= hypothesis.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (reference[i - 1] === hypothesis[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[hypothesis.length];
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

async function runGemini(set) {
  const key = geminiKey();
  if (!key) return { skipped: "no GEMINI_API_KEY" };
  const model = process.env.GEMINI_BENCH_MODEL ?? "gemini-2.5-flash-lite";
  const results = [];
  let cost = 0;
  for (const clip of set) {
    const started = performance.now();
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ inlineData: { mimeType: "audio/wav", data: clip.bytes.toString("base64") } }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 600, responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] } },
      }),
    });
    const seconds = (performance.now() - started) / 1000;
    const body = await response.json();
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${body?.error?.message ?? "error"}`);
    let text = "";
    try {
      text = JSON.parse(body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "{}").text ?? "";
    } catch {
      text = "";
    }
    const usage = body.usageMetadata ?? {};
    const audioTokens = (usage.promptTokensDetails ?? []).find((d) => d.modality === "AUDIO")?.tokenCount ?? 0;
    const textTokens = (usage.promptTokenCount ?? 0) - audioTokens;
    cost += (audioTokens * PRICE.geminiAudioInPerMTok + textTokens * PRICE.geminiTextInPerMTok + (usage.candidatesTokenCount ?? 0) * PRICE.geminiOutPerMTok) / 1e6;
    results.push({ clip, text, seconds });
  }
  return { name: `Gemini (${model}, audio)`, results, cost };
}

function runWhisper(set) {
  const python = process.env.BENCH_PYTHON ?? join(ROOT, "src/backend/ai-engine/.venv-web-arm64/bin/python");
  if (!existsSync(python)) return { skipped: `no Python at ${python}` };
  const model = process.env.WHISPER_BENCH_MODEL ?? "openai/whisper-small";
  const run = spawnSync(python, ["-I", join(ROOT, "scripts/bench/whisper_cpu.py"), model, String(RUN_VCPU), ...set.map((c) => c.wav)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) return { skipped: `whisper failed: ${run.stderr.split("\n").filter(Boolean).slice(-1)[0] ?? run.status}` };
  const lines = run.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
  const byFile = new Map(lines.filter((l) => l.file).map((l) => [l.file, l]));
  const results = set.map((clip) => ({ clip, text: byFile.get(clip.wav)?.text ?? "", seconds: byFile.get(clip.wav)?.seconds ?? 0 }));
  const busy = results.reduce((sum, r) => sum + r.seconds, 0);
  const cost = busy * (RUN_VCPU * PRICE.runVcpuSecond + RUN_GIB * PRICE.runGibSecond);
  return { name: `${model}, CPU x${RUN_VCPU} (local estimate)`, results, cost };
}

function report(run, audioSeconds) {
  if (run.skipped) return `| ${run.name ?? "?"} | skipped: ${run.skipped} | | | | |`;
  let errors = 0;
  let total = 0;
  for (const { clip, text } of run.results) {
    const reference = words(clip.text);
    errors += edits(reference, words(text));
    total += reference.length;
  }
  const latencies = run.results.map((r) => r.seconds);
  const perMinute = run.cost / (audioSeconds / 60);
  return `| ${run.name} | ${run.results.length} | ${((errors / total) * 100).toFixed(1)}% | ${percentile(latencies, 50).toFixed(2)} s | ${percentile(latencies, 95).toFixed(2)} s | $${perMinute.toFixed(5)} |`;
}

const set = await clips();
const audioSeconds = set.reduce((sum, c) => sum + c.seconds, 0);
console.log(`${set.length} clips, ${audioSeconds.toFixed(1)} s of audio (LibriSpeech dev-clean, CC BY 4.0)\n`);
console.log("| Engine | Clips | WER | p50 latency | p95 latency | Cost per audio minute |");
console.log("| --- | --- | --- | --- | --- | --- |");
for (const engine of ENGINES) {
  const run = engine === "gemini" ? await runGemini(set) : engine === "whisper" ? runWhisper(set) : { name: engine, skipped: "unknown engine" };
  console.log(report({ name: engine, ...run }, audioSeconds));
}
