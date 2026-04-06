export const PRACTICE_SUCCESS_SOUND_SRC = "/sound/sound.mp3";
export const PRACTICE_SUCCESS_SOUND_VOLUME = 0.18;
export const REFERENCE_WORD_PLAYBACK_VOLUME = 0.72;

export function createPracticeSuccessAudio() {
  const audio = new Audio(PRACTICE_SUCCESS_SOUND_SRC);
  audio.preload = "auto";
  audio.volume = PRACTICE_SUCCESS_SOUND_VOLUME;
  return audio;
}

export function configureReferenceWordPlayback(audio: HTMLAudioElement) {
  audio.volume = REFERENCE_WORD_PLAYBACK_VOLUME;
  return audio;
}
