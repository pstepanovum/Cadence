// A practice set for one mode at one level: a quiz, matching, the grammar
// builder, sentence practice, or today's flashcards. Weakest grammar first.
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";

import { SessionRunner } from "@/components/exercises/SessionRunner";
import { EmptyState, LoadingBlock, Screen, TopBar } from "@/components/ui";
import { buildPracticeSet, isPracticeMode, packIdForLevel, PRACTICE_MODES, type PracticeMode } from "@/content/catalog";
import { parseLevelParam, useLevelPack } from "@/content/useContent";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { deckFor, todaysCards } from "@/learning/deck";
import { grammarAccuracy } from "@/learning/state";
import { useLearning } from "@/learning/store";
import type { ActivityKind } from "@/platform/progress-model";

const ACTIVITY: Record<PracticeMode, ActivityKind> = {
  quiz: "quiz",
  matching: "matching",
  builder: "sentence_building",
  sentences: "sentence_building",
  flashcards: "flashcards",
};

export default function PracticeScreen() {
  const params = useLocalSearchParams<{ mode?: string; level?: string; gp?: string }>();
  const mode: PracticeMode = isPracticeMode(params.mode) ? params.mode : "quiz";
  const level = parseLevelParam(params.level);
  const pack = useLevelPack(level);
  const { state, loaded } = useLearning();
  const [round, setRound] = useState(0);
  const title = PRACTICE_MODES[mode].title;

  // Picked once per round: the set must not reshuffle while it is being answered.
  const exercises = useMemo(() => {
    if (!pack.content || !loaded) return null;
    if (mode === "flashcards") return todaysCards(deckFor(pack.content, state, level), state, new Date());
    return buildPracticeSet(pack.content, mode, { grammarPointId: params.gp, accuracy: grammarAccuracy(state) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.content, loaded, mode, level, params.gp, round]);

  if (!exercises) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow={level} title={title} />
        <LoadingBlock rows={2} label="Getting your practice ready…" />
      </Screen>
    );
  }

  if (exercises.length === 0) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} eyebrow={level} title={title} />
        <EmptyState
          title={mode === "flashcards" ? "No cards due" : "Nothing here yet"}
          message={mode === "flashcards" ? "You're up to date. Try a quiz or a lesson next." : "This level has none of these yet. Try a lesson or another level."}
          illustration={ILLUSTRATION_SUCCESS}
          actionLabel={mode === "flashcards" ? "Start a quiz" : "Back to Learn"}
          onAction={() => (mode === "flashcards" ? router.replace({ pathname: "/practice/[mode]", params: { mode: "quiz", level } }) : router.back())}
        />
      </Screen>
    );
  }

  return (
    <SessionRunner
      key={round}
      eyebrow={level}
      title={title}
      exercises={exercises}
      packId={packIdForLevel(level)}
      level={level}
      kind={ACTIVITY[mode]}
      refId={params.gp ? `${mode}:${params.gp}` : `${mode}:${level}`}
      onClose={() => router.back()}
      onAgain={() => setRound((n) => n + 1)}
    />
  );
}
