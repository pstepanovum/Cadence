// The adaptive placement test (docs/PLATFORM.md section 7): one item at a
// time from the bundled placement bank, starting at B2 and moving up or down
// with each answer until the estimate is sure (12 to 24 items). Graded on the
// phone, no right-or-wrong shown (it is a measure, not a lesson). Items seen
// in earlier tests are kept back while fresh ones remain. The result becomes
// the learner's level, with grammar and vocabulary levels where they differ,
// and is recorded as a placement activity. Used in setup and from
// Settings > Level.
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ExerciseView } from "@/components/exercises/ExerciseView";
import { Body, Button, LoadingBlock, TextLink } from "@/components/ui";
import { usePlacementBank } from "@/content/useContent";
import { usePracticeVoice } from "@/hooks/usePracticeVoice";
import { applyPlacement, placementSeen, rememberSeen } from "@/learning/level-store";
import { finishSession } from "@/learning/state";
import { today, updateLearning } from "@/learning/store";
import { haptics } from "@/lib/haptics";
import { PLACEMENT_QUESTIONS } from "@/onboarding/placement";
import { gradeExercise, type CefrLevel, type Exercise, type ExerciseAnswer } from "@/platform/content-model";
import { LEVEL_INFO, examLine } from "@/platform/levels";
import {
  ADAPTIVE,
  adaptiveResult,
  bankFromExercises,
  decodeSeen,
  nextPlacementItem,
  placementDone,
  type AdaptiveResponse,
  type AdaptiveResult,
  type BankItem,
} from "@/platform/placement";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

/** The twelve built-in questions, for a build whose bank is missing. */
const FALLBACK: { items: BankItem[]; exercises: Map<string, Exercise> } = {
  items: PLACEMENT_QUESTIONS.map((q) => ({ id: q.id, level: q.level, type: "grammar" as const, guess: 1 / q.options.length })),
  exercises: new Map(PLACEMENT_QUESTIONS.map((q) => [q.id, q])),
};

const CONFIDENCE_TEXT = { high: "A clear result.", medium: "A fairly clear result.", low: "A rough result: retake it any time." } as const;

export function PlacementTest({ onDone, result, refId = "placement.onboarding" }: { onDone: (result: AdaptiveResult) => void; result: CefrLevel | null; refId?: string }) {
  const bank = usePlacementBank();
  const voice = usePracticeVoice();
  const [responses, setResponses] = useState<AdaptiveResponse[]>([]);
  const [draft, setDraft] = useState<ExerciseAnswer | null>(null);
  const [finished, setFinished] = useState<AdaptiveResult | null>(null);
  const [startedAt] = useState(() => Date.now());
  const seen = useMemo(() => new Set(decodeSeen(placementSeen.get())), []);

  const source = useMemo(() => {
    const exercises = bank.content?.exercises ?? [];
    const items = bankFromExercises(exercises);
    if (items.length === 0) return FALLBACK;
    return { items, exercises: new Map(exercises.map((e) => [e.id, e])) };
  }, [bank.content]);

  // The next item is picked once per answer, not on every render.
  const item = useMemo(
    () => (finished || placementDone(responses) ? null : nextPlacementItem(source.items, responses, seen, Math.random)),
    [finished, responses, seen, source],
  );
  const exercise = item ? source.exercises.get(item.id) ?? null : null;

  if (finished || (result && responses.length === 0)) {
    return <PlacementResult level={finished?.level ?? (result as CefrLevel)} result={finished} />;
  }
  if (bank.isLoading) return <LoadingBlock rows={3} label="Getting the test ready…" />;
  if (!item || !exercise) return null;

  function finish(all: AdaptiveResponse[]) {
    const outcome = adaptiveResult(all);
    rememberSeen(all.map((r) => r.id));
    applyPlacement(outcome.level, outcome.skills);
    const now = new Date();
    updateLearning(
      (state) =>
        finishSession(
          state,
          { kind: "placement", refId, level: outcome.level, score: outcome.score, minutes: Math.max(1, (Date.now() - startedAt) / 60_000), placementLevel: outcome.level },
          now.getTime(),
          today(now),
        ).state,
    );
    haptics.success();
    setFinished(outcome);
    onDone(outcome);
  }

  function submit(answer: ExerciseAnswer | null) {
    if (!item || !exercise) return;
    const score = answer ? gradeExercise(exercise, answer).score : 0;
    const next = [...responses, { ...item, score }];
    setDraft(null);
    haptics.select();
    if (placementDone(next) || !nextPlacementItem(source.items, next, seen, () => 0)) finish(next);
    else setResponses(next);
  }

  const autoSubmit = exercise.kind === "multiple_choice";

  return (
    <View style={styles.root}>
      <Body size={type.footnote} tone="muted">{`Question ${responses.length + 1} · ${ADAPTIVE.minItems} to ${ADAPTIVE.maxItems} in all`}</Body>
      <ExerciseView
        key={exercise.id}
        exercise={exercise}
        packId="placement"
        result={null}
        voice={voice}
        onChange={(value) => {
          if (autoSubmit && value) setTimeout(() => submit(value), 180);
          else setDraft(value);
        }}
      />
      {autoSubmit ? null : <Button label="Next" disabled={draft === null} onPress={() => submit(draft)} />}
      <TextLink label="I don't know" onPress={() => submit(null)} />
    </View>
  );
}

function PlacementResult({ level, result }: { level: CefrLevel; result: AdaptiveResult | null }) {
  const skills = result ? (Object.entries(result.skills) as [string, CefrLevel][]).filter(([, value]) => value !== level) : [];
  return (
    <View style={styles.result}>
      <Body size={type.callout} tone="muted">
        Your level
      </Body>
      <Body size={type.display} weight="bold" style={styles.level}>
        {level}
      </Body>
      <Body size={type.callout} weight="semibold">
        {LEVEL_INFO[level].name}
      </Body>
      <Body size={type.footnote} tone="muted">
        {examLine(level)}
      </Body>
      {result ? <Body size={type.footnote}>{`${CONFIDENCE_TEXT[result.confidence]} ${result.asked} questions, ${result.score}% right.`}</Body> : null}
      {skills.map(([skill, value]) => (
        <Body key={skill} size={type.footnote}>{`${skill === "grammar" ? "Grammar" : "Vocabulary"}: ${value}`}</Body>
      ))}
      <Body size={type.callout}>Lessons, practice and the coach start here. Change it any time in Settings, Level.</Body>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { gap: spacing.md },
    result: { gap: spacing.xs, padding: spacing.xl, borderRadius: radii.card, backgroundColor: colors.platinum },
    level: { color: colors.hunter },
  }),
);
