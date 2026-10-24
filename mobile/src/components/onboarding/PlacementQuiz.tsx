// The optional two-minute placement quiz: one question at a time, graded on
// the phone, no right-or-wrong shown (it is a measure, not a lesson). The
// result is recorded as a placement activity and sets the starting level.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ExerciseView } from "@/components/exercises/ExerciseView";
import { Body, Button, Card, SegmentedProgress } from "@/components/ui";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { finishSession } from "@/learning/state";
import { today, updateLearning } from "@/learning/store";
import { haptics } from "@/lib/haptics";
import { PLACEMENT_QUESTIONS, placementLevel, placementScore } from "@/onboarding/placement";
import { gradeExercise, type CefrLevel } from "@/platform/content-model";
import { spacing, type } from "@/theme/theme";

export function PlacementQuiz({ onDone, result }: { onDone: (level: CefrLevel) => void; result: CefrLevel | null }) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [startedAt] = useState(() => Date.now());
  const [level, setLevel] = useState<CefrLevel | null>(result);
  const voice = usePracticeVoice();

  if (level) {
    return (
      <Card>
        <Body size={type.callout} tone="muted">
          Your starting level
        </Body>
        <Body size={type.title1} weight="bold">
          {level}
        </Body>
        <Body size={type.callout}>Lessons and practice start here. You can change the level any time in Learn.</Body>
      </Card>
    );
  }

  const exercise = PLACEMENT_QUESTIONS[index];

  function answer(choice: number) {
    const graded = gradeExercise(exercise, { kind: "multiple_choice", choice });
    const next = { ...scores, [exercise.id]: graded.score };
    setScores(next);
    haptics.select();
    if (index + 1 < PLACEMENT_QUESTIONS.length) {
      setTimeout(() => setIndex(index + 1), 180);
      return;
    }
    const estimate = placementLevel(next);
    const now = new Date();
    updateLearning(
      (state) =>
        finishSession(
          state,
          { kind: "placement", refId: "placement.onboarding", level: estimate, score: placementScore(next), minutes: Math.max(1, (Date.now() - startedAt) / 60_000), placementLevel: estimate },
          now.getTime(),
          today(now),
        ).state,
    );
    haptics.success();
    setLevel(estimate);
    onDone(estimate);
  }

  return (
    <View style={styles.root}>
      <SegmentedProgress total={PLACEMENT_QUESTIONS.length} currentIndex={index} />
      <Card>
        <ExerciseView
          key={exercise.id}
          exercise={exercise}
          packId="placement"
          result={null}
          voice={voice}
          onChange={(value) => {
            if (value?.kind === "multiple_choice") answer(value.choice);
          }}
        />
      </Card>
      <Body size={type.footnote} tone="muted">{`Question ${index + 1} of ${PLACEMENT_QUESTIONS.length}. Not sure? Pick your best guess.`}</Body>
      {index > 0 ? <Button label="Previous question" variant="neutral" onPress={() => setIndex(index - 1)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
});
