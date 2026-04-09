// FILE: src/components/coach/AiCoachPlayground.tsx
"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { CoachOverviewCard } from "@/components/coach/CoachOverviewCard";
import { CoachSetupCard } from "@/components/coach/CoachSetupCard";
import { CoachSidePanel } from "@/components/coach/CoachSidePanel";
import { CoachThread } from "@/components/coach/CoachThread";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import type {
  AiCoachGeneratedTurn,
  AiCoachHistoryEntry,
  AiCoachPhase,
  AiCoachReplyMode,
  AiCoachRequestPayload,
  AiCoachStatusPayload,
  AiCoachTranscriptPayload,
  AiCoachTurn,
  SavedAiCoachSession,
} from "@/lib/ai-coach";
import {
  readSavedAiCoachSessions,
  writeSavedAiCoachSessions,
} from "@/lib/ai-coach-storage";
import type { PronunciationAssessment } from "@/lib/pronunciation";
import { cn } from "@/lib/utils";

interface EngineStatusPayload {
  ready?: boolean;
  transcriberReady?: boolean;
  transcriberLoadError?: string | null;
}

const MAX_SAVED_SESSIONS = 12;

function buildHistory(turns: AiCoachTurn[]): AiCoachHistoryEntry[] {
  return turns.flatMap((turn) => {
    const entries: AiCoachHistoryEntry[] = [
      { role: "coach", content: turn.coachMessage },
    ];

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

function createTurn(turn: AiCoachGeneratedTurn): AiCoachTurn {
  return {
    id: crypto.randomUUID(),
    coachMessage: turn.coachMessage,
    learnerReply: turn.learnerReply,
    assessment: null,
    freeTranscript: null,
    replyAudioUrl: null,
  };
}

export function AiCoachPlayground({
  userId,
  showOverviewCard = true,
}: {
  userId: string;
  showOverviewCard?: boolean;
}) {
  const searchParams = useSearchParams();
  const { instruct } = useCoachVoice();
  const [topicDraft, setTopicDraft] = useState("");
  const [sessionTopic, setSessionTopic] = useState("");
  const [turns, setTurns] = useState<AiCoachTurn[]>([]);
  const [replyMode, setReplyMode] = useState<AiCoachReplyMode>("target");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<SavedAiCoachSession[]>([]);
  const [phase, setPhase] = useState<AiCoachPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [transcriptionReady, setTranscriptionReady] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(null);
  const [coachStatus, setCoachStatus] = useState<AiCoachStatusPayload | null>(null);
  const [recorderVersion, setRecorderVersion] = useState(0);
  const [activeCoachTurnId, setActiveCoachTurnId] = useState<string | null>(null);
  const [activeReplyTurnId, setActiveReplyTurnId] = useState<string | null>(null);
  const [coachAudioError, setCoachAudioError] = useState<string | null>(null);
  const [isLoadingCoachAudio, setIsLoadingCoachAudio] = useState(false);
  const coachAudioRef = useRef<HTMLAudioElement | null>(null);
  const coachAudioCacheRef = useRef<Map<string, string>>(new Map());
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyAudioUrlsRef = useRef<Set<string>>(new Set());
  const resumedSessionIdRef = useRef<string | null>(null);
  const resultPanelRef = useRef<HTMLDivElement | null>(null);
  const coachRequestInFlightRef = useRef(false);

  const currentTurn = turns.at(-1) ?? null;
  const latestAssessment = currentTurn?.assessment ?? null;
  const latestFreeTranscript = currentTurn?.freeTranscript ?? null;
  const trimmedTopicDraft = topicDraft.trim();
  const resumeSessionId = searchParams.get("resume");

  const completedTurns = useMemo(
    () => turns.filter((turn) => turn.assessment),
    [turns],
  );
  const averageScore = useMemo(() => {
    if (completedTurns.length === 0) return 0;
    return Math.round(
      completedTurns.reduce((sum, turn) => sum + (turn.assessment?.overallScore ?? 0), 0) /
        completedTurns.length,
    );
  }, [completedTurns]);

  const isCoachBusy = phase === "starting" || phase === "continuing";
  const hasStartedSession = turns.length > 0;
  const startDisabled = !trimmedTopicDraft || !coachStatus?.ready || isCoachBusy;
  const startHelperMessage = !trimmedTopicDraft
    ? "Add a topic to unlock the coach."
    : !coachStatus?.ready
      ? (coachStatus?.message ?? "AI Coach is warming up right now.")
      : phase === "starting"
        ? "Coach is opening the first turn."
        : null;
  const canContinue =
    Boolean(latestAssessment || latestFreeTranscript) &&
    phase !== "continuing" &&
    phase !== "assessing";

  // ── Effects ──────────────────────────────────────────────────────────────

  useEffect(() => {
    console.log(
      `[coach] phase=${phase} canContinue=${canContinue} turns=${turns.length}`,
    );
  }, [phase, canContinue, turns.length]);

  useEffect(() => {
    setSavedSessions(readSavedAiCoachSessions(userId));
  }, [userId]);

  useEffect(() => {
    if (!activeSessionId || !sessionTopic || turns.length === 0 || typeof window === "undefined") {
      return;
    }

    setSavedSessions((previous) => {
      const nextSession: SavedAiCoachSession = {
        id: activeSessionId,
        topic: sessionTopic,
        replyMode,
        createdAt:
          previous.find((s) => s.id === activeSessionId)?.createdAt ??
          new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: turns.map((turn) => ({ ...turn, replyAudioUrl: null })),
      };

      const nextSessions = [
        nextSession,
        ...previous.filter((s) => s.id !== activeSessionId),
      ].slice(0, MAX_SAVED_SESSIONS);

      writeSavedAiCoachSessions(userId, nextSessions);
      return nextSessions;
    });
  }, [activeSessionId, sessionTopic, turns, replyMode, userId]);

  // Cleanup audio on unmount
  useEffect(() => {
    const coachAudioCache = coachAudioCacheRef.current;
    const replyAudioUrls = replyAudioUrlsRef.current;

    return () => {
      coachAudioRef.current?.pause();
      coachAudioRef.current = null;
      replyAudioRef.current?.pause();
      replyAudioRef.current = null;
      for (const url of coachAudioCache.values()) URL.revokeObjectURL(url);
      coachAudioCache.clear();
      for (const url of replyAudioUrls.values()) URL.revokeObjectURL(url);
      replyAudioUrls.clear();
    };
  }, []);

  // Flush coach audio cache on voice change
  useEffect(() => {
    coachAudioRef.current?.pause();
    coachAudioRef.current = null;
    setActiveCoachTurnId(null);
    for (const url of coachAudioCacheRef.current.values()) URL.revokeObjectURL(url);
    coachAudioCacheRef.current.clear();
  }, [instruct]);

  // Scroll result panel into view when assessment arrives
  useEffect(() => {
    if ((!latestAssessment && !latestFreeTranscript) || phase !== "result") return;

    const frame = window.requestAnimationFrame(() => {
      const element = resultPanelRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const bottomGap = rect.bottom - window.innerHeight;
      if (bottomGap > 16) {
        window.scrollBy({ top: bottomGap + 24, behavior: "smooth" });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [latestAssessment, latestFreeTranscript, phase]);

  // Initial engine + coach status load
  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const [engineResponse, coachResponse] = await Promise.all([
          fetch("/api/assess", { method: "GET", cache: "no-store" }),
          fetch("/api/ai-coach", { method: "GET", cache: "no-store" }),
        ]);

        const enginePayload = (await engineResponse.json().catch(() => null)) as EngineStatusPayload | null;
        const coachPayload = (await coachResponse.json().catch(() => null)) as AiCoachStatusPayload | null;

        if (cancelled) return;

        setEngineReady(enginePayload?.ready === true);
        setTranscriptionReady(enginePayload?.transcriberReady === true);
        setTranscriptionError(enginePayload?.transcriberLoadError ?? null);
        setCoachStatus(coachPayload ?? { ready: false, message: "AI Coach is unavailable right now." });
      } catch {
        if (cancelled) return;
        setEngineReady(false);
        setTranscriptionReady(false);
        setTranscriptionError("AI transcription is unavailable right now.");
        setCoachStatus({ ready: false, message: "AI Coach is unavailable right now." });
      }
    }

    void loadStatus();
    return () => { cancelled = true; };
  }, []);

  // Polling retry while services are warming up
  useEffect(() => {
    if (engineReady && transcriptionReady && coachStatus?.ready) return;

    const timeout = window.setTimeout(() => {
      Promise.all([
        fetch("/api/assess", { method: "GET", cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({ ready: false, transcriberReady: false })),
        fetch("/api/ai-coach", { method: "GET", cache: "no-store" })
          .then((r) => r.json())
          .catch(() => ({ ready: false, message: "AI Coach is unavailable right now." }) satisfies AiCoachStatusPayload),
      ]).then(([enginePayload, coachPayload]) => {
        const next = enginePayload as EngineStatusPayload | null;
        setEngineReady(Boolean(next?.ready));
        setTranscriptionReady(Boolean(next?.transcriberReady));
        setTranscriptionError(next?.transcriberLoadError ?? null);
        setCoachStatus(coachPayload as AiCoachStatusPayload);
      });
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [engineReady, transcriptionReady, coachStatus]);

  // Auto-play coach message when phase becomes "coach"
  const autoplayCurrentTurn = useEffectEvent((turn: AiCoachTurn) => {
    void playCoachMessage(turn, true);
  });

  useEffect(() => {
    if (phase !== "coach" || !currentTurn) return;
    autoplayCurrentTurn(currentTurn);
  }, [currentTurn, phase]);

  // Resume saved session from URL param
  const restoreSavedSession = useEffectEvent((session: SavedAiCoachSession) => {
    restoreSession(session);
  });

  useEffect(() => {
    if (!resumeSessionId || resumedSessionIdRef.current === resumeSessionId) return;
    const session = savedSessions.find((item) => item.id === resumeSessionId);
    if (!session) return;
    resumedSessionIdRef.current = resumeSessionId;
    restoreSavedSession(session);
  }, [resumeSessionId, savedSessions]);

  // ── Audio helpers ─────────────────────────────────────────────────────────

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

  function stopCoachAudio() {
    const audio = coachAudioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    coachAudioRef.current = null;
    setActiveCoachTurnId(null);
  }

  function stopReplyAudio() {
    const audio = replyAudioRef.current;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    replyAudioRef.current = null;
    setActiveReplyTurnId(null);
  }

  async function getCoachAudioUrl(turn: AiCoachTurn) {
    const cacheKey = `${instruct}:${turn.id}`;
    const cached = coachAudioCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({ text: turn.coachMessage, instruct });
    const response = await fetch(`/api/reference-audio?${params.toString()}`, { cache: "no-store" });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Coach audio is unavailable.");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    coachAudioCacheRef.current.set(cacheKey, url);
    return url;
  }

  async function playCoachMessage(turn: AiCoachTurn, unlockWhenDone = false) {
    stopCoachAudio();
    setCoachAudioError(null);
    setIsLoadingCoachAudio(true);

    try {
      const audioUrl = await getCoachAudioUrl(turn);
      const audio = new Audio(audioUrl);
      coachAudioRef.current = audio;
      setActiveCoachTurnId(turn.id);
      audio.onended = () => {
        coachAudioRef.current = null;
        setActiveCoachTurnId(null);
        if (unlockWhenDone) setPhase("recording");
      };
      audio.onerror = () => {
        coachAudioRef.current = null;
        setActiveCoachTurnId(null);
        setCoachAudioError("Coach audio could not be played for this turn.");
        if (unlockWhenDone) setPhase("recording");
      };
      await audio.play();
    } catch (nextError) {
      setActiveCoachTurnId(null);
      setCoachAudioError(
        nextError instanceof Error
          ? nextError.message
          : "Coach audio could not be played for this turn.",
      );
      if (unlockWhenDone) setPhase("recording");
    } finally {
      setIsLoadingCoachAudio(false);
    }
  }

  async function toggleCoachMessage(turn: AiCoachTurn) {
    if (activeCoachTurnId === turn.id && coachAudioRef.current) {
      stopCoachAudio();
      return;
    }
    await playCoachMessage(turn, false);
  }

  async function toggleReplyAudio(turn: AiCoachTurn) {
    if (!turn.replyAudioUrl) return;

    if (activeReplyTurnId === turn.id && replyAudioRef.current) {
      stopReplyAudio();
      return;
    }

    stopReplyAudio();
    const audio = new Audio(turn.replyAudioUrl);
    replyAudioRef.current = audio;
    setActiveReplyTurnId(turn.id);
    audio.onended = () => { replyAudioRef.current = null; setActiveReplyTurnId(null); };
    audio.onerror = () => { replyAudioRef.current = null; setActiveReplyTurnId(null); };
    await audio.play().catch(() => { replyAudioRef.current = null; setActiveReplyTurnId(null); });
  }

  // ── Session helpers ───────────────────────────────────────────────────────

  function resetCoachSession() {
    stopCoachAudio();
    stopReplyAudio();
    for (const url of coachAudioCacheRef.current.values()) URL.revokeObjectURL(url);
    coachAudioCacheRef.current.clear();
    for (const turn of turns) revokeReplyAudioUrl(turn.replyAudioUrl);
    setTurns([]);
    setSessionTopic("");
    setActiveSessionId(null);
    setPhase("idle");
    setRecorderVersion(0);
    setError(null);
    setCoachAudioError(null);
  }

  function restoreSession(session: SavedAiCoachSession) {
    stopCoachAudio();
    stopReplyAudio();
    setTopicDraft(session.topic);
    setSessionTopic(session.topic);
    setReplyMode(session.replyMode);
    setTurns(session.turns);
    setActiveSessionId(session.id);
    setError(null);
    setCoachAudioError(null);
    setRecorderVersion((v) => v + 1);

    const lastTurn = session.turns.at(-1) ?? null;
    if (!lastTurn) setPhase("idle");
    else if (lastTurn.assessment || lastTurn.freeTranscript) setPhase("result");
    else setPhase("recording");
  }

  // ── Main handlers ─────────────────────────────────────────────────────────

  async function requestCoachTurn(action: "start" | "continue") {
    if (coachRequestInFlightRef.current) return;

    const topic = (action === "start" ? topicDraft : sessionTopic).trim();
    const nextSessionId = action === "start" ? crypto.randomUUID() : activeSessionId;

    if (!topic) {
      setError("Add a topic before starting the coach.");
      return;
    }

    const payload: AiCoachRequestPayload = {
      action,
      topic,
      mode: replyMode,
      history: action === "start" ? [] : buildHistory(turns),
    };

    coachRequestInFlightRef.current = true;
    setError(null);
    setCoachAudioError(null);
    setPhase(action === "start" ? "starting" : "continuing");

    try {
      if (action === "start") resetCoachSession();

      const response = await fetch("/api/ai-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
        turn?: AiCoachGeneratedTurn;
      } | null;

      if (!response.ok || !data?.turn) {
        throw new Error(data?.error ?? "AI Coach could not generate the next turn.");
      }

      const nextTurn = createTurn(data.turn);
      setTurns((previous) =>
        action === "start" ? [nextTurn] : [...previous, nextTurn],
      );
      if (nextSessionId) setActiveSessionId(nextSessionId);
      setSessionTopic(topic);
      setPhase("coach");
      setRecorderVersion(0);
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "AI Coach could not generate the next turn.";
      setError(message);
      setPhase(turns.length > 0 ? "result" : "idle");
    } finally {
      coachRequestInFlightRef.current = false;
    }
  }

  async function handleRecordingComplete(blob: Blob) {
    if (!currentTurn) return;

    setPhase("assessing");
    setError(null);

    const replyAudioUrl = URL.createObjectURL(blob);
    registerReplyAudioUrl(replyAudioUrl);

    try {
      if (replyMode === "freedom") {
        const formData = new FormData();
        formData.set("audio", blob, `${currentTurn.id}.wav`);

        const response = await fetch("/api/transcribe", { method: "POST", body: formData });
        const payload = (await response.json().catch(() => null)) as
          | AiCoachTranscriptPayload
          | { error?: string }
          | null;

        if (!response.ok || !payload || "error" in payload) {
          throw new Error(
            payload && "error" in payload ? payload.error : "Reply transcription failed.",
          );
        }

        const nextTranscript = (payload as AiCoachTranscriptPayload).transcript;
        let freedomAssessment: PronunciationAssessment | null = null;

        if (nextTranscript.trim()) {
          const assessmentFormData = new FormData();
          assessmentFormData.set("audio", blob, `${currentTurn.id}.wav`);
          assessmentFormData.set("text", nextTranscript);

          const assessmentResponse = await fetch("/api/assess", {
            method: "POST",
            body: assessmentFormData,
          });
          const assessmentPayload = (await assessmentResponse.json().catch(() => null)) as
            | PronunciationAssessment
            | { error?: string }
            | null;

          if (assessmentResponse.ok && assessmentPayload && !("error" in assessmentPayload)) {
            freedomAssessment = assessmentPayload as PronunciationAssessment;
          }
        }

        setTurns((previous) =>
          previous.map((turn, index) =>
            index === previous.length - 1
              ? { ...turn, assessment: freedomAssessment, freeTranscript: nextTranscript, replyAudioUrl }
              : turn,
          ),
        );
      } else {
        const formData = new FormData();
        formData.set("audio", blob, `${currentTurn.id}.wav`);
        formData.set("text", currentTurn.learnerReply);

        const response = await fetch("/api/assess", { method: "POST", body: formData });
        const payload = (await response.json().catch(() => null)) as
          | PronunciationAssessment
          | { error?: string }
          | null;

        if (!response.ok || !payload || "error" in payload) {
          throw new Error(
            payload && "error" in payload ? payload.error : "Pronunciation assessment failed.",
          );
        }

        setTurns((previous) =>
          previous.map((turn, index) =>
            index === previous.length - 1
              ? { ...turn, assessment: payload as PronunciationAssessment, freeTranscript: null, replyAudioUrl }
              : turn,
          ),
        );
      }

      setPhase("result");
    } catch (nextError) {
      const message =
        nextError instanceof Error ? nextError.message : "Pronunciation assessment failed.";
      revokeReplyAudioUrl(replyAudioUrl);
      setError(message);
      setPhase("recording");
    }
  }

  function handleRetry() {
    if (!currentTurn) return;
    stopReplyAudio();
    revokeReplyAudioUrl(currentTurn.replyAudioUrl);
    setTurns((previous) =>
      previous.map((turn, index) =>
        index === previous.length - 1
          ? { ...turn, assessment: null, freeTranscript: null, replyAudioUrl: null }
          : turn,
      ),
    );
    setError(null);
    setRecorderVersion((v) => v + 1);
    setPhase("recording");
  }

  function handleClearReply() {
    if (!currentTurn) return;
    stopReplyAudio();
    revokeReplyAudioUrl(currentTurn.replyAudioUrl);
    setTurns((previous) =>
      previous.map((turn, index) =>
        index === previous.length - 1
          ? { ...turn, assessment: null, freeTranscript: null, replyAudioUrl: null }
          : turn,
      ),
    );
    setError(null);
    setPhase("recording");
  }

  const recorderDisabled =
    !coachStatus?.ready ||
    phase !== "recording" ||
    (replyMode === "target" ? !engineReady : !transcriptionReady);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <section
        className={cn(
          "grid gap-4",
          showOverviewCard ? "xl:grid-cols-[1.02fr_0.98fr]" : undefined,
        )}
      >
        {showOverviewCard ? (
          <CoachOverviewCard
            completedTurns={completedTurns}
            averageScore={averageScore}
            savedSessions={savedSessions}
          />
        ) : null}

        <CoachSetupCard
          topicDraft={topicDraft}
          onTopicDraftChange={setTopicDraft}
          sessionTopic={sessionTopic}
          phase={phase}
          replyMode={replyMode}
          onReplyModeChange={setReplyMode}
          coachStatus={coachStatus}
          engineReady={engineReady}
          transcriptionReady={transcriptionReady}
          transcriptionError={transcriptionError}
          error={error}
          turnsCount={turns.length}
          startDisabled={startDisabled}
          startHelperMessage={startHelperMessage}
          onStart={() => void requestCoachTurn("start")}
          onReset={resetCoachSession}
        />
      </section>

      {hasStartedSession ? (
        <section className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
          <CoachThread
            turns={turns}
            currentTurn={currentTurn}
            phase={phase}
            replyMode={replyMode}
            recorderVersion={recorderVersion}
            instruct={instruct}
            recorderDisabled={recorderDisabled}
            activeCoachTurnId={activeCoachTurnId}
            activeReplyTurnId={activeReplyTurnId}
            latestAssessment={latestAssessment}
            latestFreeTranscript={latestFreeTranscript}
            canContinue={canContinue}
            onToggleCoachMessage={(turn) => void toggleCoachMessage(turn)}
            onToggleReplyAudio={(turn) => void toggleReplyAudio(turn)}
            onRecordingComplete={(blob) => void handleRecordingComplete(blob)}
            onClearReply={handleClearReply}
            onRetry={handleRetry}
            onContinue={() => void requestCoachTurn("continue")}
          />

          <CoachSidePanel
            currentTurn={currentTurn}
            replyMode={replyMode}
            latestFreeTranscript={latestFreeTranscript}
            latestAssessment={latestAssessment}
            resultPanelRef={resultPanelRef}
            coachAudioError={coachAudioError}
            error={error}
            isLoadingCoachAudio={isLoadingCoachAudio}
            onRetry={handleRetry}
            onContinue={() => void requestCoachTurn("continue")}
          />
        </section>
      ) : null}
    </div>
  );
}
