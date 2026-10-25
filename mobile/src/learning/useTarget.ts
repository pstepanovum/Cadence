// "Hear the target" on the phone for phrases, slang and drills: the pack's
// pre-generated audio when the app carries it, else the coach voice from your
// own Cadence or, with Plus, the cloud (useSpeech), else the phone's own
// voice (expo-speech), so there is always something to hear, offline too.
import * as DeviceSpeech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";

import { enablePlaybackMode } from "@/audio/recorder";
import { packAudioUri } from "@/content/packs";
import { usePlayback } from "@/hooks/usePlayback";
import { useSpeech } from "@/hooks/useSpeech";

export interface TargetSource {
  text: string;
  /** Pre-generated audio inside a bundled pack. */
  pack?: { packId: string; path: string } | null;
}

export function useTarget() {
  const playback = usePlayback();
  const speech = useSpeech();
  const [active, setActive] = useState<string | null>(null);
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current += 1;
    playback.stop();
    speech.stop();
    void DeviceSpeech.stop();
    setActive(null);
  }, [playback, speech]);

  useEffect(() => () => void DeviceSpeech.stop(), []);

  /** Plays the target; resolves when it has finished (or failed). */
  const play = useCallback(
    async (source: TargetSource): Promise<void> => {
      const mine = ++token.current;
      playback.stop();
      speech.stop();
      void DeviceSpeech.stop();
      setActive(source.text);
      const done = () => {
        if (token.current === mine) setActive(null);
      };
      const uri = source.pack ? await packAudioUri(source.pack.packId, source.pack.path).catch(() => null) : null;
      if (token.current !== mine) return;
      if (uri) {
        await new Promise<void>((resolve) => void playback.play(uri, resolve).catch(() => resolve()));
        return done();
      }
      const ok = await new Promise<boolean>((resolve) => {
        void speech.speak(source.text, { onDone: () => resolve(true) }).then((started) => {
          if (!started) resolve(false);
        });
      });
      if (token.current !== mine) return;
      if (!ok) {
        await enablePlaybackMode().catch(() => {});
        await new Promise<void>((resolve) => DeviceSpeech.speak(source.text, { language: "en-US", rate: 0.95, onDone: () => resolve(), onError: () => resolve(), onStopped: () => resolve() }));
      }
      done();
    },
    [playback, speech],
  );

  return { play, stop, active };
}
