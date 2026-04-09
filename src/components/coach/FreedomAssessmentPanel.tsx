// FILE: src/components/coach/FreedomAssessmentPanel.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/learn/ProgressRing";
import type { PronunciationAssessment } from "@/lib/pronunciation";
import { cn } from "@/lib/utils";

function getHighlightStyles(status: PronunciationAssessment["highlights"][number]["status"]) {
  if (status === "correct") return "bg-yellow-green text-hunter-green";
  if (status === "mixed") return "bg-[#efd889] text-hunter-green";
  return "bg-blushed-brick text-bright-snow";
}

interface FreedomAssessmentPanelProps {
  transcript: string;
  assessment: PronunciationAssessment | null;
}

export function FreedomAssessmentPanel({ transcript, assessment }: FreedomAssessmentPanelProps) {
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

  const correctHighlights = assessment.highlights.filter((h) => h.status === "correct").length;
  const mixedHighlights = assessment.highlights.filter((h) => h.status === "mixed").length;

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
          <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">{transcript}</p>
          <p className="mt-2 text-sm leading-6 text-iron-grey">
            This is the word-level transcript from the freedom take.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Transcript-based pronunciation</p>
            <div className="mt-3 flex justify-center">
              <ProgressRing score={assessment.overallScore} size={88} strokeWidth={7} />
            </div>
          </div>

          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Pronunciation check</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey">{assessment.summary}</p>
            <p className="mt-3 text-sm font-semibold leading-6 text-hunter-green">{assessment.nextStep}</p>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
            <p className="eyebrow text-xs text-sage-green">Target reply</p>
            <p className="mt-2 text-lg font-semibold leading-7 text-hunter-green">{assessment.targetText}</p>
            <p className="mt-2 text-sm leading-6 text-iron-grey break-words">{assessment.ipaTarget}</p>
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
                className={cn("rounded-full px-3 py-1.5 text-sm font-semibold", getHighlightStyles(highlight.status))}
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
            <Button variant="ghost" onClick={() => setShowAdvanced((v) => !v)}>
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
