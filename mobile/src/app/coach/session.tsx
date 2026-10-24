import { router, useLocalSearchParams } from "expo-router";
import { ArrowRight, RotateCcw } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View, type FlatList } from "react-native";
import { assess, coachTurn, transcribe, type RecordedAudio } from "@/api/endpoints";
import type { CoachHistoryEntry, CoachMode } from "@/api/types";
import { playAssessmentFeedback, playCompletionSound } from "@/audio/feedback";
import { logPractice, useSessionClock } from "@/learning/log";
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
  InfoPanel,
  LoadingBlock,
  ScreenList,
  TopBar,
} from "@/components/ui";
import { useAuth } from "@/context/auth";
import { useAssessReadiness } from "@/hooks/useEngineReadiness";
import { describeError } from "@/hooks/useServerStatus";
import { speechStateFor, useSpeech } from "@/hooks/useSpeech";
import { haptics } from "@/lib/haptics";
import {
  readCoachSessions,
  saveCoachSession,
  type CoachSessionTurn,
  type SavedCoachSession,
} from "@/lib/coach-storage";
import { averageScore, normalizeScore, scoreStatus } from "@/practice/scoring";
import { colors, spacing, type, themed } from "@/theme/theme";

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
  const elapsed = useSessionClock();
  const params = useLocalSearchParams<{ topic: string; mode: CoachMode; sessionId?: string }>();
  const topic = params.topic ?? "Everyday conversation";
  const mode: CoachMode = params.mode === "freedom" ? "freedom" : "target";

  const { user } = useAuth();
  const userId = user?.uid ?? "anonymous";
  const readiness = useAssessReadiness();
  const speech = useSpeech();
  const { speak, stop } = speech;

  const [turns, setTurns] = useState<CoachSessionTurn[]>([]);
  // Non-null means a coach turn is being fetched. Set from event handlers and
  // from the restore effect's callbacks — never synchronously inside an effect.
  const [pending, setPending] = useState<"start" | "continue" | null>(
    params.sessionId ? null : "start",
  );
  const [restoring, setRestoring] = useState(Boolean(params.sessionId));
  const [turnError, setTurnError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  const listRef = useRef<FlatList<CoachSessionTurn>>(null);
  const sessionIdRef = useRef<string | null>(params.sessionId ?? null);
  const createdAtRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);
  // The turns as of the last commit, for the fetch effect to build history from.
  const turnsRef = useRef<CoachSessionTurn[]>([]);
  // Set when something the learner did adds to the thread; the next layout
  // then follows it to the bottom. Reading older turns is never interrupted.
  const followRef = useRef(false);

  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

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
          followRef.current = true;
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
    const basis = action === "start" ? [] : turnsRef.current;

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
        followRef.current = true;
        setTurns(nextTurns);
        persist(nextTurns);
        void speak(response.turn.coachMessage);
      })
      .catch((cause) => {
        if (cancelled) return;
        setTurnError(describeError(cause, "The coach did not answer. Check your connection and try again."));
      })
      .finally(() => {
        inFlightRef.current = false;
        if (!cancelled) setPending(null);
      });

    return () => {
      cancelled = true;
      inFlightRef.current = false;
    };
  }, [pending, topic, mode, persist, speak]);

  const currentTurn = turns[turns.length - 1];
  const answered = Boolean(currentTurn?.assessment || currentTurn?.freeTranscript);
  const awaitingReply = Boolean(currentTurn) && !answered && !pending && !ended;

  async function handleTake(take: RecordedAudio) {
    if (!currentTurn) return;
    try {
      let updatedTurn: CoachSessionTurn;
      if (mode === "target") {
        const result = await assess(take, currentTurn.learnerReply);
        playAssessmentFeedback(result.overallScore);
        updatedTurn = { ...currentTurn, assessment: result };
      } else {
        const { transcript } = await transcribe(take);
        if (!transcript.trim()) {
          throw new Error("Nothing came through on that one. Move somewhere quieter and try again.");
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
      followRef.current = true;
      setTurns(nextTurns);
      persist(nextTurns);
    } catch (cause) {
      // Shown once, in the recorder's status line.
      throw new Error(describeError(cause, "That reply could not be scored. Try again."));
    }
  }

  function retryReply() {
    if (!currentTurn) return;
    const nextTurns = [...turns.slice(0, -1), { ...currentTurn, assessment: null, freeTranscript: null }];
    setTurns(nextTurns);
    persist(nextTurns);
  }

  function nextReply() {
    setTurnError(null);
    followRef.current = true;
    setPending("continue");
  }

  function endSession() {
    stop();
    followRef.current = true;
    setEnded(true);
    if (scored.length > 0) logPractice({ kind: "coach", refId: "coach.session", level: null, score: null, minutes: elapsed() });
    if (scored.length > 0) {
      playCompletionSound();
      haptics.success();
    }
  }

  const footer = (
    <View style={styles.footer}>
      {pending ? (
        <InfoPanel tone="white">
          <Body size={type.footnote} tone="muted" style={styles.centerText}>
            {pending === "start" ? "The coach is opening the conversation…" : "The coach is thinking…"}
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
        <ResultSummary
          eyebrow="Session complete"
          score={averageScore(scored)}
          title={scored.length > 0 ? "Nice run" : "Session saved"}
          subtitle="Saved on this phone. Pick it up again from the Coach tab."
          stats={[
            { label: "Turns", value: String(turns.length) },
            { label: "Scored", value: String(scored.length) },
            { label: "Average", value: scored.length ? String(averageScore(scored)) : "—" },
          ]}
          items={turns.flatMap((turn, index) =>
            turn.assessment
              ? [
                  {
                    label: `Turn ${index + 1} · ${normalizeScore(turn.assessment.overallScore)}`,
                    status: scoreStatus(turn.assessment.overallScore),
                  },
                ]
              : [],
          )}>
          <Button label="Done" onPress={() => router.back()} />
        </ResultSummary>
      ) : null}

      {awaitingReply && currentTurn ? (
        <Card>
          <ReadinessBanner readiness={readiness} />
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

      {answered && !pending && !ended ? (
        <>
          {turns.length >= SOFT_TURN_LIMIT ? (
            <Banner
              tone="info"
              message={`That's ${turns.length} turns. Long conversations start to repeat, so a fresh topic usually works better.`}
            />
          ) : null}
          <ActionRow>
            <Button
              label="Try again"
              variant="tonal"
              icon={<RotateCcw color={colors.hunter} size={16} />}
              onPress={retryReply}
            />
            <Button
              label="Next reply"
              icon={<ArrowRight color={colors.snow} size={16} />}
              onPress={nextReply}
            />
          </ActionRow>
          <Button label="End session" variant="neutral" onPress={endSession} />
        </>
      ) : null}
    </View>
  );

  return (
    <ScreenList
      listRef={listRef}
      fixedHeader={
        <TopBar
          onClose={() => {
            stop();
            router.back();
          }}
          closeLabel="Close the coach session"
          eyebrow={mode === "target" ? "Repeat mode" : "Free mode"}
          title={topic}
        />
      }
      data={turns}
      keyExtractor={(turn) => turn.id}
      extraData={[speech.activeText, speech.isPlaying, turns.length, mode]}
      ListHeaderComponent={
        restoring ? <LoadingBlock rows={2} label="Picking up where you left off…" /> : null
      }
      ListFooterComponent={footer}
      // A learner dragging back to read an older turn is never pulled away from it.
      onScrollBeginDrag={() => {
        followRef.current = false;
      }}
      onContentSizeChange={() => {
        if (!followRef.current) return;
        followRef.current = false;
        listRef.current?.scrollToEnd({ animated: true });
      }}
      renderItem={({ item: turn, index }) => (
        <View style={styles.turnBlock}>
          <CoachBubble
            message={turn.coachMessage}
            state={speechStateFor(speech, turn.coachMessage)}
            onToggle={() => speech.toggle(turn.coachMessage)}
          />

          {mode === "target" && turn.learnerReply && !turn.assessment ? (
            <ReplyPanel label="Say this">
              <Body weight="semibold" size={type.headline} tone="strong">
                {turn.learnerReply}
              </Body>
            </ReplyPanel>
          ) : null}

          {turn.freeTranscript ? (
            <ReplyPanel label="You said">
              <Body size={type.body}>&ldquo;{turn.freeTranscript}&rdquo;</Body>
            </ReplyPanel>
          ) : null}

          {turn.assessment ? (
            <Card>
              <AssessmentView assessment={turn.assessment} compact={index < turns.length - 1} />
            </Card>
          ) : null}
        </View>
      )}
    />
  );
}

const styles = themed(() =>
  StyleSheet.create({
    turnBlock: {
      gap: spacing.md,
    },
    footer: {
      gap: spacing.lg,
    },
    centerText: {
      textAlign: "center",
    },
  }),
);
