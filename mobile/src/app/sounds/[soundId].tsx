// One sound: where the tongue and lips go (the mouth map, animated), the
// model word, the learner's progress on it over time, and the drill ladder.
import { router, useLocalSearchParams } from "expo-router";
import { Volume2 } from "lucide-react-native";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { MouthMap } from "@/components/mouth-map";
import { Body, Button, Card, Chip, EmptyState, Eyebrow, Screen, Title, TopBar } from "@/components/ui";
import { ipaFor, soundById, targetFor } from "@/content/articulation";
import { PAIRS_WITH_SOUNDS } from "@/data/pair-sounds";
import { useAccent } from "@/hooks/useAccent";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { useLearning } from "@/learning/store";
import { currentStep, DRILL_STEP_LABELS, DRILL_STEPS } from "@/practice/sound-coach";
import { describeTarget } from "@/practice/sounds";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

const MAX_MAP_WIDTH = 520;

export default function SoundScreen() {
  const { soundId } = useLocalSearchParams<{ soundId: string }>();
  const [accent] = useAccent();
  const { width } = useWindowDimensions();
  const voice = usePracticeVoice();
  const { state } = useLearning();
  const sound = soundById(soundId);
  const target = useMemo(() => (sound ? targetFor(sound.id, accent) : null), [sound, accent]);

  if (!sound) {
    return (
      <Screen>
        <TopBar onBack={() => router.back()} eyebrow="Sounds" />
        <EmptyState title="Unknown sound" message="Pick one from the sounds library." actionLabel="Open the library" onAction={() => router.replace("/sounds")} />
      </Screen>
    );
  }

  const ipa = ipaFor(sound, accent);
  const name = `/${ipa}/ as in ${sound.example}`;
  const mastery = state.sounds[sound.id];
  const step = currentStep(mastery);
  const pairs = PAIRS_WITH_SOUNDS.filter((pair) => pair.soundIds.includes(sound.id)).slice(0, 3);
  const mapWidth = Math.min(MAX_MAP_WIDTH, width - spacing.lg * 2);
  const history = mastery?.history.slice(-14) ?? [];

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow={sound.kind === "consonant" ? "Consonant" : sound.kind === "vowel" ? "Vowel" : "Diphthong"} title={name} />

      {target ? (
        <>
          <MouthMap target={target} name={name} width={mapWidth} />
          <Body size={type.callout}>{describeTarget(target, sound)}</Body>
        </>
      ) : (
        <EmptyState compact title="Mouth map on its way" message="This sound's shape is still being drawn. You can practise it already." />
      )}

      <Button
        label={`Hear "${sound.example}"`}
        variant="tonal"
        icon={<Volume2 color={colors.hunter} size={18} />}
        onPress={() => voice.speak(sound.example)}
      />

      <Card>
        <Eyebrow>Your progress</Eyebrow>
        {mastery ? (
          <>
            <Title size={type.title3}>{`${Math.round(mastery.ema)} now · best ${mastery.best}`}</Title>
            <Body size={type.footnote} tone="muted">{`${mastery.attempts} scored ${mastery.attempts === 1 ? "take" : "takes"}${mastery.fixedAt ? " · fixed" : ""}`}</Body>
            {history.length > 1 ? (
              <View style={styles.chart} accessible accessibilityLabel={`Daily scores: ${history.map((h) => h.score).join(", ")}`}>
                {history.map((h) => (
                  <View key={h.day} style={[styles.bar, { height: 8 + (h.score / 100) * 56, backgroundColor: h.score >= 80 ? colors.yellowGreen : h.score >= 50 ? colors.sage : colors.brick }]} />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Body size={type.callout}>{"No scores yet. Practise it once to see how you're doing."}</Body>
        )}
      </Card>

      <Card>
        <Eyebrow>Practice ladder</Eyebrow>
        <View style={styles.steps}>
          {DRILL_STEPS.map((item, index) => {
            const doneStep = (mastery?.step ?? 0) > index || Boolean(mastery?.fixedAt);
            return <Chip key={item} label={DRILL_STEP_LABELS[item]} status={doneStep ? "correct" : item === step ? "accent" : "neutral"} />;
          })}
        </View>
        <Body size={type.footnote} tone="muted">
          Three takes in a row at 80 or more moves you up a step.
        </Body>
        <Button label={mastery?.fixedAt ? "Review this sound" : `Practise: ${DRILL_STEP_LABELS[step].toLowerCase()}`} onPress={() => router.push({ pathname: "/sounds/drill/[soundId]", params: { soundId: sound.id } })} />
      </Card>

      {pairs.length > 0 ? (
        <View style={styles.section}>
          <Eyebrow>Compare</Eyebrow>
          <View style={styles.steps}>
            {pairs.map((pair) => (
              <Chip
                key={pair.words.join("-")}
                label={`${pair.words[0]} / ${pair.words[1]}`}
                onPress={() => router.push({ pathname: "/sounds/compare", params: { a: pair.soundIds[0], b: pair.soundIds[1], words: pair.words.join(",") } })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chart: { flexDirection: "row", alignItems: "flex-end", gap: spacing.xs, height: 68 },
    bar: { flex: 1, borderRadius: radii.tile / 3 },
    steps: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    section: { gap: spacing.sm },
  }),
);
