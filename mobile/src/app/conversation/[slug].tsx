import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ArrowRight, Pause, Play, RotateCcw, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  assess,
  getConversationModules,
  saveConversationResult,
  type RecordedAudio,
} from "@/api/endpoints";
import type { ConversationTurn, PronunciationAssessment } from "@/api/types";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { getReferenceAudio, prefetchReferenceAudio } from "@/audio/reference-audio";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  InfoPanel,
  PillButton,
  ProgressRing,
  RoundIconButton,
  Screen,
  ScreenState,
  SegmentedProgress,
  StatTile,
  Title,
} from "@/components/ui";
import { ILLUSTRATION_SUCCESS } from "@/data/svg";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { usePlayback } from "@/hooks/usePlayback";
import { describeError } from "@/hooks/useServerStatus";
import { scenarioPassed } from "@/practice/progression";
import { averageScore, bestScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, radii, spacing } from "@/theme/theme";

export default function ConversationSessionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const queryClient = useQueryClient();
  const navigation = useNavigation();
  const playback = usePlayback();
  const readiness = useAssessReadiness();
  const { instruct } = useCoachVoice();

  const modulesQuery = useQuery({
    queryKey: ["conversation-modules"],
    queryFn: getConversationModules,
  });
  const scenario = modulesQuery.data?.find((item) => item.slug === slug);

  const [turnIndex, setTurnIndex] = useState(0);
  const [attempt, setAttempt] = useState(1);
  const [scores, setScores] = useState<number[]>([]);
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [coachAudioFailed, setCoachAudioFailed] = useState(false);
  const [coachLoading, setCoachLoading] = useState(false);

  const currentTurn = scenario?.turns[turnIndex];
  const inProgress = !finished && (scores.length > 0 || assessment !== null);
  const spokenTurnRef = useRef<string | null>(null);

  const speakCoachLine = useCallback(
    async (message: string) => {
      if (playback.isPlaying || playback.isLoading) {
        playback.stop();
        return;
      }
      setCoachLoading(true);
      setCoachAudioFailed(false);
      try {
        const uri = await getReferenceAudio(message, instruct);
        await playback.play(uri);
      } catch {
        // The line is on screen either way; the learner just answers without it.
        setCoachAudioFailed(true);
      } finally {
        setCoachLoading(false);
      }
    },
    [instruct, playback],
  );

  // Play each coach line once when its turn comes up, and warm the next one.
  useEffect(() => {
    if (!currentTurn || finished) return;
    if (spokenTurnRef.current === currentTurn.id) return;
    spokenTurnRef.current = currentTurn.id;
    speakCoachLine(currentTurn.coachMessage);
    const upcoming = scenario?.turns[turnIndex + 1];
    if (upcoming) prefetchReferenceAudio(upcoming.coachMessage, instruct);
    // speakCoachLine changes identity with the playback state, which would
    // replay the line mid-playback; the ref guard above is what gates this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTurn?.id, finished]);

  // Leaving mid-scenario throws the run away, so ask first.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      if (!inProgress) return;
      event.preventDefault();
      Alert.alert(
        "Leave this conversation?",
        `You have answered ${scores.length} of ${scenario?.turns.length ?? 0} turns. Leaving now discards the run.`,
        [
          { text: "Keep going", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => {
              playback.stop();
              navigation.dispatch(event.data.action);
            },
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, inProgress, scores.length, scenario?.turns.length, playback]);

  async function handleTake(take: RecordedAudio) {
    if (!currentTurn) return;
    setError(null);
    try {
      const result = await assess(take, currentTurn.expectedResponse);
      setAssessment(result);
      playAssessmentFeedback(result.overallScore);
    } catch (cause) {
      const message = describeError(cause, "Scoring failed. Try that reply again.");
      setError(message);
      throw new Error(message);
    }
  }

  const saveResult = useCallback(
    async (finalScores: number[]) => {
      if (!scenario) return;
      const avg = averageScore(finalScores);
      setSaving(true);
      setSaveError(null);
      try {
        await saveConversationResult({
          moduleSlug: scenario.slug,
          score: avg,
          passed: scenarioPassed(scenario.passScore, finalScores),
        });
        await queryClient.invalidateQueries({ queryKey: ["conversation-modules"] });
      } catch (cause) {
        setSaveError(
          describeError(cause, "Your result could not be saved. Check your connection."),
        );
      } finally {
        setSaving(false);
      }
    },
    [queryClient, scenario],
  );

  async function advance() {
    if (!scenario || !assessment) return;
    const nextScores = [...scores, normalizeScore(assessment.overallScore)];
    setScores(nextScores);
    setAssessment(null);
    setError(null);

    if (turnIndex + 1 < scenario.turns.length) {
      setTurnIndex(turnIndex + 1);
      setAttempt(1);
      return;
    }

    playback.stop();
    setFinished(true);
    if (scenarioPassed(scenario.passScore, nextScores)) playCompletionSound();
    await saveResult(nextScores);
  }

  function retryTurn() {
    setAssessment(null);
    setError(null);
    setAttempt((value) => value + 1);
    // Replaying the line is part of retrying the turn on web, too.
    spokenTurnRef.current = null;
  }

  function restart() {
    playback.stop();
    spokenTurnRef.current = null;
    setScores([]);
    setTurnIndex(0);
    setAttempt(1);
    setAssessment(null);
    setFinished(false);
    setSaveError(null);
  }

  return (
    <Screen>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Eyebrow>
            {scenario && !finished
              ? `Turn ${turnIndex + 1} of ${scenario.turns.length}`
              : "Conversation"}
          </Eyebrow>
          <Title size={20}>{scenario?.title ?? "Loading…"}</Title>
        </View>
        <RoundIconButton
          accessibilityLabel="Close conversation"
          onPress={() => {
            playback.stop();
            router.back();
          }}>
          <X color={colors.hunter} size={20} />
        </RoundIconButton>
      </View>

      <ScreenState
        isLoading={modulesQuery.isLoading}
        isError={modulesQuery.isError}
        errorMessage={describeError(modulesQuery.error, "Could not load this conversation.")}
        onRetry={() => modulesQuery.refetch()}
        isEmpty={modulesQuery.isSuccess && !scenario}
        loadingRows={3}
        loadingLabel="Loading the scenario…"
        empty={{
          title: "Conversation not found",
          message: "This scenario is no longer available. Head back and pick another one.",
          actionLabel: "Back to conversations",
          onAction: () => router.back(),
        }}>
        {scenario && finished ? (
          <>
            <Card style={styles.summaryCard}>
              <Eyebrow>{scenario.title}</Eyebrow>
              <ProgressRing score={averageScore(scores)} size={104} strokeWidth={9} />
              <Title size={22} style={styles.centerText}>
                {scenarioPassed(scenario.passScore, scores) ? "Scenario passed!" : "Almost there"}
              </Title>
              <Body size={13} style={styles.centerText}>
                {scenarioPassed(scenario.passScore, scores)
                  ? "The next scenario is now unlocked."
                  : `You need ${scenario.passScore} or higher to pass this one.`}
              </Body>

              <View style={styles.statsRow}>
                <StatTile label="Average" value={String(averageScore(scores))} />
                <StatTile label="Best turn" value={String(bestScore(scores))} />
                <StatTile label="Pass mark" value={String(scenario.passScore)} />
              </View>

              <View style={styles.summaryChips}>
                {scenario.turns.map((turn, index) => (
                  <Chip
                    key={turn.id}
                    label={`Turn ${index + 1} · ${scores[index] ?? "—"}`}
                    status={scores[index] == null ? "neutral" : scoreStatus(scores[index])}
                  />
                ))}
              </View>

              {scenarioPassed(scenario.passScore, scores) ? (
                <SvgXml xml={ILLUSTRATION_SUCCESS} width={168} height={168} />
              ) : null}
            </Card>

            {saveError ? (
              <Banner
                message={saveError}
                tone="error"
                actionLabel={saving ? undefined : "Save again"}
                onAction={() => saveResult(scores)}
              />
            ) : null}

            <PillButton
              label="Run it again"
              variant="ghost"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={restart}
            />
            <PillButton label="Back to conversations" onPress={() => router.back()} />
          </>
        ) : scenario && currentTurn ? (
          <ActiveTurn
            turn={currentTurn}
            turnIndex={turnIndex}
            totalTurns={scenario.turns.length}
            attempt={attempt}
            scores={scores}
            assessment={assessment}
            error={error}
            coachAudioFailed={coachAudioFailed}
            coachLoading={coachLoading}
            isPlaying={playback.isPlaying}
            readinessMessage={readiness.message}
            readinessOffline={readiness.offline}
            readinessReady={readiness.ready}
            onRefreshReadiness={readiness.refresh}
            onSpeak={() => speakCoachLine(currentTurn.coachMessage)}
            onTake={handleTake}
            onRetry={retryTurn}
            onAdvance={advance}
          />
        ) : null}
      </ScreenState>
    </Screen>
  );
}

function ActiveTurn({
  turn,
  turnIndex,
  totalTurns,
  attempt,
  scores,
  assessment,
  error,
  coachAudioFailed,
  coachLoading,
  isPlaying,
  readinessMessage,
  readinessOffline,
  readinessReady,
  onRefreshReadiness,
  onSpeak,
  onTake,
  onRetry,
  onAdvance,
}: {
  turn: ConversationTurn;
  turnIndex: number;
  totalTurns: number;
  attempt: number;
  scores: number[];
  assessment: PronunciationAssessment | null;
  error: string | null;
  coachAudioFailed: boolean;
  coachLoading: boolean;
  isPlaying: boolean;
  readinessMessage: string | null;
  readinessOffline: boolean;
  readinessReady: boolean;
  onRefreshReadiness: () => void;
  onSpeak: () => void;
  onTake: (take: RecordedAudio) => Promise<void>;
  onRetry: () => void;
  onAdvance: () => void;
}) {
  return (
    <>
      <SegmentedProgress total={totalTurns} currentIndex={turnIndex} />

      <View style={styles.coachBubble}>
        <View style={styles.coachBubbleHeader}>
          <Eyebrow onDark>Coach</Eyebrow>
          <RoundIconButton
            accessibilityLabel={isPlaying ? "Stop the coach line" : "Play the coach line"}
            tone="translucent"
            size={36}
            disabled={coachLoading}
            onPress={onSpeak}>
            {isPlaying ? (
              <Pause color={colors.yellowGreen} size={16} />
            ) : (
              <Play color={colors.yellowGreen} size={16} />
            )}
          </RoundIconButton>
        </View>
        <Body onDark>{turn.coachMessage}</Body>
        {coachAudioFailed ? (
          <Body size={12} onDark>
            The coach audio could not load — read the line above and answer as usual.
          </Body>
        ) : null}
      </View>

      <Card>
        <Eyebrow>Say this</Eyebrow>
        <Body weight="semibold" size={15}>
          {turn.expectedResponse}
        </Body>
        <InfoPanel>
          <Eyebrow>Coaching cue</Eyebrow>
          <Body size={12}>{turn.coachingCue}</Body>
        </InfoPanel>

        <View style={styles.statsRow}>
          <StatTile label="Attempt" value={String(attempt)} />
          <StatTile label="Answered" value={`${scores.length}/${totalTurns}`} />
          <StatTile label="Left" value={String(totalTurns - turnIndex - 1)} />
        </View>

        {!readinessReady && readinessMessage ? (
          <Banner
            tone={readinessOffline ? "error" : "warning"}
            message={readinessMessage}
            actionLabel={readinessOffline ? "Try again" : undefined}
            onAction={readinessOffline ? onRefreshReadiness : undefined}
          />
        ) : null}

        <RecorderPanel
          key={`${turn.id}-${attempt}`}
          targetText={turn.expectedResponse}
          onTake={onTake}
          disabled={!readinessReady}
          statusHint="Tap the microphone and give the reply out loud."
        />
      </Card>

      {error ? <Banner message={error} tone="error" /> : null}

      {assessment ? (
        <Card>
          <AssessmentView assessment={assessment} />
          <View style={styles.actionRow}>
            <PillButton
              label="Try again"
              variant="ghost"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={onRetry}
              style={styles.actionButton}
            />
            <PillButton
              label={turnIndex + 1 < totalTurns ? "Next turn" : "Finish scenario"}
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={onAdvance}
              style={styles.actionButton}
            />
          </View>
        </Card>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  topBarText: {
    flex: 1,
    gap: spacing.xs,
  },
  coachBubble: {
    borderRadius: radii.card,
    backgroundColor: colors.hunter,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  coachBubbleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    alignItems: "center",
    gap: spacing.lg,
  },
  summaryChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  centerText: {
    textAlign: "center",
  },
});
