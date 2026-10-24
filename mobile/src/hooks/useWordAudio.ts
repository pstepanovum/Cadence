import { useCallback, useState } from "react";
import { getReferenceAudio, prefetchReferenceAudio } from "@/audio/reference-audio";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { usePlayback } from "@/hooks/usePlayback";

export interface WordAudio {
  /** Renders `text` in the coach voice (cached after the first time) and plays it. */
  speak: (text: string) => Promise<boolean>;
  /** Warms the cache so the next tap is instant. */
  prefetch: (text: string) => void;
  stop: () => void;
  /** Text currently being fetched or played, for highlighting the right button. */
  activeText: string | null;
  isLoading: boolean;
  isPlaying: boolean;
  /** Human-readable reason the last `speak` failed, cleared on the next call. */
  error: string | null;
}

/**
 * The "hear this word" primitive the games share. It is the same TTS path the
 * lessons use, so a learner hears the voice they picked in settings.
 */
export function useWordAudio(): WordAudio {
  const playback = usePlayback();
  const { instruct } = useCoachVoice();
  const [activeText, setActiveText] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const speak = useCallback(
    async (text: string) => {
      setError(null);
      setActiveText(text);
      setFetching(true);
      try {
        const uri = await getReferenceAudio(text, instruct);
        await playback.play(uri, () => setActiveText(null));
        return true;
      } catch (cause) {
        setActiveText(null);
        setError(cause instanceof Error ? cause.message : "Could not load the audio for this word.");
        return false;
      } finally {
        setFetching(false);
      }
    },
    [instruct, playback],
  );

  const prefetch = useCallback((text: string) => prefetchReferenceAudio(text, instruct), [instruct]);

  const stop = useCallback(() => {
    playback.stop();
    setActiveText(null);
  }, [playback]);

  return {
    speak,
    prefetch,
    stop,
    activeText: playback.isPlaying || fetching || playback.isLoading ? activeText : null,
    isLoading: fetching || playback.isLoading,
    isPlaying: playback.isPlaying,
    error,
  };
}
