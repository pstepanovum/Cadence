// FILE: src/components/learn/AssessmentResult.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import {
  type PronunciationAssessment,
  type PronunciationHighlight,
} from "@/lib/pronunciation";
import {
  configureReferenceWordPlayback,
  playLearnerRecordingSegment,
} from "@/lib/audio-feedback";
import { cn } from "@/lib/utils";
import { ProgressRing } from "@/components/learn/ProgressRing";
import { Button } from "@/components/ui/button";
import { useCoachVoice } from "@/hooks/useCoachVoice";

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
  compact = false,
  instruct,
  onHighlightClick,
  activeHighlightKey,
}: {
  highlights: PronunciationHighlight[];
  compact?: boolean;
  instruct: string;
  onHighlightClick?: (
    highlight: PronunciationHighlight,
    index: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void;
  activeHighlightKey?: string | null;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-2",
        compact ? "text-sm leading-6" : "text-base leading-7",
      )}
    >
      {highlights.map((highlight, index) => {
        const refKey = `ref:${instruct}:${highlight.text}-${index}`;
        const learnerKey = `learner:${index}`;
        const isActive =
          activeHighlightKey === refKey || activeHighlightKey === learnerKey;
        return (
          <button
            type="button"
            key={`${highlight.text}-${highlight.status}-${index}`}
            className={cn(
              "appearance-none border-0 rounded-full px-3 py-1.5 font-semibold transition-colors cursor-pointer",
              getHighlightStyles(highlight.status),
              isActive && "brightness-95",
            )}
            title={highlight.feedback}
            onClick={(event) => onHighlightClick?.(highlight, index, event)}
          >
            {highlight.text}
          </button>
        );
      })}
    </div>
  );
}

interface AssessmentResultProps {
  assessment: PronunciationAssessment;
  onRetry: () => void;
  onNext: () => void;
  nextLabel?: string;
  showActions?: boolean;
  /** When set (e.g. conversation take), word taps play this recording for each word when timings exist. */
  replyAudioUrl?: string | null;
}

export function AssessmentResult({
  assessment,
  onRetry,
  onNext,
  nextLabel = "Next Word",
  showActions = true,
  replyAudioUrl = null,
}: AssessmentResultProps) {
  const { instruct } = useCoachVoice();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [activeHighlightKey, setActiveHighlightKey] = useState<string | null>(null);
  const highlightAudioRef = useRef<HTMLAudioElement | null>(null);
  const stopLearnerWordRef = useRef<(() => void) | null>(null);
  const highlightAudioCacheRef = useRef<Map<string, string>>(new Map());
  const targetIsPhrase =
    assessment.targetText.trim().split(/\s+/).filter(Boolean).length > 1;
  const correctHighlights = assessment.highlights.filter(
    (highlight) => highlight.status === "correct",
  ).length;
  const mixedHighlights = assessment.highlights.filter(
    (highlight) => highlight.status === "mixed",
  ).length;

  useEffect(() => {
    const audioCache = highlightAudioCacheRef.current;

    return () => {
      stopLearnerWordRef.current?.();
      stopLearnerWordRef.current = null;
      highlightAudioRef.current?.pause();
      highlightAudioRef.current = null;
      for (const url of audioCache.values()) {
        URL.revokeObjectURL(url);
      }
      audioCache.clear();
    };
  }, []);

  useEffect(() => {
    stopLearnerWordRef.current?.();
    stopLearnerWordRef.current = null;
    highlightAudioRef.current?.pause();
    highlightAudioRef.current = null;
    setActiveHighlightKey(null);
  }, [assessment]);

  // Flush audio cache whenever the voice changes so replays use the new voice.
  useEffect(() => {
    stopLearnerWordRef.current?.();
    stopLearnerWordRef.current = null;
    highlightAudioRef.current?.pause();
    highlightAudioRef.current = null;
    setActiveHighlightKey(null);
    for (const url of highlightAudioCacheRef.current.values()) {
      URL.revokeObjectURL(url);
    }
    highlightAudioCacheRef.current.clear();
  }, [instruct]);

  async function handleHighlightClick(
    highlight: PronunciationHighlight,
    index: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) {
    const canPlayLearnerClip =
      Boolean(replyAudioUrl) &&
      !event.shiftKey &&
      typeof highlight.replyStartSec === "number" &&
      typeof highlight.replyEndSec === "number";

    const playbackKey = canPlayLearnerClip
      ? `learner:${index}`
      : `ref:${instruct}:${highlight.text}-${index}`;

    const isSameActive = activeHighlightKey === playbackKey;
    const hasRefAudio = Boolean(highlightAudioRef.current);
    const hasLearnerStop = Boolean(stopLearnerWordRef.current);

    if (isSameActive && (hasRefAudio || hasLearnerStop)) {
      stopLearnerWordRef.current?.();
      stopLearnerWordRef.current = null;
      highlightAudioRef.current?.pause();
      highlightAudioRef.current = null;
      setActiveHighlightKey(null);
      return;
    }

    stopLearnerWordRef.current?.();
    stopLearnerWordRef.current = null;
    highlightAudioRef.current?.pause();
    highlightAudioRef.current = null;
    setActiveHighlightKey(playbackKey);

    if (canPlayLearnerClip && replyAudioUrl) {
      const { audio, cancel } = playLearnerRecordingSegment(
        replyAudioUrl,
        highlight.replyStartSec!,
        highlight.replyEndSec!,
        () => {
          stopLearnerWordRef.current = null;
          highlightAudioRef.current = null;
          setActiveHighlightKey(null);
        },
      );
      stopLearnerWordRef.current = cancel;
      highlightAudioRef.current = audio;
      return;
    }

    try {
      const cacheKey = `${instruct}:${highlight.text}-${index}`;
      let audioUrl = highlightAudioCacheRef.current.get(cacheKey);
      if (!audioUrl) {
        const params = new URLSearchParams({ text: highlight.text, instruct });
        const response = await fetch(
          `/api/reference-audio?${params.toString()}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error ?? "Word pronunciation is unavailable.");
        }

        const blob = await response.blob();
        audioUrl = URL.createObjectURL(blob);
        highlightAudioCacheRef.current.set(cacheKey, audioUrl);
      }

      const audio = configureReferenceWordPlayback(new Audio(audioUrl));
      highlightAudioRef.current = audio;
      audio.onended = () => {
        highlightAudioRef.current = null;
        setActiveHighlightKey(null);
      };
      audio.onerror = () => {
        highlightAudioRef.current = null;
        setActiveHighlightKey(null);
      };
      await audio.play();
    } catch {
      setActiveHighlightKey(null);
      highlightAudioRef.current = null;
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[0.94fr_1.06fr]">
        <div className="rounded-[2rem] bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-center gap-4">
            <ProgressRing
              score={assessment.overallScore}
              size={92}
              strokeWidth={7}
            />
            <div className="space-y-2">
              <p className="eyebrow text-xs text-sage-green">Assessment score</p>
              <p className="text-3xl font-semibold text-hunter-green">
                {assessment.overallScore}/100
              </p>
              <p className="text-sm leading-6 text-iron-grey">
                {assessment.summary}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">
                {targetIsPhrase ? "Target reply" : "Target word"}
              </p>
              <p
                className={cn(
                  "mt-2 text-2xl font-semibold text-hunter-green",
                  !targetIsPhrase && "capitalize",
                )}
              >
                {assessment.targetText}
              </p>
              <p className="mt-2 text-sm leading-6 text-iron-grey">
                {assessment.ipaTarget}
              </p>
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Decoded phonemes</p>
              <p className="mt-2 text-lg font-semibold text-hunter-green break-words">
                {assessment.transcript}
              </p>
              <p className="mt-2 text-sm leading-6 text-iron-grey">
                The live model decode for this take is shown here directly.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[2rem] bg-vanilla-cream px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="eyebrow text-xs text-sage-green">Word feedback</p>
              <h3 className="text-2xl font-semibold text-hunter-green">
                See which parts of the reply landed cleanly.
              </h3>
              {replyAudioUrl ? (
                <p className="text-sm leading-6 text-iron-grey">
                  Tap a word to hear your recording for that part. Shift-click for the
                  reference voice.
                </p>
              ) : null}
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-hunter-green">
              {correctHighlights}/{assessment.highlights.length} strong words
            </div>
          </div>

          <div className="mt-4 rounded-3xl bg-white px-4 py-4">
            <SentenceFeedback
              highlights={assessment.highlights}
              instruct={instruct}
              onHighlightClick={handleHighlightClick}
              activeHighlightKey={activeHighlightKey}
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">At a glance</p>
              <p className="mt-2 text-sm leading-6 text-iron-grey">
                {correctHighlights} words were clean, {mixedHighlights} were close,
                and the rest need another pass.
              </p>
            </div>
            <div className="rounded-3xl bg-white px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Next cue</p>
              <p className="mt-2 text-sm leading-6 text-iron-grey">
                {assessment.nextStep}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showActions ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="ghost" onClick={onRetry} className="flex-1">
            Try Again
          </Button>
          <Button variant="primary" onClick={onNext} className="flex-1 text-white">
            {nextLabel}
          </Button>
        </div>
      ) : null}

      <div className="rounded-[2rem] bg-white px-5 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="eyebrow text-xs text-sage-green">Advanced breakdown</p>
            <h3 className="text-2xl font-semibold text-hunter-green">
              {showAdvanced
                ? "Phoneme detail is open."
                : "Open the phoneme grid only when you need it."}
            </h3>
          </div>
          <Button
            variant="ghost"
            onClick={() => setShowAdvanced((value) => !value)}
          >
            {showAdvanced ? "Hide breakdown" : "Show breakdown"}
          </Button>
        </div>

        {showAdvanced ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-6 text-iron-grey">
              Compare expected sounds with what the model heard.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
