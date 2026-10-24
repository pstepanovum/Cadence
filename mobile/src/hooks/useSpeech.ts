import { useCallback, useRef, useState } from "react";
import { getReferenceAudio, prefetchReferenceAudio } from "@/audio/reference-audio";
import { describeError } from "@/copy/errors";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { usePlayback } from "@/hooks/usePlayback";

export interface Speech {
  /**
   * Renders `text` in the coach voice (cached after the first time) and plays
   * it. Resolves false when the audio could not be fetched. `onDone` runs when
   * the clip finishes on its own, not when it is stopped.
   */
  speak: (text: string, options?: { onDone?: () => void }) => Promise<boolean>;
  /** Plays several pieces back to back, warming each next one while the current plays. */
  speakAll: (texts: readonly string[]) => void;
  /** Stops `text` if it is the one playing, otherwise plays it. */
  toggle: (text: string) => void;
  /** Warms the cache so the next tap is instant. */
  prefetch: (text: string) => void;
  stop: () => void;
  /** Text currently being fetched or played, so the right button can show it. */
  activeText: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  /** Human-readable reason the last `speak` failed, cleared on the next call. */
  error: string | null;
}

/**
 * "Hear this" for every screen: target words, coach lines, lesson narration
 * and the voice sample all go through the same TTS path, so the learner hears
 * the voice they picked in settings. `speak`, `prefetch` and `stop` keep their
 * identity across renders, so effects can depend on them.
 */
export function useSpeech(): Speech {
  const { play, stop: stopPlayback, isPlaying, isLoading: playbackLoading } = usePlayback();
  const { instruct } = useCoachVoice();
  const [activeText, setActiveText] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A tap on another line while one is still fetching must win.
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    stopPlayback();
    setActiveText(null);
    setFetching(false);
  }, [stopPlayback]);

  const speak = useCallback(
    async (text: string, options?: { onDone?: () => void }) => {
      const token = ++tokenRef.current;
      stopPlayback();
      setError(null);
      setActiveText(text);
      setFetching(true);
      try {
        const uri = await getReferenceAudio(text, instruct);
        if (token !== tokenRef.current) return false;
        setFetching(false);
        await play(uri, () => {
          if (token !== tokenRef.current) return;
          setActiveText(null);
          options?.onDone?.();
        });
        return true;
      } catch (cause) {
        if (token === tokenRef.current) {
          setActiveText(null);
          setFetching(false);
          setError(describeError(cause, "Could not load the audio. Check your connection."));
        }
        return false;
      }
    },
    [instruct, play, stopPlayback],
  );

  const prefetch = useCallback((text: string) => prefetchReferenceAudio(text, instruct), [instruct]);

  const speakAll = useCallback(
    (texts: readonly string[]) => {
      function playAt(index: number) {
        const text = texts[index];
        if (!text) return;
        const next = texts[index + 1];
        if (next) prefetchReferenceAudio(next, instruct);
        void speak(text, { onDone: () => playAt(index + 1) });
      }
      playAt(0);
    },
    [instruct, speak],
  );

  const busy = fetching || playbackLoading || isPlaying;
  const current = busy ? activeText : null;

  return {
    speak,
    speakAll,
    toggle: (text: string) => {
      if (current === text) stop();
      else void speak(text);
    },
    prefetch,
    stop,
    activeText: current,
    isLoading: fetching || playbackLoading,
    isPlaying,
    error,
  };
}

/** Where one particular line is in its playback, for a per-line play button. */
export function speechStateFor(speech: Speech, text: string): "idle" | "loading" | "playing" {
  if (speech.activeText !== text) return "idle";
  return speech.isPlaying ? "playing" : "loading";
}
