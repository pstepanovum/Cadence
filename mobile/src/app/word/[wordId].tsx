// The word of the day (opened from the medium widget, or any word id): the
// word, its sounds, meaning and an example, a tap to hear it, then say it and
// see the score. Hearing it is free and offline; scoring needs your own
// Cadence server or Plus, and offers either instead of an error.
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { assess, type RecordedAudio } from "@/api/endpoints";
import type { PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback } from "@/audio/feedback";
import { SpeakerButton } from "@/components/games/SpeakerButton";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ReadinessBanner } from "@/components/status";
import { Body, Card, Eyebrow, Screen, Title, TopBar } from "@/components/ui";
import { describeError } from "@/copy/errors";
import { vocabById } from "@/data/vocabulary";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { logPractice } from "@/learning/log";
import { normalizeScore } from "@/practice/scoring";
import { today } from "@/learning/store";
import { wordOfTheDay } from "@/lib/widget/snapshot";
import { colors, fonts, radii, spacing, type, themed } from "@/theme/theme";

export default function WordScreen() {
  const { wordId } = useLocalSearchParams<{ wordId?: string }>();
  const word = (wordId && vocabById(wordId)) || wordOfTheDay(today());
  const isToday = word.id === wordOfTheDay(today()).id;
  const voice = usePracticeVoice();
  const readiness = useAssessReadiness();
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [logged, setLogged] = useState(false);

  async function handleTake(take: RecordedAudio) {
    try {
      const result = await assess(take, word.word);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
      if (!logged) {
        setLogged(true);
        logPractice({ kind: "pronunciation", refId: `word.${word.id}`, level: null, score: normalizeScore(result.overallScore), minutes: 1 });
      }
    } catch (cause) {
      throw new Error(describeError(cause, "Scoring failed. Try that take again."));
    }
  }

  return (
    <Screen>
      <TopBar onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))} eyebrow={isToday ? "Word of the day" : "Word"} />
      <Card>
        <View style={styles.wordPanel}>
          <Title size={type.display}>{word.word}</Title>
          <Body size={type.headline} style={styles.ipa}>
            {word.ipa}
          </Body>
          <SpeakerButton label={`Hear ${word.word}`} size={72} playing={voice.speaking === word.word} onPress={() => voice.speak(word.word)} />
        </View>
        <Eyebrow>{word.pos}</Eyebrow>
        <Body size={type.body}>{word.definition}</Body>
        <Body size={type.callout} tone="muted">{`“${word.example}”`}</Body>
      </Card>

      <Card>
        <Eyebrow>Say it</Eyebrow>
        <ReadinessBanner readiness={readiness} />
        <RecorderPanel key={word.id} targetText={word.word} onTake={handleTake} disabled={!readiness.ready} />
        {assessment ? <AssessmentView assessment={assessment} /> : null}
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wordPanel: { borderRadius: radii.panel, backgroundColor: colors.cream, alignItems: "center", paddingVertical: spacing.xl, paddingHorizontal: spacing.lg, gap: spacing.sm },
    ipa: { fontFamily: fonts.bodyMedium },
  }),
);
