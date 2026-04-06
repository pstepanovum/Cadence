// FILE: src/components/learn/PracticeLesson.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lesson, LessonWord } from "@/lib/learn";
import type { PronunciationAssessment } from "@/lib/pronunciation";
import { createPracticeSuccessAudio } from "@/lib/audio-feedback";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { LessonSummary } from "@/components/learn/LessonSummary";
import { WordQueue } from "@/components/learn/WordQueue";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface PracticeLessonProps {
  lesson: Lesson;
  moduleSlug: string;
}

type Phase = "recording" | "assessing" | "result" | "done";

export function PracticeLesson({ lesson, moduleSlug }: PracticeLessonProps) {
  const words = lesson.words;
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("recording");
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const sessionIdRef = useRef<string | null>(null);
  const successAudioRef = useRef<HTMLAudioElement | null>(null);

  const currentWord: LessonWord | undefined = words[wordIndex];

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

  useEffect(() => {
    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lesson.id, module_id: lesson.module_id }),
    })
      .then((response) => response.json())
      .then((data: { sessionId?: string }) => {
        sessionIdRef.current = data.sessionId ?? null;
      })
      .catch(() => {});
  }, [lesson.id, lesson.module_id]);

  useEffect(() => {
    successAudioRef.current = createPracticeSuccessAudio();

    return () => {
      successAudioRef.current?.pause();
      successAudioRef.current = null;
    };
  }, []);

  const endSession = useCallback(async (finalScores: number[], passed: boolean) => {
    if (!sessionIdRef.current) {
      return;
    }

    const avg = finalScores.length
      ? finalScores.reduce((sum, value) => sum + value, 0) / finalScores.length
      : 0;

    await fetch(`/api/sessions/${sessionIdRef.current}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ word_count: finalScores.length, avg_score: avg, passed }),
    }).catch(() => {});
  }, []);

  async function runAssessment(blob: Blob) {
    if (!currentWord) {
      return;
    }

    setPhase("assessing");
    setError(null);

    try {
      const formData = new FormData();
      formData.set("audio", blob, `${currentWord.word}-attempt.wav`);
      formData.set("text", currentWord.word);

      const response = await fetch("/api/assess", { method: "POST", body: formData });
      const payload = (await response.json()) as PronunciationAssessment | { error?: string };

      if (!response.ok || ("error" in payload && payload.error)) {
        throw new Error("error" in payload ? payload.error : "Assessment failed.");
      }

      const result = payload as PronunciationAssessment;
      setAssessment(result);
      setPhase("result");

      fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lesson_id: lesson.id,
          lesson_word_id: currentWord.id,
          word: currentWord.word,
          score: result.overallScore,
          ipa_target: currentWord.ipa,
          ipa_transcript: result.transcript,
          phoneme_detail: result,
          attempt_number: attemptNumber,
        }),
      }).catch(() => {});

      if (result.overallScore > 50) {
        successAudioRef.current?.play().catch(() => {});
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Assessment failed.");
      setPhase("recording");
    }
  }

  function handleRetry() {
    setAssessment(null);
    setError(null);
    setAttemptNumber((value) => value + 1);
    setPhase("recording");
  }

  function handleNext() {
    const nextScores = [...scores, assessment?.overallScore ?? 0];
    setScores(nextScores);
    setAssessment(null);
    setError(null);
    setAttemptNumber(1);

    if (wordIndex + 1 >= words.length) {
      void endSession(nextScores, true);
      setPhase("done");
      return;
    }

    setWordIndex((value) => value + 1);
    setPhase("recording");
  }

  function handleRetryLesson() {
    setWordIndex(0);
    setPhase("recording");
    setScores([]);
    setAssessment(null);
    setAttemptNumber(1);

    fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lesson_id: lesson.id, module_id: lesson.module_id }),
    })
      .then((response) => response.json())
      .then((data: { sessionId?: string }) => {
        sessionIdRef.current = data.sessionId ?? null;
      })
      .catch(() => {});
  }

  if (phase === "done") {
    return (
      <Card className="bg-white">
        <LessonSummary
          scores={scores}
          moduleSlug={moduleSlug}
          onRetry={handleRetryLesson}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Guided practice</p>
              <CardTitle className="text-4xl capitalize sm:text-5xl">
                {currentWord?.word}
              </CardTitle>
              <p className="text-lg text-iron-grey">{currentWord?.ipa}</p>
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Practice cue</p>
              <p className="mt-2 text-sm leading-7 text-iron-grey">
                Keep this take focused. Say the target word once, stop the
                recorder, and let the phoneme check show the exact mismatch to fix
                next.
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-white">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Round progress</p>
              <WordQueue total={words.length} current={wordIndex} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Current word</p>
                <p className="mt-2 text-2xl font-semibold capitalize text-hunter-green">
                  {wordIndex + 1}
                </p>
              </div>
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Attempts</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {attemptNumber}
                </p>
              </div>
              <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Left in lesson</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {Math.max(words.length - wordIndex - 1, 0)}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Card className="bg-bright-snow">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Recorder</p>
              <CardTitle className="text-2xl">
                Capture one steady pronunciation take.
              </CardTitle>
              <CardDescription>
                Use the reference playback if needed, then record the word once and
                send it straight into the assessment flow.
              </CardDescription>
            </div>

            <AudioRecorder
              targetWord={currentWord?.word}
              disabled={!engineReady || phase === "assessing"}
              onRecordingComplete={(blob) => void runAssessment(blob)}
              onClear={() => {
                setAssessment(null);
                setError(null);
              }}
            />

            {!engineReady ? (
              <div className="rounded-3xl bg-white px-4 py-4 text-sm leading-6 text-iron-grey">
                The pronunciation engine is warming up. Recording unlocks as soon
                as it is ready.
              </div>
            ) : null}

            {phase === "assessing" ? (
              <div className="rounded-3xl bg-white px-4 py-4 text-sm leading-6 text-hunter-green">
                Assessing the current take against the target phonemes.
              </div>
            ) : null}

            {error ? (
              <div className="rounded-3xl bg-blushed-brick px-4 py-4 text-sm leading-6 text-bright-snow">
                {error}
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="bg-white">
          {assessment ? (
            <AssessmentResult
              assessment={assessment}
              onRetry={handleRetry}
              onNext={handleNext}
              nextLabel={wordIndex + 1 >= words.length ? "Finish Lesson" : "Next Word"}
            />
          ) : (
            <div className="flex h-full min-h-[26rem] flex-col justify-center rounded-[2rem] bg-vanilla-cream px-5 py-5 text-center sm:px-6 sm:py-6">
              <CardTitle className="text-3xl">Ready for the first take.</CardTitle>
              <CardDescription className="mt-3">
                The assessment panel stays clear until a real pronunciation sample
                comes in from the recorder.
              </CardDescription>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
