import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, Volume2 } from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { logPractice, useSessionClock } from "@/learning/log";
import { ChoiceButton, type ChoiceState } from "@/components/games/ChoiceButton";
import { RoundSummary } from "@/components/games/RoundSummary";
import { ScoreStrip } from "@/components/games/ScoreStrip";
import {
  ActionRow,
  Body,
  Button,
  Card,
  Eyebrow,
  InfoPanel,
  Screen,
  SegmentedProgress,
  Title,
  TopBar,
} from "@/components/ui";
import { levelLabel, parseLevel, vocabForLevel } from "@/data/vocabulary";
import { EMPTY_TALLY, accuracy, buildMeaningQuestions, tallyAnswer, type MeaningQuestion } from "@/games/quiz";
import { clockSeed, seededRng } from "@/games/random";
import { useGameProgress } from "@/games/store";
import { useExitGuard } from "@/hooks/useExitGuard";
import { useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { colors, fonts, spacing, type, themed } from "@/theme/theme";

const ROUND_LENGTH = 10;
const BADGES = ["A", "B", "C", "D"];

function newRound(level: ReturnType<typeof parseLevel>): MeaningQuestion[] {
  return buildMeaningQuestions(vocabForLevel(level), ROUND_LENGTH, seededRng(clockSeed()));
}

export default function MeaningMatchScreen() {
  const elapsed = useSessionClock();
  const params = useLocalSearchParams<{ level?: string }>();
  const level = parseLevel(params.level);
  const { progress, recordRound } = useGameProgress();
  const audio = useSpeech();
  const { prefetch } = audio;

  const [questions, setQuestions] = useState(() => newRound(level));
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [tally, setTally] = useState(EMPTY_TALLY);
  const [missed, setMissed] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const [previousBest, setPreviousBest] = useState(() => progress.bests["meaning-match"] ?? 0);
  const recorded = useRef(false);

  const question = questions[index];
  const answered = picked !== null;
  const correct = answered && picked === question?.answer.id;

  useExitGuard(
    tally.answered > 0 && !finished,
    "Leave the quiz?",
    "This round's score will be lost. Finished rounds are saved automatically.",
  );

  const answerWord = question?.answer.word;
  useEffect(() => {
    if (answerWord) prefetch(answerWord);
  }, [answerWord, prefetch]);

  const percent = useMemo(() => accuracy(tally.correct, tally.answered), [tally]);

  function choose(optionId: string) {
    if (!question || answered) return;
    const right = optionId === question.answer.id;
    setPicked(optionId);
    setTally((current) => tallyAnswer(current, right));
    if (right) {
      haptics.success();
    } else {
      haptics.error();
      setMissed((current) => [...current, question.answer.id]);
    }
    playAssessmentFeedback(right ? 100 : 0);
  }

  function next() {
    audio.stop();
    if (index + 1 >= questions.length) {
      finish();
      return;
    }
    setIndex(index + 1);
    setPicked(null);
  }

  function finish() {
    setFinished(true);
    if (recorded.current) return;
    recorded.current = true;
    logPractice({ kind: "quiz", refId: "game.meaning-match", level: null, score: percent, minutes: elapsed() });
    if (percent >= 70) playCompletionSound();
    recordRound({
      gameId: "meaning-match",
      score: tally.score,
      accuracy: percent,
      correct: tally.correct,
      total: tally.answered,
      label: levelLabel(level),
    });
  }

  function playAgain() {
    recorded.current = false;
    setPreviousBest((best) => Math.max(best, tally.score));
    setQuestions(newRound(level));
    setIndex(0);
    setPicked(null);
    setTally(EMPTY_TALLY);
    setMissed([]);
    setFinished(false);
  }

  const eyebrow = `Meaning Match · ${levelLabel(level)}`;

  if (finished || !question) {
    return (
      <Screen>
        <TopBar closeLabel="Leave this game" eyebrow={eyebrow} title="Round over" onClose={() => router.back()} />
        <RoundSummary
          accuracy={percent}
          isNewBest={tally.score > previousBest && tally.score > 0}
          subtitle={
            missed.length === 0
              ? "Not a single slip. Try a harder deck next."
              : "The words you missed are below — a flashcard pass will fix them."
          }
          stats={[
            { label: "Score", value: String(tally.score) },
            { label: "Correct", value: `${tally.correct}/${tally.answered}` },
            { label: "Best combo", value: `×${tally.bestStreak}` },
          ]}
          items={questions.map((item) => ({
            label: item.answer.word,
            status: missed.includes(item.answer.id) ? "needs-work" : "correct",
          }))}
          onPlayAgain={playAgain}
          onDone={() => router.back()}
        />
      </Screen>
    );
  }

  const pickWord = question.direction === "pick-word";

  function stateFor(optionId: string): ChoiceState {
    if (!answered) return "idle";
    if (optionId === question.answer.id) return "correct";
    if (optionId === picked) return "wrong";
    return "dimmed";
  }

  return (
    <Screen>
      <TopBar closeLabel="Leave this game"
        eyebrow={eyebrow}
        title={`Question ${index + 1} of ${questions.length}`}
        onClose={() => router.back()}
      />
      <ScoreStrip score={tally.score} streak={tally.streak} />
      <SegmentedProgress total={questions.length} currentIndex={index} />

      <Card variant="cream" style={styles.prompt}>
        <Eyebrow>{pickWord ? "Which word means…" : "What does this mean?"}</Eyebrow>
        {pickWord ? (
          <Body size={type.headline} weight="semibold" style={styles.center}>
            {question.answer.definition}
          </Body>
        ) : (
          <>
            <Title size={type.display} style={styles.center}>
              {question.answer.word}
            </Title>
            <Body size={type.body} style={styles.ipa}>
              {question.answer.ipa}
            </Body>
          </>
        )}
      </Card>

      <View style={styles.options}>
        {question.options.map((option, optionIndex) => (
          <ChoiceButton
            key={option.id}
            badge={BADGES[optionIndex]}
            label={pickWord ? option.word : option.definition}
            sublabel={pickWord ? option.ipa : undefined}
            state={stateFor(option.id)}
            disabled={answered}
            onPress={() => choose(option.id)}
          />
        ))}
      </View>

      {answered ? (
        <>
          <InfoPanel tone={correct ? "cream" : "white"}>
            <Eyebrow tone={correct ? colors.sageText : colors.brickText}>
              {correct ? "Right" : `It was “${question.answer.word}”`}
            </Eyebrow>
            <Body size={type.callout} tone="muted">
              “{question.answer.example}”
            </Body>
          </InfoPanel>
          <ActionRow>
            <Button
              label="Hear it"
              variant="tonal"
              loading={audio.isLoading}
              icon={<Volume2 color={colors.hunter} size={16} />}
              onPress={() => audio.toggle(question.answer.word)}
            />
            <Button
              label={index + 1 >= questions.length ? "See results" : "Next"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={next}
            />
          </ActionRow>
        </>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    prompt: {
      alignItems: "center",
      gap: spacing.sm,
      minHeight: 120,
      justifyContent: "center",
    },
    center: {
      textAlign: "center",
    },
    ipa: {
      fontFamily: fonts.bodyMedium,
      color: colors.slate,
    },
    options: {
      gap: spacing.sm,
    },
  }),
);
