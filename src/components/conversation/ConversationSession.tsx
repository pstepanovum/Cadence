// FILE: src/components/conversation/ConversationSession.tsx
"use client";

import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PronunciationAssessment, PronunciationHighlight } from "@/lib/pronunciation";
import type { ConversationModule } from "@/lib/conversation";
import { ConversationResult } from "@/components/conversation/ConversationResult";
import { ConversationModuleHeader } from "@/components/conversation/ConversationModuleHeader";
import { ConversationFlowCard } from "@/components/conversation/ConversationFlowCard";
import { ConversationSidePanel } from "@/components/conversation/ConversationSidePanel";
import { Card } from "@/components/ui/card";
import { useCoachVoice } from "@/hooks/useCoachVoice";

export type Phase = "intro" | "coach" | "recording" | "assessing" | "result" | "done";
export type CoachAudioState = "idle" | "loading" | "playing" | "ready" | "error";

export interface TurnResponse {
  turnId: string;
  transcript: string;
  targetText: string;
  highlights: PronunciationHighlight[];
  score: number;
  audioUrl: string | null;
}

interface ConversationSessionProps {
  module: ConversationModule;
  nextModuleSlug: string | null;
}

export function ConversationSession({
  module,
  nextModuleSlug,
}: ConversationSessionProps) {
  const router = useRouter();
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
        const response = await fetch("/api/assess", { method: "GET", cache: "no-store" });
        const payload = (await response.json()) as { ready?: boolean };
        if (!cancelled) setEngineReady(payload.ready === true);
      } catch {
        if (!cancelled) setEngineReady(false);
      }
    }

    void checkEngine();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (engineReady) return;

    const timeout = window.setTimeout(() => {
      fetch("/api/assess", { method: "GET", cache: "no-store" })
        .then((response) => response.json())
        .then((payload: { ready?: boolean }) => setEngineReady(payload.ready === true))
        .catch(() => {});
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [engineReady]);

  const visibleTurns = useMemo(() => {
    if (!hasStarted) return [];
    return module.turns.slice(0, Math.min(turnIndex + 1, module.turns.length));
  }, [hasStarted, module.turns, turnIndex]);

  function stopCoachAudio() {
    const currentAudio = coachAudioRef.current;
    if (!currentAudio) return;
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    coachAudioRef.current = null;
    setActiveCoachTurnId(null);
  }

  function stopReplyAudio() {
    const currentAudio = replyAudioRef.current;
    if (!currentAudio) return;
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
    if (!url) return;
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

  // Flush coach audio cache when voice settings change.
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
    if (cached) return cached;

    const params = new URLSearchParams({ text: coachMessage, instruct });
    const response = await fetch(`/api/reference-audio?${params.toString()}`, { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
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
        if (unlockOnEnd) setPhase("recording");
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
    if (!audioUrl) return;

    if (activeReplyTurnId === turnId && replyAudioRef.current) {
      stopReplyAudio();
      return;
    }

    stopCoachAudio();
    stopReplyAudio();

    const audio = new Audio(audioUrl);
    replyAudioRef.current = audio;
    setActiveReplyTurnId(turnId);
    audio.onended = () => { replyAudioRef.current = null; setActiveReplyTurnId(null); };
    audio.onerror = () => { replyAudioRef.current = null; setActiveReplyTurnId(null); };
    await audio.play().catch(() => { replyAudioRef.current = null; setActiveReplyTurnId(null); });
  }

  const autoplayCoachMessage = useEffectEvent(async () => {
    await playCoachMessageForTurn(currentTurn, true);
  });

  useEffect(() => {
    if (phase !== "coach" || coachPlaybackRequest === 0) return;
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

      const response = await fetch("/api/assess", { method: "POST", body: formData });
      const payload = (await response.json()) as PronunciationAssessment | { error?: string };

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
    if (!assessment) return;

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
        body: JSON.stringify({ moduleSlug: module.slug, score: average, passed }),
      }).catch(() => {});

      startTransition(() => { router.refresh(); });
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
      <ConversationModuleHeader module={module} turnIndex={turnIndex} />

      <div className="grid gap-4 xl:grid-cols-[0.98fr_1.02fr]">
        <ConversationFlowCard
          phase={phase}
          engineReady={engineReady}
          coachAudioState={coachAudioState}
          coachAudioError={coachAudioError}
          visibleTurns={visibleTurns}
          responses={responses}
          turnIndex={turnIndex}
          moduleLength={module.turns.length}
          currentTurn={currentTurn}
          activeCoachTurnId={activeCoachTurnId}
          activeReplyTurnId={activeReplyTurnId}
          assessment={assessment}
          error={error}
          hasStarted={hasStarted}
          instruct={instruct}
          onStartConversation={handleStartConversation}
          onPlayCoachMessage={(turn, unlockOnEnd) => void playCoachMessageForTurn(turn, unlockOnEnd)}
          onContinueToReply={() => { setCoachAudioError(null); setPhase("recording"); }}
          onPlayReplyAudio={(turnId, audioUrl) => void playReplyAudio(turnId, audioUrl)}
          onRecordingComplete={(blob) => void runAssessment(blob)}
          onClearRecording={() => {
            clearPendingReplyAudio();
            stopReplyAudio();
            setAssessment(null);
            setError(null);
            if (phase === "result") setPhase("recording");
          }}
          onRetry={handleRetryTurn}
          onNext={() => void handleNextTurn()}
        />

        <ConversationSidePanel
          assessment={assessment}
          phase={phase}
          turnIndex={turnIndex}
          moduleLength={module.turns.length}
          onRetry={handleRetryTurn}
          onNext={() => void handleNextTurn()}
        />
      </div>
    </div>
  );
}
