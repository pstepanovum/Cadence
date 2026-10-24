import { router, useLocalSearchParams } from "expo-router";
import { Volume2 } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { playCompletionSound } from "@/audio/feedback";
import { logPractice, useSessionClock } from "@/learning/log";
import { FlipCard } from "@/components/games/FlipCard";
import { RoundSummary } from "@/components/games/RoundSummary";
import {
  ActionRow,
  Banner,
  Body,
  Button,
  Chip,
  EmptyState,
  Eyebrow,
  LoadingBlock,
  Screen,
  SegmentedProgress,
  Title,
  TopBar,
} from "@/components/ui";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { levelLabel, parseLevel, vocabById, vocabForLevel } from "@/data/vocabulary";
import { sample } from "@/games/random";
import { planSession, type CardState, type Grade } from "@/games/srs";
import { useGameProgress } from "@/games/store";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { colors, fonts, spacing, type, themed } from "@/theme/theme";

const REVIEW_ANYWAY = 10;

/**
 * Waits for the stored cards, then hands them to the session once. The
 * session must not see a second copy of the deck mid-run, or the queue would
 * reshuffle under the learner's thumb.
 */
export default function FlashcardsScreen() {
  const params = useLocalSearchParams<{ level?: string }>();
  const level = parseLevel(params.level);
  const { progress, loaded } = useGameProgress();

  if (!loaded) {
    return (
      <Screen>
        <TopBar closeLabel="Leave this game"
          eyebrow={`Flashcards · ${levelLabel(level)}`}
          title="Loading your deck"
          onClose={() => router.back()}
        />
        <LoadingBlock rows={2} label="Checking which cards are due…" />
      </Screen>
    );
  }

  return <FlashcardSession level={level} initialCards={progress.cards} />;
}

function FlashcardSession({
  level,
  initialCards,
}: {
  level: ReturnType<typeof parseLevel>;
  initialCards: Readonly<Record<string, CardState>>;
}) {
  const elapsed = useSessionClock();
  const deck = useMemo(() => vocabForLevel(level), [level]);
  const deckIds = useMemo(() => deck.map((word) => word.id), [deck]);

  const { progress, gradeCard, recordRound } = useGameProgress();
  const audio = useSpeech();
  const { prefetch } = audio;

  const [initialPlan] = useState(() => planSession(deckIds, initialCards, new Date()));
  const [queue, setQueue] = useState<string[]>(initialPlan.ids);
  const [planned, setPlanned] = useState({ due: initialPlan.dueCount, fresh: initialPlan.newCount });
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [grades, setGrades] = useState<Record<string, Grade>>({});
  const [finished, setFinished] = useState(false);
  const recorded = useRef(false);

  const currentId = queue[index];
  const current = currentId ? vocabById(currentId) : undefined;
  const reviewedIds = Object.keys(grades);
  const remembered = reviewedIds.filter((id) => grades[id] !== "again").length;
  const inProgress = reviewedIds.length > 0 && !finished;

  useExitGuard(
    inProgress,
    "Leave the deck?",
    "Cards you have already graded are saved. The rest of today's queue will wait for you.",
  );

  const currentWord = current?.word;
  useEffect(() => {
    if (currentWord) prefetch(currentWord);
  }, [currentWord, prefetch]);

  function finish(finalGrades: Record<string, Grade>) {
    setFinished(true);
    if (recorded.current) return;
    recorded.current = true;
    const ids = Object.keys(finalGrades);
    const kept = ids.filter((id) => finalGrades[id] !== "again").length;
    const accuracy = ids.length ? Math.round((kept / ids.length) * 100) : 0;
    logPractice({ kind: "flashcards", refId: "game.flashcards", level: null, score: accuracy, minutes: elapsed() });
    if (accuracy >= 70) playCompletionSound();
    recordRound({
      gameId: "flashcards",
      score: kept * 10,
      accuracy,
      correct: kept,
      total: ids.length,
      label: levelLabel(level),
    });
  }

  function grade(value: Grade) {
    if (!currentId) return;
    gradeCard(currentId, value);
    if (value === "again") haptics.warning();
    else haptics.success();

    const nextGrades = { ...grades, [currentId]: value };
    setGrades(nextGrades);

    // A forgotten card comes back once more at the end of this session.
    let nextQueue = queue;
    if (value === "again" && !queue.slice(index + 1).includes(currentId)) {
      nextQueue = [...queue, currentId];
      setQueue(nextQueue);
    }

    setFlipped(false);
    audio.stop();
    if (index + 1 >= nextQueue.length) {
      finish(nextGrades);
    } else {
      setIndex(index + 1);
    }
  }

  function restart(ids: string[]) {
    recorded.current = false;
    setGrades({});
    setIndex(0);
    setFlipped(false);
    setFinished(false);
    setQueue(ids);
  }

  function playAgain() {
    const plan = planSession(deckIds, progress.cards, new Date());
    setPlanned({ due: plan.dueCount, fresh: plan.newCount });
    restart(plan.ids.length > 0 ? plan.ids : sample(deckIds, REVIEW_ANYWAY));
  }

  const eyebrow = `Flashcards · ${levelLabel(level)}`;

  if (finished) {
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow={eyebrow} title="Deck done" onClose={() => router.back()} />
        <RoundSummary
          eyebrow="Session complete"
          accuracy={reviewedIds.length ? Math.round((remembered / reviewedIds.length) * 100) : 0}
          subtitle={
            remembered === reviewedIds.length
              ? "Every card stuck. They'll be back when you're about to forget them."
              : "The ones you missed are due again today, so a second pass is worth it."
          }
          stats={[
            { label: "Reviewed", value: String(reviewedIds.length) },
            { label: "Remembered", value: String(remembered) },
            { label: "Again", value: String(reviewedIds.length - remembered) },
          ]}
          items={reviewedIds.map((id) => ({
            label: vocabById(id)?.word ?? id,
            status: grades[id] === "again" ? "needs-work" : grades[id] === "easy" ? "correct" : "mixed",
          }))}
          onPlayAgain={playAgain}
          onDone={() => router.back()}
          playAgainLabel="Review again"
        />
      </Screen>
    );
  }

  if (queue.length === 0 || !current) {
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow={eyebrow} title="All caught up" onClose={() => router.back()} />
        <EmptyState
          title="Nothing due today"
          message={`Every card in the ${levelLabel(level)} deck is scheduled for later. Come back tomorrow, or run through a few anyway.`}
          illustration={ILLUSTRATION_SUCCESS}
          actionLabel={`Review ${Math.min(REVIEW_ANYWAY, deckIds.length)} anyway`}
          onAction={() => restart(sample(deckIds, REVIEW_ANYWAY))}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar closeLabel="Leave this game"
        eyebrow={eyebrow}
        title={`Card ${index + 1} of ${queue.length}`}
        onClose={() => router.back()}
      />

      <View style={styles.planRow}>
        {planned.due > 0 ? <Chip label={`${planned.due} due`} status="mixed" /> : null}
        {planned.fresh > 0 ? <Chip label={`${planned.fresh} new`} status="accent" /> : null}
        {grades[current.id] === "again" ? <Chip label="Second look" status="needs-work" /> : null}
      </View>

      <SegmentedProgress total={queue.length} currentIndex={index} />

      <FlipCard
        key={`${current.id}-${index}`}
        flipped={flipped}
        onPress={() => {
          haptics.select();
          setFlipped((value) => !value);
        }}
        front={
          <View style={styles.face}>
            <Eyebrow>{current.pos}</Eyebrow>
            <Title size={type.display + 4} style={styles.center}>
              {current.word}
            </Title>
            <Body size={type.headline} style={styles.ipa}>
              {current.ipa}
            </Body>
            <Body size={type.caption} tone="muted" style={styles.hint}>
              Tap to see the meaning
            </Body>
          </View>
        }
        back={
          <View style={styles.face}>
            <Eyebrow onDark>{current.word}</Eyebrow>
            <Body size={type.headline} weight="semibold" onDark style={styles.center}>
              {current.definition}
            </Body>
            <Body size={type.callout} onDark tone="muted" style={[styles.center, styles.example]}>
              “{current.example}”
            </Body>
          </View>
        }
      />

      {audio.error ? <Banner message={audio.error} tone="warning" /> : null}

      <Button
        label={audio.activeText === current.word ? "Playing…" : "Hear it"}
        variant="tonal"
        loading={audio.isLoading && audio.activeText === current.word}
        icon={<Volume2 color={colors.hunter} size={16} />}
        onPress={() => audio.toggle(current.word)}
      />

      {flipped ? (
        <ActionRow>
          <Button label="Again" variant="danger" onPress={() => grade("again")} />
          <Button label="Good" variant="primary" onPress={() => grade("good")} />
          <Button label="Easy" variant="secondary" onPress={() => grade("easy")} />
        </ActionRow>
      ) : (
        <Button
          label="Show meaning"
          variant="secondary"
          onPress={() => setFlipped(true)}
        />
      )}

      <Body size={type.caption} tone="muted" style={styles.footer}>
        {flipped
          ? "Again brings it back today. Good waits a few days. Easy waits longer."
          : "Say it out loud before you flip. Guessing is how it sticks."}
      </Body>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    planRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    face: {
      alignItems: "center",
      gap: spacing.sm,
    },
    center: {
      textAlign: "center",
    },
    ipa: {
      fontFamily: fonts.bodyMedium,
      color: colors.sageText,
    },
    hint: {
      marginTop: spacing.md,
    },
    example: {
      marginTop: spacing.xs,
    },
    footer: {
      textAlign: "center",
    },
  }),
);
