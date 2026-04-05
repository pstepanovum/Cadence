// FILE: src/components/conversation/ConversationSession.tsx
"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { Pause, Play } from "griddy-icons";
import type {
  PronunciationAssessment,
  PronunciationHighlight,
} from "@/lib/pronunciation";
import type { ConversationModule } from "@/lib/conversation";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { ConversationResult } from "@/components/conversation/ConversationResult";
import { WordQueue } from "@/components/learn/WordQueue";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useCoachVoice } from "@/hooks/useCoachVoice";

interface ConversationSessionProps {
  module: ConversationModule;
  nextModuleSlug: string | null;
}

interface TurnResponse {
  turnId: string;
  transcript: string;
  targetText: string;
  highlights: PronunciationHighlight[];
  score: number;
  audioUrl: string | null;
}

type Phase = "intro" | "coach" | "recording" | "assessing" | "result" | "done";
type CoachAudioState = "idle" | "loading" | "playing" | "ready" | "error";

function getHighlightStyles(status: PronunciationHighlight["status"]) {
  if (status === "correct") {
    return "bg-yellow-green text-hunter-green";
  }

  if (status === "mixed") {
    return "bg-[#efd889] text-hunter-green";
  }

  return "bg-blushed-brick text-bright-snow";
}

function SentenceFeedback({
  highlights,
  className,
}: {
  highlights: PronunciationHighlight[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-2 gap-y-2", className)}>
      {highlights.map((highlight, index) => (
        <span
          key={`${highlight.text}-${highlight.status}-${index}`}
          className={cn(
            "cursor-help rounded-full px-3 py-1.5 text-sm font-semibold",
            getHighlightStyles(highlight.status),
          )}
          title={highlight.feedback}
        >
          {highlight.text}
        </span>
      ))}
    </div>
  );
}

function getEngineMessage(ready: boolean, phase: Phase, coachAudioError: string | null) {
  if (!ready) {
    return "The pronunciation engine is warming up. You can still listen to the coach while the model finishes loading.";
  }

  if (phase === "coach") {
    return coachAudioError
      ? "Coach voice is unavailable for this turn. You can replay the message or continue with the written prompt."
      : "The coach speaks first. Recording unlocks as soon as the first message finishes.";
  }

  if (phase === "recording") {
    return "Your turn is live. Record one clean reply, then let Cadence score the pronunciation before the next coach message.";
  }

  if (phase === "assessing") {
    return "Cadence is scoring your reply against the expected sentence and phoneme path.";
  }

  if (phase === "result") {
    return "Review the feedback, then move to the next turn when the score feels strong enough.";
  }

  return "Start the conversation to hear the first coach message and unlock the first spoken reply.";
}

export function ConversationSession({
  module,
  nextModuleSlug,
}: ConversationSessionProps) {
  const { instruct } = useCoachVoice();
  const [turnIndex, setTurnIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("intro");
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [responses, setResponses] = useState<TurnResponse[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [coachAudioState, setCoachAudioState] = useState<CoachAudioState>("idle");
  const [coachAudioError, setCoachAudioError] = useState<string | null>(null);
  const [coachPlaybackRequest, setCoachPlaybackRequest] = useState(0);
  const [activeCoachTurnId, setActiveCoachTurnId] = useState<string | null>(null);
  const [activeReplyTurnId, setActiveReplyTurnId] = useState<string | null>(null);
  const [pendingReplyAudioUrl, setPendingReplyAudioUrl] = useState<string | null>(null);
  const coachAudioRef = useRef<HTMLAudioElement | null>(null);
  const coachAudioCacheRef = useRef<Map<string, string>>(new Map());
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyAudioUrlsRef = useRef<Set<string>>(new Set());

  const currentTurn = module.turns[Math.min(turnIndex, module.turns.length - 1)];
  const hasStarted = phase !== "intro" && phase !== "done";

  useEffect(() => {
    const coachAudioCache = coachAudioCacheRef.current;
    const replyAudioUrls = replyAudioUrlsRef.current;

    return () => {
      coachAudioRef.current?.pause();
      coachAudioRef.current = null;
      replyAudioRef.current?.pause();
      replyAudioRef.current = null;
      for (const url of coachAudioCache.values()) {
        URL.revokeObjectURL(url);
      }
      coachAudioCache.clear();
      for (const url of replyAudioUrls.values()) {
        URL.revokeObjectURL(url);
      }
      replyAudioUrls.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function checkEngine() {
      try {
        const response = await fetch("/api/assess", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as { ready?: boolean };
        if (!cancelled) {
          setEngineReady(payload.ready === true);
        }
      } catch {
        if (!cancelled) {
          setEngineReady(false);
        }
      }
    }

    void checkEngine();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (engineReady) {
      return;
    }

    const timeout = window.setTimeout(() => {
      fetch("/api/assess", { method: "GET", cache: "no-store" })
        .then((response) => response.json())
        .then((payload: { ready?: boolean }) => setEngineReady(payload.ready === true))
        .catch(() => {});
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [engineReady]);

  const visibleTurns = useMemo(() => {
    if (!hasStarted) {
      return [];
    }

    return module.turns.slice(0, Math.min(turnIndex + 1, module.turns.length));
  }, [hasStarted, module.turns, turnIndex]);

  function stopCoachAudio() {
    const currentAudio = coachAudioRef.current;
    if (!currentAudio) {
      return;
    }

    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    coachAudioRef.current = null;
    setActiveCoachTurnId(null);
  }

  function stopReplyAudio() {
    const currentAudio = replyAudioRef.current;
    if (!currentAudio) {
      return;
    }

    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    replyAudioRef.current = null;
    setActiveReplyTurnId(null);
  }

  function registerReplyAudioUrl(url: string) {
    replyAudioUrlsRef.current.add(url);
  }

  function revokeReplyAudioUrl(url: string | null) {
    if (!url) {
      return;
    }
    if (replyAudioUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      replyAudioUrlsRef.current.delete(url);
    }
  }

  function clearPendingReplyAudio() {
    if (pendingReplyAudioUrl) {
      revokeReplyAudioUrl(pendingReplyAudioUrl);
      setPendingReplyAudioUrl(null);
    }
  }

  // Flush coach audio cache when voice settings change so the next play uses the new voice.
  useEffect(() => {
    coachAudioRef.current?.pause();
    coachAudioRef.current = null;
    for (const url of coachAudioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    coachAudioCacheRef.current.clear();
  }, [instruct]);

  async function getCoachAudioUrl(turnId: string, coachMessage: string) {
    const cacheKey = `${instruct}:${turnId}`;
    const cached = coachAudioCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({ text: coachMessage, instruct });
    const response = await fetch(
      `/api/reference-audio?${params.toString()}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? "Coach audio is unavailable for this turn.");
    }

    const blob = await response.blob();
    const nextUrl = URL.createObjectURL(blob);
    coachAudioCacheRef.current.set(cacheKey, nextUrl);
    return nextUrl;
  }

  async function playCoachMessageForTurn(
    turn: ConversationModule["turns"][number],
    unlockOnEnd: boolean,
  ) {
    if (activeCoachTurnId === turn.id && coachAudioRef.current) {
      stopCoachAudio();
      return;
    }

    stopReplyAudio();
    stopCoachAudio();
    setCoachAudioError(null);
    setCoachAudioState("loading");

    try {
      const url = await getCoachAudioUrl(turn.id, turn.coachMessage);
      const audio = new Audio(url);
      coachAudioRef.current = audio;
      setActiveCoachTurnId(turn.id);

      audio.onended = () => {
        setCoachAudioState("ready");
        coachAudioRef.current = null;
        setActiveCoachTurnId(null);
        if (unlockOnEnd) {
          setPhase("recording");
        }
      };

      audio.onerror = () => {
        setCoachAudioState("error");
        setCoachAudioError("Coach audio could not be played for this turn.");
        coachAudioRef.current = null;
        setActiveCoachTurnId(null);
      };

      setCoachAudioState("playing");

      try {
        await audio.play();
      } catch {
        setCoachAudioState("ready");
        setCoachAudioError("Press play to hear the coach before you reply.");
      }
    } catch (nextError) {
      setCoachAudioState("error");
      setCoachAudioError(
        nextError instanceof Error
          ? nextError.message
          : "Coach audio is unavailable for this turn.",
      );
      setActiveCoachTurnId(null);
    }
  }

  async function playReplyAudio(turnId: string, audioUrl: string | null) {
    if (!audioUrl) {
      return;
    }

    if (activeReplyTurnId === turnId && replyAudioRef.current) {
      stopReplyAudio();
      return;
    }

    stopCoachAudio();
    stopReplyAudio();

    const audio = new Audio(audioUrl);
    replyAudioRef.current = audio;
    setActiveReplyTurnId(turnId);
    audio.onended = () => {
      replyAudioRef.current = null;
      setActiveReplyTurnId(null);
    };
    audio.onerror = () => {
      replyAudioRef.current = null;
      setActiveReplyTurnId(null);
    };
    await audio.play().catch(() => {
      replyAudioRef.current = null;
      setActiveReplyTurnId(null);
    });
  }

  const autoplayCoachMessage = useEffectEvent(async () => {
    await playCoachMessageForTurn(currentTurn, true);
  });

  useEffect(() => {
    if (phase !== "coach" || coachPlaybackRequest === 0) {
      return;
    }

    void autoplayCoachMessage();
  }, [coachPlaybackRequest, phase, turnIndex]);

  function queueCoachTurn(nextTurnIndex: number) {
    stopReplyAudio();
    stopCoachAudio();
    setTurnIndex(nextTurnIndex);
    setAssessment(null);
    setError(null);
    setCoachAudioError(null);
    setCoachAudioState("idle");
    setPhase("coach");
    setCoachPlaybackRequest((value) => value + 1);
  }

  function handleStartConversation() {
    setResponses([]);
    setScores([]);
    setFinalScore(0);
    queueCoachTurn(0);
  }

  async function runAssessment(blob: Blob) {
    setPhase("assessing");
    setError(null);

    try {
      clearPendingReplyAudio();
      const nextReplyAudioUrl = URL.createObjectURL(blob);
      registerReplyAudioUrl(nextReplyAudioUrl);
      setPendingReplyAudioUrl(nextReplyAudioUrl);

      const formData = new FormData();
      formData.set("audio", blob, `${currentTurn.id}.wav`);
      formData.set("text", currentTurn.expectedResponse);

      const response = await fetch("/api/assess", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as
        | PronunciationAssessment
        | { error?: string };

      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload ? payload.error : "Assessment failed.");
      }

      setAssessment(payload as PronunciationAssessment);
      setPhase("result");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Assessment failed.");
      setPhase("recording");
    }
  }

  function handleRetryTurn() {
    clearPendingReplyAudio();
    stopReplyAudio();
    setAssessment(null);
    setError(null);
    queueCoachTurn(turnIndex);
  }

  async function handleNextTurn() {
    if (!assessment) {
      return;
    }

    const nextScores = [...scores, assessment.overallScore];
      const nextResponses = [
      ...responses,
      {
        turnId: currentTurn.id,
        transcript: assessment.transcript,
        targetText: assessment.targetText,
        highlights: assessment.highlights,
        score: assessment.overallScore,
        audioUrl: pendingReplyAudioUrl,
      },
    ];

    setScores(nextScores);
    setResponses(nextResponses);
    setPendingReplyAudioUrl(null);
    setAssessment(null);
    setError(null);

    if (turnIndex + 1 >= module.turns.length) {
      const average = Math.round(
        nextScores.reduce((sum, score) => sum + score, 0) / nextScores.length,
      );
      const passed = average >= module.passScore;
      setFinalScore(average);
      stopCoachAudio();

      await fetch("/api/conversation-progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          moduleSlug: module.slug,
          score: average,
          passed,
        }),
      }).catch(() => {});

      setPhase("done");
      return;
    }

    queueCoachTurn(turnIndex + 1);
  }

  function handleRetryModule() {
    clearPendingReplyAudio();
    stopCoachAudio();
    stopReplyAudio();
    setTurnIndex(0);
    setPhase("intro");
    setAssessment(null);
    setResponses([]);
    setScores([]);
    setError(null);
    setFinalScore(0);
    setCoachAudioError(null);
    setCoachAudioState("idle");
  }

  if (phase === "done") {
    return (
      <Card className="bg-white">
        <ConversationResult
          module={module}
          score={finalScore}
          nextModuleSlug={nextModuleSlug}
          onRetry={handleRetryModule}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="bg-hunter-green text-bright-snow">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-yellow-green/82">Conversation module</p>
              <h1 className="text-4xl font-semibold text-bright-snow sm:text-5xl">
                {module.title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-bright-snow/78">
                {module.scenario}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Level</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {module.level}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Pass mark</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {module.passScore}
                </p>
              </div>
              <div className="rounded-3xl bg-white/10 px-4 py-4">
                <p className="eyebrow text-xs text-yellow-green/82">Turns</p>
                <p className="mt-2 text-2xl font-semibold text-bright-snow">
                  {module.turns.length}
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Progress</p>
              <WordQueue total={module.turns.length} current={turnIndex} />
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Track definition</p>
              <p className="mt-2 text-sm leading-6 text-iron-grey">
                Sound modules isolate individual phonemes. Conversation modules
                check whether you can keep that accuracy inside a realistic spoken
                response.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {module.focus.map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-vanilla-cream px-3 py-1 text-xs font-semibold text-hunter-green"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Conversation flow</p>
              <CardTitle className="text-2xl">
                A real back-and-forth, one spoken reply at a time.
              </CardTitle>
              <CardDescription>
                The coach opens the turn, you answer clearly, and Cadence scores
                the reply before the next message starts.
              </CardDescription>
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <p className="eyebrow text-xs text-sage-green">Turn status</p>
                  <p className="text-lg font-semibold text-hunter-green">
                    {phase === "intro"
                      ? "Start the chat."
                      : phase === "coach"
                        ? "Coach turn in progress."
                        : phase === "recording"
                          ? "Your reply is live."
                          : phase === "assessing"
                            ? "Scoring your reply."
                            : "Feedback is ready."}
                  </p>
                  <p className="max-w-2xl text-sm leading-6 text-iron-grey">
                    {getEngineMessage(engineReady, phase, coachAudioError)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {phase === "intro" ? (
                    <Button
                      variant="primary"
                      className="text-white"
                      onClick={handleStartConversation}
                    >
                      Start conversation
                    </Button>
                  ) : (
                    <Button
                      variant={phase === "coach" ? "primary" : "ghost"}
                      className={phase === "coach" ? "text-white" : undefined}
                      onClick={() =>
                        void playCoachMessageForTurn(currentTurn, phase === "coach")
                      }
                    >
                      {activeCoachTurnId === currentTurn.id ? (
                        <Pause size={16} filled color="currentColor" />
                      ) : (
                        <Play size={16} filled color="currentColor" />
                      )}
                      {coachAudioState === "loading" || coachAudioState === "playing"
                        ? "Playing coach..."
                        : activeCoachTurnId === currentTurn.id
                          ? "Pause coach"
                          : phase === "coach"
                          ? "Play coach message"
                          : "Replay coach message"}
                    </Button>
                  )}

                  {phase === "coach" && coachAudioError ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setCoachAudioError(null);
                        setPhase("recording");
                      }}
                    >
                      Continue to my reply
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {visibleTurns.length === 0 ? (
                <div className="rounded-[1.75rem] bg-bright-snow px-4 py-5 text-center">
                  <p className="eyebrow text-xs text-sage-green">Ready state</p>
                  <p className="mt-2 text-lg font-semibold text-hunter-green">
                    Click start to hear the first coach line.
                  </p>
                </div>
              ) : (
                visibleTurns.map((turn, index) => {
                  const response = responses[index];
                  const isCurrent = index === turnIndex;

                  return (
                    <div key={turn.id} className="space-y-3">
                      <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-[1.75rem] bg-vanilla-cream px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="eyebrow text-xs text-sage-green">Coach</p>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-3 py-2 text-xs"
                              onClick={() => void playCoachMessageForTurn(turn, false)}
                            >
                              {activeCoachTurnId === turn.id ? (
                                <Pause size={14} filled color="currentColor" />
                              ) : (
                                <Play size={14} filled color="currentColor" />
                              )}
                              {activeCoachTurnId === turn.id ? "Pause" : "Play"}
                            </Button>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-hunter-green">
                            {turn.coachMessage}
                          </p>
                          {isCurrent ? (
                            <p className="mt-2 text-xs font-semibold text-sage-green">
                              {phase === "coach"
                                ? coachAudioState === "playing"
                                  ? "Speaking now"
                                  : "Current coach message"
                                : "Coach message complete"}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <div
                          className={cn(
                            "max-w-[85%] rounded-[1.75rem] px-4 py-4",
                            response
                              ? "bg-hunter-green text-bright-snow"
                              : "bg-bright-snow text-hunter-green",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p
                              className={cn(
                                "eyebrow text-xs",
                                response ? "text-yellow-green/84" : "text-sage-green",
                              )}
                            >
                              You
                            </p>
                            {response?.audioUrl ? (
                              <Button
                                variant="ghost"
                                className="min-h-8 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15 hover:text-white"
                                onClick={() => void playReplyAudio(response.turnId, response.audioUrl)}
                              >
                                {activeReplyTurnId === response.turnId ? (
                                  <Pause size={14} filled color="currentColor" />
                                ) : (
                                  <Play size={14} filled color="currentColor" />
                                )}
                                {activeReplyTurnId === response.turnId ? "Pause" : "Play"}
                              </Button>
                            ) : null}
                          </div>
                          {response ? (
                            <div className="mt-2 space-y-2">
                              <p className="text-xs font-semibold text-yellow-green/84">
                                Your scored reply
                              </p>
                              <SentenceFeedback
                                highlights={response.highlights}
                                className="text-left"
                              />
                            </div>
                          ) : (
                            <p className="mt-2 text-sm font-semibold leading-6">
                              {turn.expectedResponse}
                            </p>
                          )}
                          {response ? (
                            <p className="mt-3 text-xs font-semibold text-yellow-green">
                              Score {response.score}/100
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {hasStarted ? (
              <AudioRecorder
                key={currentTurn.id}
                targetWord={currentTurn.expectedResponse}
                instruct={instruct}
                disabled={!engineReady || phase !== "recording"}
                onRecordingComplete={(blob) => void runAssessment(blob)}
                onClear={() => {
                  clearPendingReplyAudio();
                  stopReplyAudio();
                  setAssessment(null);
                  setError(null);
                  if (phase === "result") {
                    setPhase("recording");
                  }
                }}
              />
            ) : null}

            {assessment ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button variant="ghost" onClick={handleRetryTurn} className="flex-1">
                  Try Again
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleNextTurn()}
                  className="flex-1 text-white"
                >
                  {turnIndex + 1 >= module.turns.length
                    ? "Finish Module"
                    : "Next Reply"}
                </Button>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-4 text-sm leading-6 text-bright-snow">
                {error}
              </div>
            ) : null}

            {coachAudioError && phase !== "coach" ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-4 text-sm leading-6 text-bright-snow">
                {coachAudioError}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="self-start bg-white xl:sticky xl:top-6">
          {assessment ? (
            <AssessmentResult
              assessment={assessment}
              onRetry={handleRetryTurn}
              onNext={() => void handleNextTurn()}
              showActions={false}
              nextLabel={
                turnIndex + 1 >= module.turns.length
                  ? "Finish Module"
                  : "Next Reply"
              }
            />
          ) : (
            <div className="flex h-full min-h-[30rem] flex-col justify-center rounded-[2rem] bg-vanilla-cream px-5 py-5 text-center sm:px-6 sm:py-6">
              <CardTitle className="text-3xl">
                {phase === "intro"
                  ? "Conversation feedback appears here."
                  : phase === "coach"
                    ? "Coach turn is active."
                    : phase === "recording"
                      ? "Your reply is next."
                      : "Scoring in progress."}
              </CardTitle>
              <CardDescription className="mt-3">
                {phase === "intro"
                  ? "Start the module to hear the first coach line, then answer one turn at a time."
                  : phase === "coach"
                    ? "Listen to the coach message first. Once that turn finishes, the recorder unlocks automatically."
                    : phase === "recording"
                      ? "Record one clear answer. Cadence will score the sentence before the next coach message."
                      : "Cadence is comparing your live phoneme decode against the target sentence now."}
              </CardDescription>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
