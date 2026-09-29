import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { enablePlaybackMode } from "@/audio/recorder";

/** Nothing in this app is longer than a couple of sentences of narration. */
const LOAD_TIMEOUT_MS = 15_000;

export interface Playback {
  isPlaying: boolean;
  /** True between the tap and the first audible sample. */
  isLoading: boolean;
  /** The URI currently playing, so a list can highlight the right row. */
  playingUri: string | null;
  /** Plays a local or remote URI, stopping whatever was playing before. */
  play: (uri: string, onDone?: () => void) => Promise<void>;
  stop: () => void;
}

/**
 * A single-slot audio player.
 *
 * The important property is that it can never get stuck: a clip that fails to
 * load, or one the system interrupts, releases the slot and clears the playing
 * flag, so the button always goes back to "Play" instead of sitting on "Stop"
 * forever.
 */
export function usePlayback(): Playback {
  const playerRef = useRef<AudioPlayer | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a status callback from a player we have already released.
  const tokenRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playingUri, setPlayingUri] = useState<string | null>(null);

  const release = useCallback(() => {
    tokenRef.current += 1;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const player = playerRef.current;
    playerRef.current = null;
    if (player) {
      try {
        player.remove();
      } catch {
        // Already torn down by the platform; nothing left to do.
      }
    }
  }, []);

  const stop = useCallback(() => {
    release();
    setIsPlaying(false);
    setIsLoading(false);
    setPlayingUri(null);
  }, [release]);

  const play = useCallback(
    async (uri: string, onDone?: () => void) => {
      stop();
      const token = tokenRef.current;
      setIsLoading(true);
      setPlayingUri(uri);

      try {
        await enablePlaybackMode();
      } catch {
        // Not fatal — the clip may still play, just possibly on the earpiece.
      }
      if (token !== tokenRef.current) return;

      let player: AudioPlayer;
      try {
        player = createAudioPlayer({ uri });
      } catch {
        stop();
        return;
      }
      playerRef.current = player;

      // If the source never loads, give the slot back rather than leaving the
      // button spinning.
      timeoutRef.current = setTimeout(() => {
        if (token === tokenRef.current) stop();
      }, LOAD_TIMEOUT_MS);

      player.addListener("playbackStatusUpdate", (status) => {
        if (token !== tokenRef.current) return;
        if (status.isLoaded && timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        if (status.playing) {
          setIsLoading(false);
          setIsPlaying(true);
        }
        if (status.didJustFinish) {
          stop();
          onDone?.();
        }
      });

      try {
        player.play();
      } catch {
        stop();
      }
    },
    [stop],
  );

  // A clip playing when the app is backgrounded would keep going against a
  // session configured not to, so it is stopped deliberately.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") stop();
    });
    return () => subscription.remove();
  }, [stop]);

  useEffect(() => stop, [stop]);

  return { isPlaying, isLoading, playingUri, play, stop };
}
