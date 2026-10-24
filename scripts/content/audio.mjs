#!/usr/bin/env node
// Pre-generated pack audio (flashcard words, dictation sentences, minimal
// pairs) with Google Cloud Text-to-Speech. It costs money, so it runs only
// with --run and is the owner's step; without it, it prints what is missing.
//
//   node scripts/content/audio.mjs            what would be synthesized
//   node scripts/content/audio.mjs --run      synthesize the missing files
//
// --run needs `gcloud auth print-access-token` to work for a project with the
// Text-to-Speech API on (GOOGLE_CLOUD_PROJECT names it) and ffmpeg for the
// AAC (.m4a) encoding. Files go to scripts/content/.cache/audio/<hash>.m4a,
// named by sha256(voice|rate|text), and build.mjs copies them into the packs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIO_RATE, AUDIO_VOICE, assemblePacks } from "./lib/assemble.mjs";
import { CACHE_DIR } from "./lib/paths.mjs";

const AUDIO_DIR = join(CACHE_DIR, "audio");
const PRICE_PER_MILLION_CHARS = 16; // Neural2, USD, for the estimate only

const wanted = new Map();
for (const pack of assemblePacks()) {
  for (const e of pack.files["content.json"].exercises) {
    if (e.kind === "flashcard") wanted.set(e.audio, e.front);
    if (e.kind === "dictation") wanted.set(e.audio, e.text);
    if (e.kind === "minimal_pair") e.audio.forEach((a, i) => wanted.set(a, e.words[i]));
  }
}
const missing = [...wanted].filter(([path]) => !existsSync(join(AUDIO_DIR, path.slice("audio/".length))));
const chars = missing.reduce((n, [, text]) => n + text.length, 0);
console.log(`${wanted.size} audio files referenced, ${missing.length} missing, ${chars} characters (about $${((chars / 1e6) * PRICE_PER_MILLION_CHARS).toFixed(2)}).`);

if (!process.argv.includes("--run")) process.exit(0);

const project = process.env.GOOGLE_CLOUD_PROJECT;
if (!project) throw new Error("Set GOOGLE_CLOUD_PROJECT to the project that pays for Text-to-Speech.");
const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
mkdirSync(AUDIO_DIR, { recursive: true });
let done = 0;
for (const [path, text] of missing) {
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "x-goog-user-project": project, "content-type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: AUDIO_VOICE.slice(0, 5), name: AUDIO_VOICE },
      audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: 24000, speakingRate: AUDIO_RATE },
    }),
  });
  if (!response.ok) throw new Error(`Text-to-Speech ${response.status} for "${text}"`);
  const { audioContent } = await response.json();
  const wav = join(AUDIO_DIR, "tmp.wav");
  writeFileSync(wav, Buffer.from(audioContent, "base64"));
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "48k", join(AUDIO_DIR, path.slice("audio/".length))]);
  rmSync(wav);
  done += 1;
  if (done % 50 === 0) console.log(`${done}/${missing.length}`);
}
console.log(`Synthesized ${done} files. Run build.mjs to put them in the packs.`);
