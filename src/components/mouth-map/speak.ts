// FILE: src/components/mouth-map/speak.ts
//
// Plays a model word with the browser's own voice: free, offline on most
// systems, no request to any server. Pre-generated pack audio replaces this
// when a sounds pack with audio is installed.
"use client";

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakWord(text: string, variant: "GA" | "RP" = "GA"): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const lang = variant === "RP" ? "en-GB" : "en-US";
  utterance.lang = lang;
  utterance.rate = 0.85;
  const voice = synth.getVoices().find((v) => v.lang === lang) ?? synth.getVoices().find((v) => v.lang.startsWith("en"));
  if (voice) utterance.voice = voice;
  synth.speak(utterance);
}
