// Audio for practice that needs no AI: a pack's pre-generated recording when
// it has one, otherwise the phone's own voice (expo-speech). Both work
// offline and cost nothing, so dictation, flashcards and minimal pairs never
// wait on a server.
import * as Speech from "expo-speech";
import { useCallback, useEffect, useState } from "react";

import { packAudioUri } from "@/content/packs";
import { usePlayback } from "@/hooks/usePlayback";

export interface PracticeVoice {
  speak: (text: string, audio?: { packId: string; path: string }) => void;
  stop: () => void;
  speaking: string | null;
}

export function usePracticeVoice(): PracticeVoice {
  const { play, stop: stopPlayback } = usePlayback();
  const [speaking, setSpeaking] = useState<string | null>(null);

  const stop = useCallback(() => {
    stopPlayback();
    void Speech.stop();
    setSpeaking(null);
  }, [stopPlayback]);

  useEffect(() => () => void Speech.stop(), []);

  const speak = useCallback(
    (text: string, audio?: { packId: string; path: string }) => {
      stopPlayback();
      void Speech.stop();
      setSpeaking(text);
      void (async () => {
        const uri = audio ? await packAudioUri(audio.packId, audio.path).catch(() => null) : null;
        if (uri) {
          await play(uri, () => setSpeaking(null));
          return;
        }
        Speech.speak(text, {
          language: "en-US",
          rate: 0.92,
          onDone: () => setSpeaking(null),
          onStopped: () => setSpeaking(null),
          onError: () => setSpeaking(null),
        });
      })();
    },
    [play, stopPlayback],
  );

  return { speak, stop, speaking };
}
