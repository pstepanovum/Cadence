import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { ArrowRight, Pause, Play, RotateCcw, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { assess, coachTurn, transcribe, type RecordedAudio } from "@/api/endpoints";
import type { CoachHistoryEntry, CoachMode } from "@/api/types";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { getReferenceAudio } from "@/audio/reference-audio";
import { AssessmentView } from "@/components/practice/AssessmentView";
import { RecorderPanel } from "@/components/practice/RecorderPanel";
import {
  Banner,
  Body,
  Card,
  Chip,
  Eyebrow,
  InfoPanel,
  LoadingBlock,
  PillButton,
  ProgressRing,
  RoundIconButton,
  Screen,
  StatTile,
  Title,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { usePlayback } from "@/hooks/usePlayback";
import { describeError } from "@/hooks/useServerStatus";
import {
  readCoachSessions,
  saveCoachSession,
  type CoachSessionTurn,
  type SavedCoachSession,
} from "@/lib/coach-storage";
import { averageScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, radii, spacing } from "@/theme/theme";

/** Past this the history payload gets long and the model starts repeating itself. */
const SOFT_TURN_LIMIT = 10;

function buildHistory(turns: CoachSessionTurn[]): CoachHistoryEntry[] {
  return turns.flatMap((turn) => {
    const entries: CoachHistoryEntry[] = [{ role: "coach", content: turn.coachMessage }];
    if (turn.assessment) {
      const spokenReply = turn.assessment.transcript?.trim() || turn.assessment.targetText;
      entries.push({
        role: "user",
        content: spokenReply,
        score: turn.assessment.overallScore,
        transcript: turn.assessment.transcript,
      });
    } else if (turn.freeTranscript) {
      entries.push({
        role: "user",
        content: turn.freeTranscript,
        transcript: turn.freeTranscript,
      });
    }
    return entries;
  });
}

function newSessionId(): string {
  return `coach-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function CoachSessionScreen() {
  const params = useLocalSearchParams<{ topic: string; mode: CoachMode; sessionId?: string }>();
  const topic = params.topic ?? "Everyday conversation";
  const mode: CoachMode = params.mode === "freedom" ? "freedom" : "target";

  const { session } = useAuth();
  const userId = session?.user.id ?? "anonymous";
  const navigation = useNavigation();
  const playback = usePlayback();
  const readiness = useAssessReadiness();
  const { instruct } = useCoachVoice();

  const [turns, setTurns] = useState<CoachSessionTurn[]>([]);
  // Non-null means a coach turn is being fetched. Set from event handlers and
  // from the restore effect's callbacks — never synchronously inside an effect.
  const [pending, setPending] = useState<"start" | "continue" | null>(
    params.sessionId ? null : "start",
  );
  const [restoring, setRestoring] = useState(Boolean(params.sessionId));
  const [turnError, setTurnError] = useState<string | null>(null);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const sessionIdRef = useRef<string | null>(params.sessionId ?? null);
  const createdAtRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  const scored = turns
    .map((turn) => turn.assessment?.overallScore)
    .filter((value): value is number => value != null);

  const persist = useCallback(
    (nextTurns: CoachSessionTurn[]) => {
      if (!sessionIdRef.current) sessionIdRef.current = newSessionId();
      const now = new Date().toISOString();
      if (!createdAtRef.current) createdAtRef.current = now;
      const saved: SavedCoachSession = {
        id: sessionIdRef.current,
        topic,
        replyMode: mode,
        // Keep the original creation time: overwriting it on every save made
        // the history list re-sort itself on each turn.
        createdAt: createdAtRef.current,
        updatedAt: now,
        turns: nextTurns,
      };
      saveCoachSession(userId, saved).catch(() => {
        // History is a convenience; a failed write must not break the session.
      });
    },
    [mode, topic, userId],
  );

  const speakCoachLine = useCallback(
    async (message: string) => {
      if (playback.isPlaying || playback.isLoading) {
        playback.stop();
        return;
      }
      try {
        const uri = await getReferenceAudio(message, instruct);
        await playback.play(uri);
      } catch {
        // TTS is a nice-to-have; the message is on screen regardless.
      }
    },
    [instruct, playback],
  );

  // --- Restore a saved conversation ----------------------------------------
  useEffect(() => {
    if (!params.sessionId) return;
    let cancelled = false;
    readCoachSessions(userId)
      .then((sessions) => {
        if (cancelled) return;
        const saved = sessions.find((item) => item.id === params.sessionId);
        if (saved && saved.turns.length > 0) {
          createdAtRef.current = saved.createdAt;
          setTurns(saved.turns);
        } else {
          // The id points at nothing — treat it as a fresh conversation.
          setPending("start");
        }
      })
      .catch(() => {
        if (!cancelled) setPending("start");
      })
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.sessionId, userId]);

  // --- Fetch a coach turn ---------------------------------------------------
  useEffect(() => {
    if (!pending || inFlightRef.current) return;
    inFlightRef.current = true;
    let cancelled = false;
    const action = pending;
    const basis = action === "start" ? [] : turns;

    coachTurn({ action, topic, mode, history: action === "start" ? [] : buildHistory(basis) })
      .then((response) => {
        if (cancelled) return;
        const nextTurns = [
          ...basis,
          {
            id: newSessionId(),
            coachMessage: response.turn.coachMessage,
            learnerReply: response.turn.learnerReply,
            assessment: null,
            freeTranscript: null,
          },
        ];
        setTurns(nextTurns);
        persist(nextTurns);
        speakCoachLine(response.turn.coachMessage);
      })
      .catch((cause) => {
        if (cancelled) return;
        setTurnError(
          describeError(cause, "The coach did not answer. Check your connection and try again."),
        );
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!cancelled) setPending(null);
      });

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
    // `turns` is read through `basis` at call time; adding it here would refire
    // the request as soon as the new turn lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, topic, mode]);

  // Leaving mid-answer is fine (everything is saved), but say so on a live turn.
  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", () => {
      playback.stop();
    });
    return unsubscribe;
  }, [navigation, playback]);

  const currentTurn = turns[turns.length - 1];
  const answered = Boolean(currentTurn?.assessment || currentTurn?.freeTranscript);
  const awaitingReply = Boolean(currentTurn) && !answered && !pending && !ended;

  async function handleTake(take: RecordedAudio) {
    if (!currentTurn) return;
    setReplyError(null);
    try {
      let updatedTurn: CoachSessionTurn;
      if (mode === "target") {
        const result = await assess(take, currentTurn.learnerReply);
        playAssessmentFeedback(result.overallScore);
        updatedTurn = { ...currentTurn, assessment: result };
      } else {
        const { transcript } = await transcribe(take);
        if (!transcript.trim()) {
          const message =
            "Nothing came through on that one. Move somewhere quieter and record it again.";
          setReplyError(message);
          throw new Error(message);
        }
        let assessment = null;
        try {
          assessment = await assess(take, transcript);
          playAssessmentFeedback(assessment.overallScore);
        } catch {
          // Freedom mode tolerates a failed scoring pass; keep the transcript.
        }
        updatedTurn = { ...currentTurn, assessment, freeTranscript: transcript };
      }
      const nextTurns = [...turns.slice(0, -1), updatedTurn];
      setTurns(nextTurns);
      persist(nextTurns);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    } catch (cause) {
      const message = describeError(cause, "That reply could not be scored. Try again.");
      setReplyError(message);
      throw new Error(message);
    }
  }

  function retryReply() {
    if (!currentTurn) return;
    setReplyError(null);
    const nextTurns = [
      ...turns.slice(0, -1),
      { ...currentTurn, assessment: null, freeTranscript: null },
    ];
    setTurns(nextTurns);
    persist(nextTurns);
  }

  function endSession() {
    playback.stop();
    setEnded(true);
    if (scored.length > 0) playCompletionSound();
  }

  function confirmEnd() {
    if (!answered && turns.length > 0) {
      Alert.alert("End this conversation?", "Your saved turns stay in your history.", [
        { text: "Keep going", style: "cancel" },
        { text: "End session", style: "destructive", onPress: endSession },
      ]);
      return;
    }
    endSession();
  }

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.topBar}>
        <View style={styles.topBarText}>
          <Eyebrow>{mode === "target" ? "Repeat mode" : "Free mode"}</Eyebrow>
          <Title size={20} numberOfLines={2}>
            {topic}
          </Title>
        </View>
        <RoundIconButton
          accessibilityLabel="Close the coach session"
          onPress={() => {
            playback.stop();
            router.back();
          }}>
          <X color={colors.hunter} size={20} />
        </RoundIconButton>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        {restoring ? <LoadingBlock rows={2} label="Picking up where you left off…" /> : null}

        {turns.map((turn, index) => (
          <View key={turn.id} style={styles.turnBlock}>
            <View style={styles.coachBubble}>
              <View style={styles.coachBubbleHeader}>
                <Eyebrow onDark>Coach</Eyebrow>
                <RoundIconButton
                  accessibilityLabel="Play this coach line"
                  tone="translucent"
                  size={36}
                  onPress={() => speakCoachLine(turn.coachMessage)}>
                  {playback.isPlaying ? (
                    <Pause color={colors.yellowGreen} size={16} />
                  ) : (
                    <Play color={colors.yellowGreen} size={16} />
                  )}
                </RoundIconButton>
              </View>
              <Body onDark>{turn.coachMessage}</Body>
            </View>

            {mode === "target" && turn.learnerReply && !turn.assessment ? (
              <View style={styles.replyPanel}>
                <Eyebrow>Say this</Eyebrow>
                <Body weight="semibold" size={15}>
                  {turn.learnerReply}
                </Body>
              </View>
            ) : null}

            {turn.freeTranscript ? (
              <View style={styles.replyPanel}>
                <Eyebrow>You said</Eyebrow>
                <Body size={14}>&ldquo;{turn.freeTranscript}&rdquo;</Body>
              </View>
            ) : null}

            {turn.assessment ? (
              <Card>
                <AssessmentView assessment={turn.assessment} compact={index < turns.length - 1} />
              </Card>
            ) : null}
          </View>
        ))}

        {pending ? (
          <InfoPanel>
            <Body size={13} style={styles.centerText}>
              {pending === "start"
                ? "The coach is opening the conversation…"
                : "The coach is thinking…"}
            </Body>
          </InfoPanel>
        ) : null}

        {turnError ? (
          <Banner
            message={turnError}
            tone="error"
            actionLabel="Try again"
            onAction={() => {
              setTurnError(null);
              setPending(turns.length > 0 ? "continue" : "start");
            }}
          />
        ) : null}

        {!pending && !restoring && turns.length === 0 && !turnError ? (
          <Banner
            tone="info"
            message="This conversation has not started yet."
            actionLabel="Start it"
            onAction={() => setPending("start")}
          />
        ) : null}

        {ended ? (
          <Card style={styles.summaryCard}>
            <Eyebrow>Session complete</Eyebrow>
            <ProgressRing score={averageScore(scored)} size={96} strokeWidth={8} />
            <Title size={20} style={styles.centerText}>
              {scored.length > 0 ? "Nice run" : "Session saved"}
            </Title>
            <View style={styles.statsRow}>
              <StatTile label="Turns" value={String(turns.length)} />
              <StatTile label="Scored" value={String(scored.length)} />
              <StatTile
                label="Average"
                value={scored.length ? String(averageScore(scored)) : "—"}
              />
            </View>
            <View style={styles.chips}>
              {scored.map((value, index) => (
                <Chip
                  key={index}
                  label={`Turn ${index + 1} · ${normalizeScore(value)}`}
                  status={scoreStatus(value)}
                />
              ))}
            </View>
            <Body size={12} style={styles.centerText}>
              Saved to this device — you can pick it back up from the Coach tab.
            </Body>
            <PillButton label="Back to the coach" onPress={() => router.back()} />
          </Card>
        ) : null}

        {awaitingReply && currentTurn ? (
          <Card>
            {!readiness.ready && readiness.message ? (
              <Banner
                tone={readiness.offline ? "error" : "warning"}
                message={readiness.message}
                actionLabel={readiness.offline ? "Try again" : undefined}
                onAction={readiness.offline ? readiness.refresh : undefined}
              />
            ) : null}
            <RecorderPanel
              key={currentTurn.id}
              targetText={mode === "target" ? currentTurn.learnerReply : undefined}
              captureMode={mode}
              onTake={handleTake}
              disabled={!readiness.ready}
                  statusHint={
                mode === "freedom"
                  ? "Answer in your own words, then tap again to stop."
                  : "Read the line above out loud."
              }
            />
          </Card>
        ) : null}

        {replyError && !awaitingReply ? <Banner message={replyError} tone="error" /> : null}

        {answered && !pending && !ended ? (
          <>
            {turns.length >= SOFT_TURN_LIMIT ? (
              <Banner
                tone="info"
                message={`That's ${turns.length} turns. Long conversations start to repeat themselves — ending here and starting a fresh topic usually works better.`}
              />
            ) : null}
            <View style={styles.actionRow}>
              <PillButton
                label="Try again"
                variant="ghost"
                icon={<RotateCcw color={colors.hunter} size={16} />}
                onPress={retryReply}
                style={styles.actionButton}
              />
              <PillButton
                label="Next reply"
                icon={<ArrowRight color={colors.snow} size={16} />}
                onPress={() => {
                  setTurnError(null);
                  setPending("continue");
                }}
                style={styles.actionButton}
              />
            </View>
            <PillButton label="End session" variant="ghost" onPress={confirmEnd} />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingBottom: 0,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  topBarText: {
    flex: 1,
    gap: spacing.xs,
  },
  thread: {
    flex: 1,
  },
  threadContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  turnBlock: {
    gap: spacing.md,
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
  replyPanel: {
    borderRadius: radii.card,
    backgroundColor: colors.snow,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  summaryCard: {
    alignItems: "center",
    gap: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignSelf: "stretch",
  },
  chips: {
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
