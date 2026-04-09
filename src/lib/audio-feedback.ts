export const CORRECT_SOUND_SRC = "/sound/correct.wav";
export const INCORRECT_SOUND_SRC = "/sound/incorrect.wav";
export const COMPLETE_SOUND_SRC = "/sound/complete.wav";

export const CORRECT_SOUND_VOLUME = 0.18;
export const INCORRECT_SOUND_VOLUME = 0.15;
export const COMPLETE_SOUND_VOLUME = 0.22;
export const REFERENCE_WORD_PLAYBACK_VOLUME = 0.72;

export function createCorrectAudio() {
  const audio = new Audio(CORRECT_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = CORRECT_SOUND_VOLUME;
  return audio;
}

export function createIncorrectAudio() {
  const audio = new Audio(INCORRECT_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = INCORRECT_SOUND_VOLUME;
  return audio;
}

export function createCompleteAudio() {
  const audio = new Audio(COMPLETE_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = COMPLETE_SOUND_VOLUME;
  return audio;
}

export function configureReferenceWordPlayback(audio: HTMLAudioElement) {
  audio.volume = REFERENCE_WORD_PLAYBACK_VOLUME;
  return audio;
}
