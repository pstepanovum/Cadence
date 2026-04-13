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

const LEARNER_WORD_CLIP_MIN_SEC = 0.05;

/**
 * Play a slice of the learner's recording (same object URL as "Play my reply").
 * Uses proportional timing from the assessment; boundaries are approximate.
 */
export function playLearnerRecordingSegment(
  audioUrl: string,
  startSec: number,
  endSec: number,
  onComplete?: () => void,
): { audio: HTMLAudioElement; cancel: () => void } {
  const audio = new Audio(audioUrl);
  audio.volume = 1;
  const end = Math.max(endSec, startSec + LEARNER_WORD_CLIP_MIN_SEC);
  let cancelled = false;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    audio.removeEventListener("timeupdate", onTimeUpdate);
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    onComplete?.();
  };

  const onTimeUpdate = () => {
    if (!cancelled && audio.currentTime >= end) {
      cancelled = true;
      cleanup();
    }
  };

  const cancel = () => {
    cancelled = true;
    cleanup();
  };

  audio.addEventListener("timeupdate", onTimeUpdate);
  audio.addEventListener(
    "ended",
    () => {
      if (!cancelled) {
        cancelled = true;
        cleanup();
      }
    },
    { once: true },
  );
  audio.addEventListener(
    "error",
    () => {
      if (!cancelled) {
        cancelled = true;
        cleanup();
      }
    },
    { once: true },
  );

  const startPlayback = () => {
    if (cancelled) return;
    const safeStart = Math.max(0, startSec);
    audio.currentTime = safeStart;
    void audio.play().catch(() => {
      cancel();
    });
  };

  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    startPlayback();
  } else {
    audio.addEventListener("loadedmetadata", startPlayback, { once: true });
    audio.load();
  }

  return { audio, cancel };
}
