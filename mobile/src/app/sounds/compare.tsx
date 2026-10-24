// Compare two sounds of a minimal pair (ship/sheep, light/right, think/sink):
// both mouth shapes, then both tongues in one drawing, then hear and tell
// them apart.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { CompareView } from "@/components/mouth-map";
import { ChoiceButton, type ChoiceState } from "@/components/games/ChoiceButton";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import { Body, Card, Chip, EmptyState, Eyebrow, Screen, TopBar } from "@/components/ui";
import { ipaFor, soundById, targetFor } from "@/content/articulation";
import { FEATURED_COMPARISONS } from "@/data/pair-sounds";
import { useAccent } from "@/hooks/useAccent";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { haptics } from "@/lib/haptics";
import { spacing, type } from "@/theme/theme";

export default function CompareScreen() {
  const params = useLocalSearchParams<{ a?: string; b?: string; words?: string }>();
  const fallback = FEATURED_COMPARISONS[0];
  const a = params.a ?? fallback.soundIds[0];
  const b = params.b ?? fallback.soundIds[1];
  const words = (params.words?.split(",") ?? fallback.words) as [string, string];
  const [accent] = useAccent();
  const { width } = useWindowDimensions();
  const voice = usePracticeVoice();
  const first = targetFor(a, accent);
  const second = targetFor(b, accent);
  const soundA = soundById(a);
  const soundB = soundById(b);

  const [played, setPlayed] = useState<0 | 1 | null>(null);
  const [choice, setChoice] = useState<0 | 1 | null>(null);
  const [tally, setTally] = useState({ right: 0, total: 0 });

  function play() {
    const pick: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
    setPlayed(pick);
    setChoice(null);
    voice.speak(words[pick]);
  }

  function pickWord(index: 0 | 1) {
    if (played === null || choice !== null) return;
    setChoice(index);
    const right = index === played;
    if (right) haptics.success();
    else haptics.warning();
    setTally((t) => ({ right: t.right + (right ? 1 : 0), total: t.total + 1 }));
  }

  const title = `${words[0]} or ${words[1]}`;
  const names: [string, string] = [
    soundA ? `/${ipaFor(soundA, accent)}/ ${words[0]}` : words[0],
    soundB ? `/${ipaFor(soundB, accent)}/ ${words[1]}` : words[1],
  ];

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Compare" title={title} />
      {first && second ? (
        <CompareView first={first} second={second} names={names} width={Math.min(520, width - spacing.lg * 2)} />
      ) : (
        <EmptyState compact title="Shapes on their way" message="One of these sounds isn't drawn yet. You can still train your ear below." />
      )}

      <Card>
        <Eyebrow>Train your ear</Eyebrow>
        <SpeakerButton label="Play one of the words" playing={voice.speaking !== null} onPress={play} />
        <View style={styles.choices}>
          {words.map((word, index) => {
            const i = index as 0 | 1;
            const state: ChoiceState = choice === null ? "idle" : i === played ? "correct" : i === choice ? "wrong" : "dimmed";
            return <ChoiceButton key={word} label={word} state={state} disabled={played === null || choice !== null} onPress={() => pickWord(i)} />;
          })}
        </View>
        <Body size={type.footnote} tone="muted">
          {played === null ? "Tap play, then pick the word you heard." : tally.total > 0 ? `${tally.right} of ${tally.total} right` : "Which one was it?"}
        </Body>
      </Card>

      <View style={styles.others}>
        {FEATURED_COMPARISONS.filter((pair) => pair.words[0] !== words[0]).map((pair) => (
          <Chip key={pair.words.join("-")} label={`${pair.words[0]} / ${pair.words[1]}`} onPress={() => router.setParams({ a: pair.soundIds[0], b: pair.soundIds[1], words: pair.words.join(",") })} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choices: { gap: spacing.sm },
  others: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
});
