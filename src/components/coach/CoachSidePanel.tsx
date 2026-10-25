// FILE: src/components/coach/CoachSidePanel.tsx
"use client";

import type { RefObject } from "react";
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { Card } from "@/components/ui/card";
import { FreedomAssessmentPanel } from "@/components/coach/FreedomAssessmentPanel";
import type { AiCoachReplyMode, AiCoachTurn } from "@/lib/ai-coach";
import type { PronunciationAssessment } from "@/lib/pronunciation";

interface CoachSidePanelProps {
  currentTurn: AiCoachTurn | null;
  replyMode: AiCoachReplyMode;
  latestFreeTranscript: string | null;
  latestAssessment: PronunciationAssessment | null;
  resultPanelRef: RefObject<HTMLDivElement | null>;
  coachAudioError: string | null;
  error: string | null;
  isLoadingCoachAudio: boolean;
  onRetry: () => void;
  onContinue: () => void;
}

export function CoachSidePanel({
  currentTurn,
  replyMode,
  latestFreeTranscript,
  latestAssessment,
  resultPanelRef,
  coachAudioError,
  error,
  isLoadingCoachAudio,
  onRetry,
  onContinue,
}: CoachSidePanelProps) {
  return (
    <div className="self-start space-y-4 xl:sticky xl:top-6">
      <Card className="bg-white">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="eyebrow text-sm text-slate-grey">Reply flow</p>
            <h2 className="text-2xl font-semibold text-carbon-black">
              Keep the next turn and outcome in view.
            </h2>
          </div>

          {currentTurn ? (
            <>
              <div className="rounded-[20px] bg-page px-4 py-4">
                {replyMode === "target" ? (
                  <>
                    <p className="eyebrow text-xs text-slate-grey">Target reply</p>
                    <p className="mt-2 text-lg font-semibold leading-7 text-carbon-black">
                      {currentTurn.learnerReply}
                    </p>
                    <p className="mt-2 text-sm leading-6 text-iron-grey">
                      Repeat this exact line to get strict pronunciation scoring against the target.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="eyebrow text-xs text-slate-grey">Freedom mode</p>
                    <p className="mt-2 text-lg font-semibold leading-7 text-carbon-black">
                      Answer the coach naturally in your own words.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-iron-grey">
                      No suggested sentence is shown here. Cadence will transcribe what you
                      actually say and feed that back into the next coach turn.
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
            onRetry={onRetry}
            onNext={onContinue}
            nextLabel="Next coach reply"
            showActions={false}
          />
        </div>
      ) : null}

      {coachAudioError ? (
        <div className="rounded-[20px] bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
          {coachAudioError}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[20px] bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
          {error}
        </div>
      ) : null}

      {isLoadingCoachAudio ? (
        <div className="rounded-[20px] bg-white px-4 py-3 text-sm text-iron-grey">
          Coach audio is loading for the current turn.
        </div>
      ) : null}
    </div>
  );
}
