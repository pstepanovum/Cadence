// The drill ladder for one sound: the sound alone, syllables, words, minimal
// pairs, phrases, sentences. Each take is scored by the pronunciation engine
// (your own server, or the cloud with Plus); three in a row at 80 or more
// moves up a step, and a fixed sound comes back for review after 1, 3, 7 and
// 21 days. The mouth map stays on screen as the reminder.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import { assess, type RecordedAudio } from "@/api/endpoints";
import type { PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback } from "@/audio/feedback";
import { MouthMap } from "@/components/mouth-map";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ReadinessBanner } from "@/components/status";
import { Banner, Body, Card, Chip, EmptyState, Eyebrow, HorizontalPicker, Screen, Title, TopBar } from "@/components/ui";
import { ipaFor, soundById, targetFor } from "@/content/articulation";
import { describeError } from "@/copy/errors";
import { PAIRS_WITH_SOUNDS } from "@/data/pair-sounds";
import { PRACTICE_TARGETS } from "@/data/practice-targets";
import { useAccent } from "@/hooks/useAccent";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { recordDrill } from "@/learning/state";
import { today, updateLearning, useLearning } from "@/learning/store";
import { soundIdForSymbol } from "@/practice/sounds";
import { currentStep, DRILL_STEP_LABELS, drillItems, PASS_SCORE, TAKES_TO_PASS } from "@/practice/sound-coach";
import { normalizeScore } from "@/practice/scoring";
import { spacing, type } from "@/theme/theme";

export default function DrillScreen() {
  const { soundId } = useLocalSearchParams<{ soundId: string }>();
  const [accent] = useAccent();
  const { width } = useWindowDimensions();
  const sound = soundById(soundId);
  const target = sound ? targetFor(sound.id, accent) : null;
  const { state } = useLearning();
  const readiness = useAssessReadiness();
  const mastery = sound ? state.sounds[sound.id] : undefined;
  const reviewing = Boolean(mastery?.fixedAt);
  const step = currentStep(mastery);

  const items = useMemo(() => {
    if (!sound) return [];
    const list = drillItems(sound.id, sound.example, step, { words: PRACTICE_TARGETS, pairs: PAIRS_WITH_SOUNDS, sentences: [] });
    return list.length ? list : drillItems(sound.id, sound.example, "word", { words: PRACTICE_TARGETS, pairs: PAIRS_WITH_SOUNDS, sentences: [] });
  }, [sound, step]);
  const [itemIndex, setItemIndex] = useState(0);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!sound) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow="Sounds" />
        <EmptyState title="Unknown sound" message="Pick one from the sounds library." actionLabel="Open the library" onAction={() => router.replace("/sounds")} />
      </Screen>
    );
  }

  const item = items[Math.min(itemIndex, items.length - 1)] ?? sound.example;
  // A minimal pair is said as both words, one after the other.
  const spoken = item.replace(" / ", ", ");
  const name = `/${ipaFor(sound, accent)}/ as in ${sound.example}`;

  async function handleTake(take: RecordedAudio) {
    if (!sound) return;
    try {
      const result = await assess(take, spoken);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
      // The score that counts is this sound's, not the whole phrase's.
      const own = result.phonemes.filter((p) => soundIdForSymbol(p.symbol) === sound.id);
      const score = own.length ? own.reduce((sum, p) => sum + p.accuracy, 0) / own.length : normalizeScore(result.overallScore);
      const now = new Date();
      let outcome = { stepPassed: false, fixed: false };
      updateLearning((s) => {
        const r = recordDrill(s, sound.id, score, reviewing ? "review" : "drill", now.getTime(), today(now));
        outcome = r;
        return r.state;
      });
      setMessage(
        outcome.fixed
          ? "Sound fixed. It comes back for a quick check tomorrow."
          : outcome.stepPassed
            ? "Step passed. On to the next one."
            : score >= PASS_SCORE
              ? `Good: ${Math.round(score)}. Keep the run going.`
              : `${Math.round(score)}. Check the mouth map and try again.`,
      );
      if (outcome.stepPassed) setItemIndex(0);
      else setItemIndex((i) => (i + 1) % Math.max(1, items.length));
    } catch (cause) {
      throw new Error(describeError(cause, "Scoring failed. Try that take again."));
    }
  }

  return (
    <Screen>
      <TopBar onClose={() => router.back()} eyebrow={reviewing ? "Review" : DRILL_STEP_LABELS[step]} title={name} />
      {target ? <MouthMap target={target} name={name} width={Math.min(420, width - spacing.lg * 2)} showLegend={false} /> : null}

      <Card>
        <Eyebrow>{reviewing ? "Quick check" : `Step ${(mastery?.step ?? 0) + 1} of 6`}</Eyebrow>
        <HorizontalPicker selectedIndex={itemIndex}>
          {items.map((text, index) => (
            <Chip key={text} label={text} selected={index === itemIndex} onPress={() => setItemIndex(index)} />
          ))}
        </HorizontalPicker>
        <Title size={type.title1}>{item}</Title>
        <Body size={type.footnote} tone="muted">{`In a row: ${mastery?.streak ?? 0} of ${TAKES_TO_PASS}`}</Body>
        <ReadinessBanner readiness={readiness} />
        {message ? <Banner tone="info" message={message} /> : null}
        <RecorderPanel key={item} targetText={spoken} onTake={handleTake} disabled={!readiness.ready} disabledReason={readiness.message ?? undefined} />
      </Card>

      {assessment ? (
        <View style={styles.result}>
          <AssessmentView assessment={assessment} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  result: { gap: spacing.md },
});
