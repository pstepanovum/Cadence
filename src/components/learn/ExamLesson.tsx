// FILE: src/components/learn/ExamLesson.tsx
"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Lesson, LessonWord } from "@/lib/learn";
import type { PronunciationAssessment } from "@/lib/pronunciation";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { ExamResult } from "@/components/learn/ExamResult";
import { WordQueue } from "@/components/learn/WordQueue";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

interface ExamLessonProps {
  lesson: Lesson;
  moduleId: number;
  moduleSlug: string;
  nextModuleSlug: string | null;
}

type Phase = "recording" | "assessing" | "result" | "done";

export function ExamLesson({
  lesson,
  moduleId,
  moduleSlug,
  nextModuleSlug,
}: ExamLessonProps) {
  const router = useRouter();
  const words = lesson.words;
  const [wordIndex, setWordIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("recording");
  const [assessment, setAssessment] = useState<PronunciationAssessment | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [finalScore, setFinalScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const sessionIdRef = useRef<string | null>(null);

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

  function startSession() {
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

  useEffect(() => {
    startSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finishExam = useCallback(
    async (allScores: number[]) => {
      const avg = allScores.length
        ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
        : 0;

      setFinalScore(avg);

      if (sessionIdRef.current) {
        await fetch(`/api/sessions/${sessionIdRef.current}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            word_count: allScores.length,
            avg_score: avg,
            passed: avg >= 70,
          }),
        }).catch(() => {});
      }

      await fetch("/api/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module_id: moduleId, exam_score: avg }),
      }).catch(() => {});

      startTransition(() => {
        router.refresh();
      });

      setPhase("done");
    },
    [moduleId, router],
  );

  async function runAssessment(blob: Blob) {
    if (!currentWord) {
      return;
    }

    setPhase("assessing");
    setError(null);

    try {
      const formData = new FormData();
      formData.set("audio", blob, `${currentWord.word}-exam.wav`);
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
      void finishExam(nextScores);
      return;
    }

    setWordIndex((value) => value + 1);
    setPhase("recording");
  }

  function handleRetryExam() {
    setWordIndex(0);
    setPhase("recording");
    setScores([]);
    setAssessment(null);
    setAttemptNumber(1);
    setFinalScore(0);
    startSession();
  }

  if (phase === "done") {
    return (
      <Card className="bg-white">
        <ExamResult
          score={finalScore}
          moduleId={moduleId}
          moduleSlug={moduleSlug}
          nextModuleSlug={nextModuleSlug}
          onRetry={handleRetryExam}
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="bg-white">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-blushed-brick px-4 py-2 text-sm font-semibold text-bright-snow">
                Final exam
              </span>
              <span className="rounded-full bg-vanilla-cream px-4 py-2 text-sm font-semibold text-hunter-green">
                Pass mark 70+
              </span>
            </div>

            <div className="space-y-2">
              <p className="eyebrow text-sm text-blushed-brick">Current word</p>
              <CardTitle className="text-4xl capitalize sm:text-5xl">
                {currentWord?.word}
              </CardTitle>
              <p className="text-lg text-iron-grey">{currentWord?.ipa}</p>
            </div>

            <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
              <p className="eyebrow text-xs text-sage-green">Exam rule</p>
              <p className="mt-2 text-sm leading-7 text-iron-grey">
                Keep each take clean and direct. Cadence averages the full exam,
                and a passing score unlocks the next module in the route.
              </p>
            </div>
          </div>
        </Card>

        <Card className="bg-vanilla-cream">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="eyebrow text-sm text-sage-green">Exam progress</p>
              <WordQueue total={words.length} current={wordIndex} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl bg-white px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Word number</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {wordIndex + 1}
                </p>
              </div>
              <div className="rounded-3xl bg-white px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Attempts</p>
                <p className="mt-2 text-2xl font-semibold text-hunter-green">
                  {attemptNumber}
                </p>
              </div>
              <div className="rounded-3xl bg-white px-4 py-4">
                <p className="eyebrow text-xs text-sage-green">Words left</p>
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
                Send each exam word through one recorded take.
              </CardTitle>
              <CardDescription>
                Use the recorder once per pass, then move to the next word when
                the assessment is strong enough.
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
                Scoring the current exam take against the target phonemes.
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
              nextLabel={wordIndex + 1 >= words.length ? "Submit Exam" : "Next Word"}
            />
          ) : (
            <div className="flex h-full min-h-[26rem] flex-col justify-center rounded-[2rem] bg-vanilla-cream px-5 py-5 text-center sm:px-6 sm:py-6">
              <CardTitle className="text-3xl">Exam panel waiting.</CardTitle>
              <CardDescription className="mt-3">
                Each scored take appears here before you move on to the next exam
                word.
              </CardDescription>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
