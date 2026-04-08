// FILE: src/components/coach/AiCoachPlayground.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { ArrowRight, Pause, Play, Microphone } from "griddy-icons";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
const TOPIC_SUGGESTIONS = [
  "Describing my role at work",
  "Talking about skiing",
  "Giving product feedback",
  "Explaining a weekend trip",
];

function getFreedomHighlightStyles(status: PronunciationAssessment["highlights"][number]["status"]) {
  if (status === "correct") {
    return "bg-yellow-green text-hunter-green";
  }

  if (status === "mixed") {
    return "bg-[#efd889] text-hunter-green";
  }

  return "bg-blushed-brick text-bright-snow";
}

function formatReplySentence(assessment: PronunciationAssessment) {
  return assessment.highlights.map((highlight) => highlight.text).join(" ");
}

function FreedomAssessmentPanel({
  transcript,
  assessment,
}: {
  transcript: string;
  assessment: PronunciationAssessment | null;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!assessment) {
    return (
      <Card className="bg-white">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-sage-green">Freedom transcript</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              Cadence captured what you said and is ready to compare the next take.
            </h3>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Whisper transcript</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
              {transcript}
            </p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              This transcript becomes the target reply once the phoneme check finishes.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const correctHighlights = assessment.highlights.filter(
    (highlight) => highlight.status === "correct",
  ).length;
  const mixedHighlights = assessment.highlights.filter(
    (highlight) => highlight.status === "mixed",
  ).length;

  return (
    <Card className="bg-white">
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="eyebrow text-sm text-sage-green">Freedom transcript</p>
          <h3 className="text-2xl font-semibold text-hunter-green">
            Whisper builds the reply text, then Cadence checks the live phonemes against it.
          </h3>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <p className="eyebrow text-xs text-sage-green">Whisper transcript</p>
          <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
            {transcript}
          </p>
          <p className="mt-2 text-sm leading-6 text-iron-grey">
            This is the word-level transcript from the freedom take.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Transcript-based pronunciation</p>
            <div className="mt-3 flex justify-center">
              <ProgressRing
                score={assessment.overallScore}
                size={88}
                strokeWidth={7}
              />
            </div>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Pronunciation check</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              {assessment.summary}
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-hunter-green">
              {assessment.nextStep}
            </p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Target reply</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
              {assessment.targetText}
            </p>
            <p className="mt-2 text-sm leading-6 text-iron-grey break-words">
              {assessment.ipaTarget}
            </p>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Decoded phonemes</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green break-words">
              {assessment.transcript}
            </p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">
              The live model decode for this take is shown here directly.
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-xs text-sage-green">Word feedback</p>
              <p className="text-sm leading-6 text-iron-grey">
                Compare the transcript-driven target with what the audio model heard.
              </p>
            </div>

            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-hunter-green">
              {correctHighlights}/{assessment.highlights.length} strong words
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {assessment.highlights.map((highlight, index) => (
              <span
                key={`${highlight.text}-${highlight.status}-${index}`}
                title={highlight.feedback}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-semibold",
                  getFreedomHighlightStyles(highlight.status),
                )}
              >
                {highlight.text}
              </span>
            ))}
          </div>

          <p className="mt-3 text-sm leading-6 text-iron-grey">
            {correctHighlights} words were clean, {mixedHighlights} were close, and the rest need another pass.
          </p>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="eyebrow text-xs text-sage-green">Advanced breakdown</p>
              <p className="text-sm leading-6 text-iron-grey">
                Open the phoneme grid to compare expected sounds with the live decode.
              </p>
            </div>

            <Button
              variant="ghost"
              onClick={() => setShowAdvanced((value) => !value)}
            >
              {showAdvanced ? "Hide breakdown" : "Show breakdown"}
            </Button>
          </div>

          {showAdvanced ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {assessment.phonemes.map((phoneme, index) => (
                <div
                  key={`${phoneme.symbol}-${phoneme.expected}-${phoneme.heard}-${index}`}
                  className={cn(
                    "rounded-3xl px-4 py-4",
                    phoneme.status === "correct"
                      ? "bg-yellow-green/25 text-hunter-green"
                      : "bg-blushed-brick text-bright-snow",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="eyebrow text-xs">Sound</p>
                    <p className="text-sm font-semibold">{phoneme.accuracy}%</p>
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{phoneme.symbol}</p>
                  <p className="mt-3 text-sm leading-6">
                    Expected {phoneme.expected}, heard {phoneme.heard}.
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function buildHistory(turns: AiCoachTurn[]): AiCoachHistoryEntry[] {
  return turns.flatMap((turn) => {
    const entries: AiCoachHistoryEntry[] = [
      {
        role: "coach",
        content: turn.coachMessage,
        checkpoint: turn.checkpoint,
      },
    ];

    if (turn.assessment) {
      const spokenReply =
        turn.assessment.transcript?.trim() || turn.assessment.targetText;
      entries.push({
        role: "user",
        content: spokenReply,
        cue: turn.cue,
        score: turn.assessment.overallScore,
        transcript: turn.assessment.transcript,
      });
    } else if (turn.freeTranscript) {
      entries.push({
        role: "user",
        content: turn.freeTranscript,
        cue: turn.cue,
        transcript: turn.freeTranscript,
      });
    }

    return entries;
  });
}

function createTurn(turn: AiCoachGeneratedTurn): AiCoachTurn {
  return {
    id: crypto.randomUUID(),
    checkpoint: turn.checkpoint,
    coachMessage: turn.coachMessage,
    learnerReply: turn.learnerReply,
    cue: turn.cue,
    assessment: null,
    freeTranscript: null,
    replyAudioUrl: null,
  };
}

export function AiCoachPlayground({
  userId,
  showOverviewCard = true,
}: {
  userId: string
  showOverviewCard?: boolean
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
    if (completedTurns.length === 0) {
      return 0;
    }

    return Math.round(
      completedTurns.reduce(
        (sum, turn) => sum + (turn.assessment?.overallScore ?? 0),
        0,
      ) / completedTurns.length,
    );
  }, [completedTurns]);

  const isCoachBusy = phase === "starting" || phase === "continuing";
  const hasStartedSession = turns.length > 0;
  const startDisabled =
    !trimmedTopicDraft || !coachStatus?.ready || isCoachBusy;
  const startHelperMessage = !trimmedTopicDraft
    ? "Add a topic to unlock the coach."
    : !coachStatus?.ready
      ? coachStatus?.message ?? "AI Coach is warming up right now."
      : phase === "starting"
        ? "Coach is opening the first turn."
        : null;
  const canContinue =
    Boolean(latestAssessment || latestFreeTranscript) &&
    phase !== "continuing" &&
    phase !== "assessing";

  // Debug: log state machine transitions to browser console
  useEffect(() => {
    console.log(`[coach] phase=${phase} canContinue=${canContinue} turns=${turns.length} latestAssessment=${latestAssessment !== null} latestFreeTranscript="${latestFreeTranscript ?? "null"}"`);
  }, [phase, canContinue, turns.length, latestAssessment, latestFreeTranscript]);

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
          previous.find((session) => session.id === activeSessionId)?.createdAt ??
          new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        turns: turns.map((turn) => ({
          ...turn,
          replyAudioUrl: null,
        })),
      };

      const nextSessions = [
        nextSession,
        ...previous.filter((session) => session.id !== activeSessionId),
      ].slice(0, MAX_SAVED_SESSIONS);

      writeSavedAiCoachSessions(userId, nextSessions);
      return nextSessions;
    });
  }, [
    activeSessionId,
    sessionTopic,
    turns,
    replyMode,
    userId,
  ]);

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
    coachAudioRef.current?.pause();
    coachAudioRef.current = null;
    setActiveCoachTurnId(null);
    for (const url of coachAudioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    coachAudioCacheRef.current.clear();
  }, [instruct]);

  useEffect(() => {
    if ((!latestAssessment && !latestFreeTranscript) || phase !== "result") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const element = resultPanelRef.current;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      const bottomGap = rect.bottom - window.innerHeight;

      if (bottomGap > 16) {
        window.scrollBy({
          top: bottomGap + 24,
          behavior: "smooth",
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [latestAssessment, latestFreeTranscript, phase]);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const [engineResponse, coachResponse] = await Promise.all([
          fetch("/api/assess", { method: "GET", cache: "no-store" }),
          fetch("/api/ai-coach", { method: "GET", cache: "no-store" }),
        ]);

        const enginePayload = (await engineResponse.json().catch(() => null)) as
          | EngineStatusPayload
          | null;
        const coachPayload = (await coachResponse.json().catch(() => null)) as
          | AiCoachStatusPayload
          | null;

        if (cancelled) {
          return;
        }

        setEngineReady(enginePayload?.ready === true);
        setTranscriptionReady(enginePayload?.transcriberReady === true);
        setTranscriptionError(enginePayload?.transcriberLoadError ?? null);
        setCoachStatus(
          coachPayload ?? {
            ready: false,
            message: "AI Coach is unavailable right now.",
          },
        );
      } catch {
        if (cancelled) {
          return;
        }

        setEngineReady(false);
        setTranscriptionReady(false);
        setTranscriptionError("AI transcription is unavailable right now.");
        setCoachStatus({
          ready: false,
          message: "AI Coach is unavailable right now.",
        });
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (engineReady && transcriptionReady && coachStatus?.ready) {
      return;
    }

    const timeout = window.setTimeout(() => {
      Promise.all([
        fetch("/api/assess", { method: "GET", cache: "no-store" })
          .then((response) => response.json())
          .catch(() => ({ ready: false, transcriberReady: false })),
        fetch("/api/ai-coach", { method: "GET", cache: "no-store" })
          .then((response) => response.json())
          .catch(
            () =>
              ({
                ready: false,
                message: "AI Coach is unavailable right now.",
              }) satisfies AiCoachStatusPayload,
          ),
      ]).then(([enginePayload, coachPayload]) => {
        const nextEngine = enginePayload as EngineStatusPayload | null;
        setEngineReady(Boolean(nextEngine?.ready));
        setTranscriptionReady(Boolean(nextEngine?.transcriberReady));
        setTranscriptionError(nextEngine?.transcriberLoadError ?? null);
        setCoachStatus(
          coachPayload as AiCoachStatusPayload,
        );
      });
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [engineReady, transcriptionReady, coachStatus]);

  const autoplayCurrentTurn = useEffectEvent((turn: AiCoachTurn) => {
    void playCoachMessage(turn, true);
  });

  useEffect(() => {
    if (phase !== "coach" || !currentTurn) {
      return;
    }

    autoplayCurrentTurn(currentTurn);
  }, [currentTurn, phase]);

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

  function resetCoachSession() {
    stopCoachAudio();
    stopReplyAudio();
    for (const url of coachAudioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    coachAudioCacheRef.current.clear();
    for (const turn of turns) {
      revokeReplyAudioUrl(turn.replyAudioUrl);
    }
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
    setRecorderVersion((previous) => previous + 1);

    const lastTurn = session.turns.at(-1) ?? null;
    if (!lastTurn) {
      setPhase("idle");
    } else if (lastTurn.assessment || lastTurn.freeTranscript) {
      setPhase("result");
    } else {
      setPhase("recording");
    }
  }

  const restoreSavedSession = useEffectEvent((session: SavedAiCoachSession) => {
    restoreSession(session);
  });

  useEffect(() => {
    if (!resumeSessionId || resumedSessionIdRef.current === resumeSessionId) {
      return;
    }

    const session = savedSessions.find((item) => item.id === resumeSessionId);
    if (!session) {
      return;
    }

    resumedSessionIdRef.current = resumeSessionId;
    restoreSavedSession(session);
  }, [resumeSessionId, savedSessions]);

  async function getCoachAudioUrl(turn: AiCoachTurn) {
    const cacheKey = `${instruct}:${turn.id}`;
    const cached = coachAudioCacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    const params = new URLSearchParams({
      text: turn.coachMessage,
      instruct,
    });
    const response = await fetch(`/api/reference-audio?${params.toString()}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
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
        if (unlockWhenDone) {
          setPhase("recording");
        }
      };
      audio.onerror = () => {
        coachAudioRef.current = null;
        setActiveCoachTurnId(null);
        setCoachAudioError("Coach audio could not be played for this turn.");
        if (unlockWhenDone) {
          setPhase("recording");
        }
      };
      await audio.play();
    } catch (nextError) {
      setActiveCoachTurnId(null);
      setCoachAudioError(
        nextError instanceof Error
          ? nextError.message
          : "Coach audio could not be played for this turn.",
      );
      if (unlockWhenDone) {
        setPhase("recording");
      }
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
    if (!turn.replyAudioUrl) {
      return;
    }

    if (activeReplyTurnId === turn.id && replyAudioRef.current) {
      stopReplyAudio();
      return;
    }

    stopReplyAudio();
    const audio = new Audio(turn.replyAudioUrl);
    replyAudioRef.current = audio;
    setActiveReplyTurnId(turn.id);
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

  async function requestCoachTurn(action: "start" | "continue") {
    const topic = (action === "start" ? topicDraft : sessionTopic).trim();
    const nextSessionId = action === "start" ? crypto.randomUUID() : activeSessionId;

    console.log(`[coach] requestCoachTurn action=${action} topic="${topic}" phase=${phase} canContinue=${canContinue} sessionId=${activeSessionId}`);

    if (!topic) {
      console.warn("[coach] requestCoachTurn aborted: no topic");
      setError("Add a topic before starting the coach.");
      return;
    }

    const payload: AiCoachRequestPayload = {
      action,
      topic,
      mode: replyMode,
      history: action === "start" ? [] : buildHistory(turns),
      latestAssessment:
        action === "continue" && latestAssessment
          ? {
              targetText: latestAssessment.targetText,
              transcript: latestAssessment.transcript,
              overallScore: latestAssessment.overallScore,
              summary: latestAssessment.summary,
              nextStep: latestAssessment.nextStep,
            }
          : null,
    };

    console.log(`[coach] posting to /api/ai-coach mode=${replyMode} historyLen=${payload.history.length}`);
    setError(null);
    setCoachAudioError(null);
    setPhase(action === "start" ? "starting" : "continuing");

    try {
      if (action === "start") {
        resetCoachSession();
      }

      const response = await fetch("/api/ai-coach", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json().catch(() => null)) as
        | {
            error?: string;
            turn?: AiCoachGeneratedTurn;
          }
        | null;

      console.log(`[coach] /api/ai-coach response status=${response.status} hasTurn=${Boolean(data?.turn)} error=${data?.error ?? null}`);

      if (!response.ok || !data?.turn) {
        throw new Error(data?.error ?? "AI Coach could not generate the next turn.");
      }

      const nextTurn = createTurn(data.turn);
      console.log(`[coach] new turn id=${nextTurn.id} checkpoint="${nextTurn.checkpoint}" coachMessage="${nextTurn.coachMessage}"`);
      setTurns((previous) =>
        action === "start" ? [nextTurn] : [...previous, nextTurn],
      );
      if (nextSessionId) {
        setActiveSessionId(nextSessionId);
      }
      setSessionTopic(topic);
      setPhase("coach");
      setRecorderVersion(0);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "AI Coach could not generate the next turn.";
      console.error("[coach] requestCoachTurn failed:", message, nextError);
      setError(message);
      setPhase(turns.length > 0 ? "result" : "idle");
    }
  }

  async function handleRecordingComplete(blob: Blob) {
    if (!currentTurn) {
      console.warn("[coach] handleRecordingComplete called but no currentTurn");
      return;
    }

    console.log(`[coach] recording complete turnId=${currentTurn.id} mode=${replyMode} blobSize=${blob.size}`);
    setPhase("assessing");
    setError(null);

    const replyAudioUrl = URL.createObjectURL(blob);
    registerReplyAudioUrl(replyAudioUrl);

    try {
      if (replyMode === "freedom") {
        const formData = new FormData();
        formData.set("audio", blob, `${currentTurn.id}.wav`);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | AiCoachTranscriptPayload
          | { error?: string }
          | null;

        if (!response.ok || !payload || "error" in payload) {
          throw new Error(
            payload && "error" in payload
              ? payload.error
              : "Reply transcription failed.",
          );
        }

        const nextTranscript = (payload as AiCoachTranscriptPayload).transcript;
        console.log(`[coach] freedom transcription result="${nextTranscript}"`);
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

          if (
            assessmentResponse.ok &&
            assessmentPayload &&
            !("error" in assessmentPayload)
          ) {
            freedomAssessment = assessmentPayload as PronunciationAssessment;
            console.log(`[coach] freedom phoneme assessment score=${freedomAssessment.overallScore}`);
          } else {
            console.warn(`[coach] freedom phoneme assessment skipped/failed status=${assessmentResponse.status}`, assessmentPayload);
          }
        }

        setTurns((previous) =>
          previous.map((turn, index) =>
            index === previous.length - 1
              ? {
                  ...turn,
                  assessment: freedomAssessment,
                  freeTranscript: nextTranscript,
                  replyAudioUrl,
                }
              : turn,
          ),
        );
      } else {
        const formData = new FormData();
        formData.set("audio", blob, `${currentTurn.id}.wav`);
        formData.set("text", currentTurn.learnerReply);

        const response = await fetch("/api/assess", {
          method: "POST",
          body: formData,
        });

        const payload = (await response.json().catch(() => null)) as
          | PronunciationAssessment
          | { error?: string }
          | null;

        if (!response.ok || !payload || "error" in payload) {
          throw new Error(
            payload && "error" in payload
              ? payload.error
              : "Pronunciation assessment failed.",
          );
        }

        const nextAssessment = payload as PronunciationAssessment;

        setTurns((previous) =>
          previous.map((turn, index) =>
            index === previous.length - 1
              ? {
                  ...turn,
                  assessment: nextAssessment,
                  freeTranscript: null,
                  replyAudioUrl,
                }
              : turn,
          ),
        );
      }
      console.log(`[coach] assessment complete → phase=result latestFreeTranscript="${currentTurn.freeTranscript}" latestAssessment=${currentTurn.assessment !== null}`);
      setPhase("result");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Pronunciation assessment failed.";
      console.error("[coach] handleRecordingComplete failed:", message, nextError);
      revokeReplyAudioUrl(replyAudioUrl);
      setError(message);
      setPhase("recording");
    }
  }

  function handleRetry() {
    if (!currentTurn) {
      return;
    }

    stopReplyAudio();
    revokeReplyAudioUrl(currentTurn.replyAudioUrl);
    setTurns((previous) =>
      previous.map((turn, index) =>
        index === previous.length - 1
            ? {
                ...turn,
                assessment: null,
                freeTranscript: null,
                replyAudioUrl: null,
              }
            : turn,
      ),
    );
    setError(null);
    setRecorderVersion((previous) => previous + 1);
    setPhase("recording");
  }

  function handleClearReply() {
    if (!currentTurn) {
      return;
    }

    stopReplyAudio();
    revokeReplyAudioUrl(currentTurn.replyAudioUrl);
    setTurns((previous) =>
      previous.map((turn, index) =>
        index === previous.length - 1
            ? {
                ...turn,
                assessment: null,
                freeTranscript: null,
                replyAudioUrl: null,
              }
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

  return (
    <div className="space-y-4">
      <section
        className={cn(
          "grid gap-4",
          showOverviewCard ? "xl:grid-cols-[1.02fr_0.98fr]" : undefined,
        )}
      >
        {showOverviewCard ? (
          <Card className="bg-hunter-green text-bright-snow">
            <div className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr]">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
                  <Microphone size={18} filled color="currentColor" />
                  <span className="eyebrow text-sm">AI Coach</span>
                </div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-semibold text-bright-snow sm:text-4xl lg:text-5xl">
                    Open-topic speaking practice with a live pronunciation coach.
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-bright-snow/78">
                    Pick any topic, let the coach open the exchange, then switch
                    between strict target scoring and open freedom replies as the
                    conversation unfolds.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div className="rounded-3xl bg-white/10 px-4 py-4">
                  <p className="eyebrow text-xs text-yellow-green/82">Turns scored</p>
                  <p className="mt-2 text-2xl font-semibold text-bright-snow">
                    {completedTurns.length}
                  </p>
                </div>
                <div className="rounded-3xl bg-white/10 px-4 py-4">
                  <p className="eyebrow text-xs text-yellow-green/82">Average score</p>
                  <div className="mt-2 flex items-center gap-3">
                    <ProgressRing
                      score={averageScore}
                      size={52}
                      strokeWidth={5}
                      valueLabel={completedTurns.length === 0 ? "0" : `${averageScore}`}
                      trackColor="rgba(255,255,255,0.18)"
                      className="[&_span]:text-bright-snow shrink-0"
                    />
                    <p className="hidden text-sm leading-6 text-bright-snow/78 lg:block">
                      Keep the conversation moving and the score climbs with each
                      stronger reply.
                    </p>
                  </div>
                </div>
                <div className="col-span-2 rounded-3xl bg-white/10 px-4 py-4 lg:col-span-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="eyebrow text-xs text-yellow-green/82">
                        Saved conversations
                      </p>
                      <p className="text-2xl font-semibold text-bright-snow">
                        {savedSessions.length}
                      </p>
                      <p className="hidden text-sm leading-6 text-bright-snow/78 sm:block">
                        Restore any recent coach session and keep going from where you left it.
                      </p>
                    </div>
                    <Link
                      href="/coach/history"
                      className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-yellow-green/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-yellow-green/20"
                    >
                      See more
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Session setup</p>
              <h2 className="text-2xl font-semibold text-hunter-green">
                Give the coach a situation to open.
              </h2>
              <p className="text-sm leading-6 text-iron-grey">
                This is the real-life topic the coach will use to start the conversation.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <label className="space-y-2">
                <span className="eyebrow block text-xs text-sage-green">
                  Topic or situation
                </span>
                <Input
                  className="rounded-full border border-hunter-green/10 bg-vanilla-cream px-5"
                  value={topicDraft}
                  onChange={(event) => setTopicDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !startDisabled) {
                      event.preventDefault();
                      void requestCoachTurn("start");
                    }
                  }}
                  placeholder="Example: describing my job, asking for travel advice, talking about skiing"
                  disabled={phase === "starting" || phase === "continuing"}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => void requestCoachTurn("start")}
                  disabled={startDisabled}
                >
                  <ArrowRight size={16} color="currentColor" />
                  {phase === "starting" ? "Starting..." : "Start coach"}
                </Button>

                {turns.length > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => resetCoachSession()}
                  >
                    New topic
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {TOPIC_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="rounded-full bg-vanilla-cream px-3 py-2 text-sm font-semibold text-hunter-green transition-colors hover:bg-[#eadfbe]"
                  onClick={() => setTopicDraft(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="eyebrow text-xs text-sage-green">Reply mode</p>
                  <p className="text-sm leading-6 text-iron-grey">
                    Choose whether the next reply should follow an exact target or stay fully open.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={replyMode === "target" ? "primary" : "ghost"}
                    className={cn(replyMode === "target" && "text-white")}
                    onClick={() => setReplyMode("target")}
                  >
                    Targeted
                  </Button>
                  <Button
                    variant={replyMode === "freedom" ? "primary" : "ghost"}
                    className={cn(replyMode === "freedom" && "text-white")}
                    onClick={() => setReplyMode("freedom")}
                  >
                    Freedom
                  </Button>
                </div>
              </div>
            </div>

            {error && turns.length === 0 ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                {error}
              </div>
            ) : startHelperMessage ? (
              <div className="rounded-3xl bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
                {startHelperMessage}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Coach status</p>
                <p className="mt-2 text-sm leading-6 text-iron-grey">
                  {coachStatus?.message ?? "Checking AI Coach availability..."}
                </p>
              </div>
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">
                  {replyMode === "target" ? "Pronunciation engine" : "Freedom transcription"}
                </p>
                <p className="mt-2 text-sm leading-6 text-iron-grey">
                  {replyMode === "target"
                    ? engineReady
                      ? "Scoring is ready for exact target replies."
                      : "The pronunciation engine is still warming up."
                    : transcriptionReady
                      ? "Freedom mode can transcribe your spoken answer."
                      : transcriptionError ?? "The transcription engine is still warming up."}
                </p>
              </div>
            </div>

            {sessionTopic ? (
              <div className="rounded-3xl bg-hunter-green px-4 py-4 text-bright-snow">
                <p className="eyebrow text-xs text-yellow-green/84">Current topic</p>
                <p className="mt-2 text-lg font-semibold">{sessionTopic}</p>
              </div>
            ) : null}

          </div>
        </Card>
      </section>

      {hasStartedSession ? (
        <section className="grid gap-4 xl:grid-cols-[1.06fr_0.94fr]">
          <div className="space-y-4">
            <Card className="bg-white">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="eyebrow text-sm text-sage-green">Coach thread</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">
                    Keep the conversation visible while you answer.
                  </h2>
                </div>

                <div className="space-y-4 rounded-[2rem] bg-[#f6f0e0] px-4 py-4 sm:px-5">
                  {turns.map((turn, index) => {
                    const isCurrent = index === turns.length - 1;
                    const isReplyActive = activeReplyTurnId === turn.id;
                    const isCoachActive = activeCoachTurnId === turn.id;

                    return (
                      <div key={turn.id} className="space-y-3">
                        <div className="flex justify-start">
                          <div className="max-w-[88%] rounded-[1.9rem] bg-vanilla-cream px-4 py-4 sm:px-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1 space-y-2">
                                <p className="eyebrow text-xs text-sage-green">Coach</p>
                                <p className="text-base leading-7 text-hunter-green">
                                  {turn.coachMessage}
                                </p>
                              </div>

                              <Button
                                variant="ghost"
                                className="h-10 w-10 shrink-0 rounded-full px-0"
                                onClick={() => void toggleCoachMessage(turn)}
                                aria-label={isCoachActive ? "Pause coach message" : "Play coach message"}
                              >
                                {isCoachActive ? (
                                  <Pause size={16} filled color="currentColor" />
                                ) : (
                                  <Play size={16} filled color="currentColor" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <div className="max-w-[88%] rounded-[1.9rem] bg-white px-4 py-4 sm:px-5">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1 space-y-3">
                                <p className="eyebrow text-xs text-sage-green">You</p>

                                {turn.assessment ? (
                                  <p className="text-base font-semibold leading-7 text-hunter-green">
                                    {formatReplySentence(turn.assessment)}
                                  </p>
                                ) : turn.freeTranscript ? (
                                  <p className="text-base font-semibold leading-7 text-hunter-green">
                                    {turn.freeTranscript}
                                  </p>
                                ) : isCurrent && replyMode === "freedom" ? (
                                  <p className="text-base font-semibold leading-7 text-hunter-green">
                                    Answer naturally in your own words.
                                  </p>
                                ) : (
                                  <p className="text-base font-semibold leading-7 text-hunter-green">
                                    {turn.learnerReply}
                                  </p>
                                )}
                              </div>

                              {turn.replyAudioUrl ? (
                                <Button
                                  variant="ghost"
                                  className="h-10 w-10 shrink-0 rounded-full px-0"
                                  onClick={() => void toggleReplyAudio(turn)}
                                  aria-label={isReplyActive ? "Pause your reply" : "Play your reply"}
                                >
                                  {isReplyActive ? (
                                    <Pause size={16} filled color="currentColor" />
                                  ) : (
                                    <Play size={16} filled color="currentColor" />
                                  )}
                                </Button>
                              ) : null}
                            </div>

                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-hunter-green/10 pt-5">
                  <div className="space-y-4 rounded-[1.9rem] bg-vanilla-cream px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="eyebrow text-sm text-sage-green">Recorder</p>
                        <h2 className="text-xl font-semibold text-hunter-green">
                          Next reply
                        </h2>
                      </div>
                      <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-hunter-green">
                        {replyMode === "target" ? "Targeted" : "Freedom"}
                      </div>
                    </div>

                    <AudioRecorder
                      embedded
                      showIntro={false}
                      showStatus={false}
                      captureMode={replyMode}
                      key={currentTurn ? `${currentTurn.id}-${recorderVersion}-${replyMode}` : `idle-${recorderVersion}-${replyMode}`}
                      targetWord={replyMode === "target" ? currentTurn?.learnerReply : undefined}
                      instruct={instruct}
                      disabled={recorderDisabled}
                      onRecordingComplete={(blob) => void handleRecordingComplete(blob)}
                      onClear={handleClearReply}
                    />

                    <div className="flex flex-wrap justify-center gap-3 border-t border-hunter-green/10 pt-4">
                      <Button
                        variant="ghost"
                        onClick={handleRetry}
                        disabled={
                          !currentTurn ||
                          phase === "assessing" ||
                          (!latestAssessment && !latestFreeTranscript)
                        }
                      >
                        Try again
                      </Button>
                      <Button
                        onClick={() => void requestCoachTurn("continue")}
                        disabled={!canContinue}
                      >
                        <ArrowRight size={16} color="currentColor" />
                        {phase === "continuing" ? "Loading next reply..." : "Next coach reply"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="self-start space-y-4 xl:sticky xl:top-6">
            <Card className="bg-white">
              <div className="space-y-5">
                <div className="space-y-2">
                  <p className="eyebrow text-sm text-sage-green">Reply flow</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">
                    Keep the next turn, cue, and outcome in view.
                  </h2>
                </div>

                {currentTurn ? (
                  <>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                        <p className="eyebrow text-xs text-sage-green">Checkpoint</p>
                        <p className="mt-2 text-sm font-semibold uppercase tracking-[0.05em] text-hunter-green">
                          {currentTurn.checkpoint}
                        </p>
                      </div>

                      <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                        <p className="eyebrow text-xs text-sage-green">Pronunciation cue</p>
                        <p className="mt-2 text-sm leading-6 text-iron-grey">
                          {currentTurn.cue}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                      {replyMode === "target" ? (
                        <>
                          <p className="eyebrow text-xs text-sage-green">Target reply</p>
                          <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
                            {currentTurn.learnerReply}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-iron-grey">
                            Repeat this exact line to get strict pronunciation scoring against the target.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="eyebrow text-xs text-sage-green">Freedom mode</p>
                          <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">
                            Answer the coach naturally in your own words.
                          </p>
                          <p className="mt-2 text-sm leading-6 text-iron-grey">
                            No suggested sentence is shown here. Cadence will transcribe what you actually say and feed that back into the next coach turn.
                          </p>
                        </>
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </Card>

            {latestFreeTranscript ? (
              <div ref={resultPanelRef}>
              <FreedomAssessmentPanel
                key={`${latestFreeTranscript}-${latestAssessment?.transcript ?? "no-phoneme-decode"}`}
                transcript={latestFreeTranscript}
                assessment={latestAssessment}
              />
              </div>
            ) : latestAssessment ? (
              <div ref={resultPanelRef}>
              <AssessmentResult
                assessment={latestAssessment}
                onRetry={handleRetry}
                onNext={() => void requestCoachTurn("continue")}
                nextLabel="Next coach reply"
                showActions={false}
              />
              </div>
            ) : null}

            {coachAudioError ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                {coachAudioError}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
                {error}
              </div>
            ) : null}

            {isLoadingCoachAudio ? (
              <div className="rounded-3xl bg-white px-4 py-3 text-sm text-iron-grey">
                Coach audio is loading for the current turn.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
