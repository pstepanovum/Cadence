// FILE: src/components/advanced/target-audio.ts
//
// "Hear the target" for phrases, slang and drills: the pack's pre-generated
// audio when it exists, else the coach voice from your own Cadence or, with
// Plus, the cloud (/api/reference-audio, which routing allows or refuses;
// asked quietly, so a refusal never raises the AI offer banner),
// else the browser's own voice, so there is always something to hear.
"use client";

import { cloudFetch } from "@/hooks/cloud-fetch";

let current: HTMLAudioElement | null = null;
const cache = new Map<string, string>();

export function stopTarget() {
  current?.pause();
  current = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}

function playUrl(url: string): Promise<void> {
  stopTarget();
  return new Promise((resolve) => {
    const audio = new Audio(url);
    current = audio;
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

function speakInBrowser(text: string, rate: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = rate;
    const voice = synth.getVoices().find((v) => v.lang === "en-US") ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
    if (voice) utterance.voice = voice;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}

/** Plays the target and resolves when it ends. `slow` uses a slower rate where the source allows it. */
export async function playTarget(text: string, options: { audioUrl?: string | null; slow?: boolean } = {}): Promise<void> {
  if (options.audioUrl && !options.slow) return playUrl(options.audioUrl);
  const cached = cache.get(text);
  if (cached && !options.slow) return playUrl(cached);
  if (!options.slow) {
    try {
      const response = await cloudFetch(`/api/reference-audio?${new URLSearchParams({ text })}`, { cache: "no-store" });
      if (response.ok && (response.headers.get("content-type") ?? "").startsWith("audio/")) {
        const url = URL.createObjectURL(await response.blob());
        cache.set(text, url);
        return playUrl(url);
      }
    } catch {
      // No engine and no Plus: the browser's voice below.
    }
  }
  return speakInBrowser(text, options.slow ? 0.7 : 0.95);
}
