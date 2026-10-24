// Runs a set of exercises one at a time: answer, check, see why, next. Every
// grade happens on the phone (gradeExercise), so a lesson or a quiz works with
// no network at all. The finished session goes into the learner's summary and
// the sync queue.
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { playCompletionSound } from "@/audio/feedback";
import { ExerciseView } from "@/components/exercises/ExerciseView";
import { ResultSummary } from "@/components/practice/ResultSummary";
import { ActionRow, Banner, Body, Button, Card, Screen, SegmentedProgress, TopBar } from "@/components/ui";
import { useExitGuard } from "@/hooks/useExitGuard";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { finishSession, recordAnswer, reviewCard } from "@/learning/state";
import { today, updateLearning } from "@/learning/store";
import { haptics } from "@/lib/haptics";
import { gradeExercise, type CefrLevel, type Exercise, type ExerciseAnswer, type GradeResult } from "@/platform/content-model";
import type { ActivityKind } from "@/platform/progress-model";
import { spacing, type } from "@/theme/theme";

export interface SessionRunnerProps {
  eyebrow: string;
  title: string;
  exercises: Exercise[];
  packId: string;
  level: CefrLevel | null;
  kind: ActivityKind;
  refId: string;
  lessonId?: string;
  onClose: () => void;
  onAgain?: () => void;
}

export function SessionRunner(props: SessionRunnerProps) {
  const { exercises, packId, onClose } = props;
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<ExerciseAnswer | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const voice = usePracticeVoice();

  useExitGuard(scores.length > 0 && !done, "Leave this session?", "Your answers so far are saved, but the session won't count as finished.");

  const exercise = exercises[index];

  function check(answer: ExerciseAnswer | null = draft) {
    if (!exercise || !answer || result) return;
    const graded = gradeExercise(exercise, answer);
    const all = [...scores, graded.score];
    setResult(graded);
    setScores(all);
    if (graded.correct) haptics.success();
    else haptics.warning();
    const now = new Date();
    updateLearning((state) => {
      let next = recordAnswer(state, exercise, graded, now.getTime(), today(now));
      if (answer.kind === "flashcard") next = reviewCard(next, exercise.id, answer.grade === "again" ? "again" : answer.grade === "easy" ? "easy" : "good", now);
      return next;
    });
    // A self-graded card needs no feedback screen: straight on to the next one.
    if (answer.kind === "flashcard") advance(all);
  }

  function next() {
    advance(scores);
  }

  function advance(all: number[]) {
    voice.stop();
    if (index + 1 < exercises.length) {
      setIndex(index + 1);
      setDraft(null);
      setResult(null);
      return;
    }
    const score = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) : 0;
    const now = new Date();
    updateLearning(
      (state) =>
        finishSession(
          state,
          {
            kind: props.kind,
            refId: props.refId,
            level: props.level,
            score,
            minutes: Math.max(1, (Date.now() - startedAt) / 60_000),
            lessonId: props.lessonId,
          },
          now.getTime(),
          today(now),
        ).state,
    );
    playCompletionSound();
    setDone(true);
  }

  const score = useMemo(() => (scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : 0), [scores]);

  if (exercises.length === 0) {
    return (
      <Screen>
        <TopBar onClose={onClose} eyebrow={props.eyebrow} title={props.title} />
        <Banner tone="info" message="There's nothing to practise here yet. Try another level." />
      </Screen>
    );
  }

  if (done) {
    const correct = scores.filter((s) => s === 1).length;
    return (
      <Screen>
        <TopBar onClose={onClose} eyebrow={props.eyebrow} title={props.title} />
        <ResultSummary
          eyebrow="Session complete"
          score={score}
          ringLabel={`${score}%`}
          title={score >= 80 ? "Strong work" : score >= 50 ? "Getting there" : "Worth another go"}
          subtitle={props.lessonId ? "Lesson saved to your progress." : "Saved to your progress."}
          stats={[
            { label: "Correct", value: `${correct}/${exercises.length}` },
            { label: "Score", value: `${score}` },
          ]}
          celebrate={score >= 80}>
          <ActionRow>
            <Button label="Done" variant="tonal" onPress={onClose} />
            {props.onAgain ? <Button label="Practise again" onPress={props.onAgain} /> : null}
          </ActionRow>
        </ResultSummary>
      </Screen>
    );
  }

  const isFlashcard = exercise.kind === "flashcard";

  return (
    <Screen>
      <TopBar onClose={onClose} closeLabel="Leave this session" eyebrow={`${props.eyebrow} · ${index + 1} of ${exercises.length}`} title={props.title} />
      <SegmentedProgress total={exercises.length} currentIndex={index} />
      <Card>
        <ExerciseView
          key={exercise.id}
          exercise={exercise}
          packId={packId}
          result={result}
          voice={voice}
          onChange={(answer) => {
            setDraft(answer);
            // A self-graded card is checked the moment the learner grades it.
            if (isFlashcard && answer) check(answer);
          }}
        />
      </Card>

      {result ? (
        <View style={styles.feedback}>
          <Banner
            tone={result.correct ? "success" : "warning"}
            message={
              isFlashcard
                ? "Saved. It comes back when it's due."
                : result.correct
                  ? "Correct."
                  : result.score > 0
                    ? `Partly right: ${Math.round(result.score * 100)}%.`
                    : "Not quite."
            }
          />
          {exercise.explanation ? (
            <Body size={type.callout}>
              {exercise.explanation}
            </Body>
          ) : null}
          <Button label={index + 1 < exercises.length ? "Next" : "See results"} onPress={next} />
        </View>
      ) : isFlashcard ? null : (
        <Button label="Check" disabled={!draft} onPress={() => check()} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  feedback: { gap: spacing.md },
});
