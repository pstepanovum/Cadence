import { createAudioPlayer, type AudioSource } from "expo-audio";
import completeWav from "@/assets/sounds/complete.wav";
import correctWav from "@/assets/sounds/correct.wav";
import incorrectWav from "@/assets/sounds/incorrect.wav";
import { prefs } from "@/lib/prefs";

// Mirrors src/lib/audio-feedback.ts on web: a short cue after each
// assessment (>50 counts as a pass) and a fanfare on lesson completion.

function play(source: AudioSource | number) {
  // Settings > Sounds turns the cues off; speech and recordings are unaffected.
  if (!prefs.get().sounds) return;
  const player = createAudioPlayer(source);
  player.play();
  // Free the native player once the clip has surely finished.
  setTimeout(() => player.remove(), 4000);
}

export function playAssessmentFeedback(score: number) {
  play(score > 50 ? correctWav : incorrectWav);
}

export function playCompletionSound() {
  play(completeWav);
}
