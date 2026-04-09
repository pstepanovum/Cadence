// FILE: src/components/audio/PracticeStudio.tsx
"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Activity } from "griddy-icons";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { createCorrectAudio, createIncorrectAudio } from "@/lib/audio-feedback";
import {
  type PronunciationAssessment,
  type PronunciationHighlight,
} from "@/lib/pronunciation";
import { cn } from "@/lib/utils";

interface PracticeStudioProps {
  targetWord: string;
  targetPhonemes: string;
  instruct?: string;
  onAssessmentComplete?: (assessment: PronunciationAssessment) => void;
}

function HighlightChip({ highlight }: { highlight: PronunciationHighlight }) {
  return (
    <div
      className={cn(
        "rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap",
        highlight.status === "correct"
          ? "bg-yellow-green text-hunter-green"
          : highlight.status === "mixed"
            ? "bg-[#efd889] text-hunter-green"
            : "bg-blushed-brick text-bright-snow",
      )}
      title={highlight.feedback}
    >
      {highlight.text}
    </div>
  );
}

export function PracticeStudio({
  targetWord,
  targetPhonemes,
  instruct,
  onAssessmentComplete,
}: PracticeStudioProps) {
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(
    null,
  );
  const [isAssessing, setIsAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const correctAudioRef = useRef<HTMLAudioElement | null>(null);
  const incorrectAudioRef = useRef<HTMLAudioElement | null>(null);

  const refreshEngineStatus = useEffectEvent(async () => {
    try {
      const response = await fetch("/api/assess", {
        method: "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        ready?: boolean;
      };

      setEngineReady(payload.ready === true);
    } catch {
      setEngineReady(false);
    }
  });

  useEffect(() => {
    void refreshEngineStatus();
  }, []);

  useEffect(() => {
    correctAudioRef.current = createCorrectAudio();
    incorrectAudioRef.current = createIncorrectAudio();

    return () => {
      correctAudioRef.current?.pause();
      correctAudioRef.current = null;
      incorrectAudioRef.current?.pause();
      incorrectAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (engineReady) {
      return;
    }

    const timer = window.setTimeout(() => {
      void refreshEngineStatus();
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [engineReady]);

  useEffect(() => {
    if (!assessment) {
      return;
    }

    const audio =
      assessment.overallScore > 50
        ? correctAudioRef.current
        : incorrectAudioRef.current;

    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, [assessment]);

  useEffect(() => {
    setAssessment(null);
    setError(null);
  }, [targetPhonemes, targetWord]);

  function handleClearTake() {
    setAssessment(null);
    setError(null);

    correctAudioRef.current?.pause();
    if (correctAudioRef.current) correctAudioRef.current.currentTime = 0;
    incorrectAudioRef.current?.pause();
    if (incorrectAudioRef.current) incorrectAudioRef.current.currentTime = 0;
  }

  async function runAssessment(blob: Blob) {
    if (!engineReady) {
      setError(
        "The pronunciation engine is still booting. Once it is ready, recording will unlock automatically.",
      );
      return;
    }

    setIsAssessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("audio", blob, `${targetWord.toLowerCase()}-attempt.wav`);
      formData.set("text", targetWord);

      const response = await fetch("/api/assess", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as
        | PronunciationAssessment
        | { error?: string };

      if (!response.ok || ("error" in payload && typeof payload.error === "string")) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Pronunciation assessment failed.",
        );
      }

      const result = payload as PronunciationAssessment;
      setAssessment(result);
      setEngineReady(true);
      onAssessmentComplete?.(result);
    } catch (nextError) {
      setAssessment(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Pronunciation assessment failed.",
      );
    } finally {
      setIsAssessing(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[0.94fr_1.06fr]">
      <Card className="bg-bright-snow">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-sage-green/15 px-4 py-2 text-sm font-medium text-sage-green">
              <Activity size={18} filled color="currentColor" />
              Practice studio
            </div>
            <h2 className="text-2xl font-semibold text-hunter-green sm:text-3xl">
              One clean take, then a direct phoneme check.
            </h2>
            <p className="max-w-2xl text-sm leading-7 text-iron-grey">
              Cadence compares the latest recording against the selected target
              and returns the live phoneme decode for that word.
            </p>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-5 py-5">
            <p className="eyebrow text-sm text-sage-green">Current target</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-2xl font-semibold text-hunter-green sm:text-3xl">
                  {targetWord}
                </p>
                <p className="mt-2 text-lg text-iron-grey">{targetPhonemes}</p>
              </div>
              <div className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-hunter-green">
                Live review
              </div>
            </div>
          </div>

          <AudioRecorder
            targetWord={targetWord}
            instruct={instruct}
            disabled={!engineReady || isAssessing}
            onRecordingComplete={(blob) => void runAssessment(blob)}
            onClear={handleClearTake}
          />

          {!engineReady ? (
            <p className="text-sm leading-7 text-iron-grey">
              The recorder unlocks automatically as soon as the session is ready.
            </p>
          ) : null}

          {error ? (
            <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
              {error}
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        {assessment ? (
          <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-2">
                <CardTitle>Pronunciation feedback</CardTitle>
                <CardDescription>
                  Live phoneme output from the FastAPI engine for the latest take.
                </CardDescription>
              </div>
              <div className="min-w-fit whitespace-nowrap rounded-full bg-vanilla-cream px-4 py-3 text-sm font-semibold text-hunter-green">
                Score {assessment.overallScore}/100
              </div>
            </div>

            <div className="rounded-full bg-platinum p-2">
              <div
                className="h-4 rounded-full bg-hunter-green"
                style={{ width: `${assessment.overallScore}%` }}
              />
            </div>

            <div className="rounded-3xl bg-vanilla-cream/90 p-5">
              <p className="eyebrow text-sm text-sage-green">
                Transcribed phonemes
              </p>
              <p className="mt-3 text-2xl font-semibold text-hunter-green">
                {assessment.transcript}
              </p>
              <p className="mt-2 text-sm text-iron-grey">
                Target phonemes: {assessment.ipaTarget}
              </p>
            </div>

            <div className="space-y-3">
              <p className="eyebrow text-sm text-sage-green">
                Letter highlights
              </p>
              <div className="flex flex-wrap gap-3">
                {assessment.highlights.map((highlight, index) => (
                  <HighlightChip
                    key={`${highlight.text}-${highlight.status}-${index}`}
                    highlight={highlight}
                  />
                ))}
              </div>
              <p className="text-sm leading-7 text-iron-grey">
                {assessment.summary}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {assessment.phonemes.map((phoneme, index) => (
                <div
                  key={`${phoneme.symbol}-${phoneme.expected}-${phoneme.heard}-${index}`}
                  className={cn(
                    "rounded-3xl p-4",
                    phoneme.status === "correct"
                      ? "bg-yellow-green/30 text-hunter-green"
                      : "bg-blushed-brick text-bright-snow",
                  )}
                >
                  <p className="eyebrow text-sm">{phoneme.symbol}</p>
                  <p className="mt-3 text-sm">
                    Expected {phoneme.expected}
                    <br />
                    Heard {phoneme.heard}
                  </p>
                  <p className="mt-3 text-lg font-semibold">
                    {phoneme.accuracy}%
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-bright-snow p-5">
              <p className="eyebrow text-sm text-sage-green">
                Next repetition cue
              </p>
              <p className="mt-3 text-base leading-7 text-iron-grey">
                {assessment.nextStep}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[18rem] flex-col justify-center rounded-3xl bg-vanilla-cream/70 p-6 text-center sm:min-h-[28rem]">
            <CardTitle>Ready for your first take</CardTitle>
            <CardDescription className="mt-3 text-base">
              Your latest pronunciation assessment appears here after the
              recorder captures a real take.
            </CardDescription>
          </div>
        )}
      </Card>
    </div>
  );
}
