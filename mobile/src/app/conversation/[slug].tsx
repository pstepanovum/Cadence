import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import {
  assess,
  getConversationModules,
  saveConversationResult,
  type RecordedAudio,
} from "@/api/endpoints";
import type { ConversationModuleWithProgress, ConversationTurn, PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { CoachBubble, ReplyPanel } from "@/components/practice/CoachBubble";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import { ResultSummary } from "@/components/practice/ResultSummary";
import { ReadinessBanner } from "@/components/status";
import {
  ActionRow,
  Banner,
  Body,
  Button,
  Card,
  Eyebrow,
  InfoPanel,
  Screen,
  ScreenState,
  SegmentedProgress,
  TopBar,
} from "@/components/ui";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { useExitGuard } from "@/hooks/useExitGuard";
import { describeError } from "@/hooks/useServerStatus";
import { speechStateFor, useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import { scenarioPassed } from "@/practice/progression";
import { averageScore, bestScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, spacing, type, themed } from "@/theme/theme";

export default function ConversationSessionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const modulesQuery = useQuery({
    queryKey: ["conversation-modules"],
    queryFn: getConversationModules,
  });
  const scenario = modulesQuery.data?.find((item) => item.slug === slug);

  if (scenario) {
    return (
      <Screen>
        <ScenarioRun scenario={scenario} />
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onClose={() => router.back()} closeLabel="Close conversation" title="Conversation" />
      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        errorMessage={describeError(modulesQuery.error, "Could not load this conversation.")}
        onRetry={() => void modulesQuery.refetch()}
        isEmpty={modulesQuery.isSuccess}
        loadingRows={3}
        loadingLabel="Loading the scenario…"
        empty={{
          title: "Conversation not found",
          message: "This scenario is no longer available.",
          actionLabel: "Back to conversations",
          onAction: () => router.back(),
        }}>
        {null}
      </ScreenState>
    </Screen>
  );
}

function ScenarioRun({ scenario }: { scenario: ConversationModuleWithProgress }) {
  const queryClient = useQueryClient();
  const readiness = useAssessReadiness();
  const speech = useSpeech();
  const { speak, prefetch, stop } = speech;

  const [turnIndex, setTurnIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [scores, setScores] = useState<number[]>([]);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const turns = scenario.turns;
  const currentTurn = turns[turnIndex];
  const upcoming = turns[turnIndex + 1];
  const inProgress = !finished && (scores.length > 0 || assessment !== null);
  const unsaved = finished && (saving || saveError !== null);
  // Each coach line plays once when its turn comes up; a retry plays it again.
  const spokenRef = useRef<string | null>(null);

  useExitGuard(
    inProgress || unsaved,
    unsaved ? "Your result isn't saved" : "Leave this conversation?",
    unsaved
      ? "Leaving now loses this result. Stay and save it again?"
      : `You have answered ${scores.length} of ${turns.length} turns. Leaving now discards the run.`,
    { stayLabel: unsaved ? "Stay" : "Keep going", onLeave: stop },
  );

  useEffect(() => {
    if (!currentTurn || finished) return;
    const key = `${currentTurn.id}-${attempt}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;
    void speak(currentTurn.coachMessage);
    if (upcoming) prefetch(upcoming.coachMessage);
  }, [attempt, currentTurn, finished, prefetch, speak, upcoming]);

  async function handleTake(take: RecordedAudio) {
    if (!currentTurn) return;
    try {
      const result = await assess(take, currentTurn.expectedResponse);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
    } catch (cause) {
      // Shown once, in the recorder's status line.
      throw new Error(describeError(cause, "Scoring failed. Try that reply again."));
    }
  }

  const saveResult = useCallback(
    async (finalScores: number[]) => {
      setSaving(true);
      setSaveError(null);
      try {
        await saveConversationResult({
          moduleSlug: scenario.slug,
          score: averageScore(finalScores),
          passed: scenarioPassed(scenario.passScore, finalScores),
        });
        await queryClient.invalidateQueries({ queryKey: ["conversation-modules"] });
      } catch (cause) {
        haptics.error();
        setSaveError(describeError(cause, "Your result could not be saved. Check your connection."));
      } finally {
        setSaving(false);
      }
    },
    [queryClient, scenario.passScore, scenario.slug],
  );

  async function advance() {
    if (!assessment) return;
    const nextScores = [...scores, normalizeScore(assessment.overallScore)];
    setScores(nextScores);
    setAssessment(null);

    if (turnIndex + 1 < turns.length) {
      setTurnIndex(turnIndex + 1);
      setAttempt(1);
      return;
    }

    stop();
    setFinished(true);
    if (scenarioPassed(scenario.passScore, nextScores)) {
      playCompletionSound();
      haptics.success();
    }
    await saveResult(nextScores);
  }

  function retryTurn() {
    setAssessment(null);
    setAttempt((value) => value + 1);
  }

  function restart() {
    stop();
    spokenRef.current = null;
    setScores([]);
    setTurnIndex(0);
    setAttempt(1);
    setAssessment(null);
    setFinished(false);
    setSaveError(null);
  }

  const close = () => {
    router.back();
  };

  if (finished) {
    const passed = scenarioPassed(scenario.passScore, scores);
    return (
      <>
        <TopBar onClose={close} closeLabel="Close conversation" eyebrow="Conversation" title={scenario.title} />
        <ResultSummary
          eyebrow="Scenario result"
          score={averageScore(scores)}
          title={passed ? "Scenario passed!" : "Almost there"}
          subtitle={
            passed
              ? "The next scenario is now unlocked."
              : `You need ${scenario.passScore} or higher to pass this one.`
          }
          stats={[
            { label: "Average", value: String(averageScore(scores)) },
            { label: "Best turn", value: String(bestScore(scores)) },
            { label: "Pass mark", value: String(scenario.passScore) },
          ]}
          items={turns.map((turn, index) => ({
            label: `Turn ${index + 1} · ${scores[index] ?? "—"}`,
            status: scores[index] == null ? "neutral" : scoreStatus(scores[index]),
          }))}
          celebrate={passed}>
          {saveError ? (
            <Banner
              message={saveError}
              tone="error"
              actionLabel={saving ? undefined : "Save again"}
              onAction={() => void saveResult(scores)}
              style={styles.summaryBanner}
            />
          ) : null}
          <ActionRow>
            <Button
              label="Run it again"
              variant="tonal"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={restart}
            />
            <Button label="Done" disabled={saving} onPress={close} />
          </ActionRow>
        </ResultSummary>
      </>
    );
  }

  if (!currentTurn) return null;

  return (
    <>
      <TopBar
        onClose={close}
        closeLabel="Close conversation"
        eyebrow={`Turn ${turnIndex + 1} of ${turns.length}`}
        title={scenario.title}
      />
      <SegmentedProgress total={turns.length} currentIndex={turnIndex} />

      <CoachBubble
        message={currentTurn.coachMessage}
        state={speechStateFor(speech, currentTurn.coachMessage)}
        onToggle={() => speech.toggle(currentTurn.coachMessage)}
        note={speech.error ? "The coach audio didn't load. Read the line and answer as usual." : undefined}
      />

      <ActiveTurn
        turn={currentTurn}
        attempt={attempt}
        readinessReady={readiness.ready}
        readinessBanner={<ReadinessBanner readiness={readiness} />}
        onTake={handleTake}
      />

      {assessment ? (
        <Card>
          <AssessmentView assessment={assessment} />
          <ActionRow>
            <Button
              label="Try again"
              variant="tonal"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={retryTurn}
            />
            <Button
              label={turnIndex + 1 < turns.length ? "Next turn" : "Finish"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={advance}
            />
          </ActionRow>
        </Card>
      ) : null}
    </>
  );
}

function ActiveTurn({
  turn,
  attempt,
  readinessReady,
  readinessBanner,
  onTake,
}: {
  turn: ConversationTurn;
  attempt: number;
  readinessReady: boolean;
  readinessBanner: React.ReactNode;
  onTake: (take: RecordedAudio) => Promise<void>;
}) {
  return (
    <>
      <ReplyPanel label="Say this">
        <Body weight="semibold" size={type.headline} tone="strong">
          {turn.expectedResponse}
        </Body>
      </ReplyPanel>

      <Card>
        <InfoPanel>
          <Eyebrow>Coaching cue</Eyebrow>
          <Body size={type.footnote}>{turn.coachingCue}</Body>
        </InfoPanel>
        {attempt > 1 ? (
          <Body size={type.caption} tone="muted" style={styles.centerText}>
            Attempt {attempt}
          </Body>
        ) : null}

        {readinessBanner}

        <RecorderPanel
          key={`${turn.id}-${attempt}`}
          targetText={turn.expectedResponse}
          onTake={onTake}
          disabled={!readinessReady}
          statusHint="Tap the microphone and say the reply out loud."
        />
      </Card>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    summaryBanner: {
      marginBottom: spacing.sm,
    },
    centerText: {
      textAlign: "center",
    },
  }),
);
