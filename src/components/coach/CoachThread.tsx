// FILE: src/components/coach/CoachThread.tsx
"use client";

import { ArrowRight, Pause, Play } from "griddy-icons";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { AiCoachPhase, AiCoachReplyMode, AiCoachTurn } from "@/lib/ai-coach";
import type { PronunciationAssessment } from "@/lib/pronunciation";

function formatReplySentence(assessment: PronunciationAssessment) {
  return assessment.highlights.map((h) => h.text).join(" ");
}

interface CoachThreadProps {
  turns: AiCoachTurn[];
  currentTurn: AiCoachTurn | null;
  phase: AiCoachPhase;
  replyMode: AiCoachReplyMode;
  recorderVersion: number;
  instruct: string;
  recorderDisabled: boolean;
  activeCoachTurnId: string | null;
  activeReplyTurnId: string | null;
  latestAssessment: PronunciationAssessment | null;
  latestFreeTranscript: string | null;
  canContinue: boolean;
  onToggleCoachMessage: (turn: AiCoachTurn) => void;
  onToggleReplyAudio: (turn: AiCoachTurn) => void;
  onRecordingComplete: (blob: Blob) => void;
  onClearReply: () => void;
  onRetry: () => void;
  onContinue: () => void;
}

export function CoachThread({
  turns,
  currentTurn,
  phase,
  replyMode,
  recorderVersion,
  instruct,
  recorderDisabled,
  activeCoachTurnId,
  activeReplyTurnId,
  latestAssessment,
  latestFreeTranscript,
  canContinue,
  onToggleCoachMessage,
  onToggleReplyAudio,
  onRecordingComplete,
  onClearReply,
  onRetry,
  onContinue,
}: CoachThreadProps) {
  return (
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
                {/* Coach bubble */}
                <div className="flex justify-start">
                  <div className="max-w-[88%] rounded-[1.9rem] bg-vanilla-cream px-4 py-4 sm:px-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="eyebrow text-xs text-sage-green">Coach</p>
                        <p className="text-base leading-7 text-hunter-green">{turn.coachMessage}</p>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-10 w-10 shrink-0 rounded-full px-0"
                        onClick={() => onToggleCoachMessage(turn)}
                        aria-label={isCoachActive ? "Pause coach message" : "Play coach message"}
                      >
                        {isCoachActive ? (
                          <Pause size={16} filled color="currentColor" />
                        ) : (
                          <Play size={16} filled color="currentColor" />
                        )}
                      </Button>
                    </div>
                    {isCurrent ? (
                      <p className="mt-2 text-xs font-semibold text-sage-green">
                        {phase === "coach" ? "Current coach message" : "Coach message complete"}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Learner bubble */}
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
                          onClick={() => onToggleReplyAudio(turn)}
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
                <h2 className="text-xl font-semibold text-hunter-green">Next reply</h2>
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
              key={
                currentTurn
                  ? `${currentTurn.id}-${recorderVersion}-${replyMode}`
                  : `idle-${recorderVersion}-${replyMode}`
              }
              targetWord={replyMode === "target" ? currentTurn?.learnerReply : undefined}
              instruct={instruct}
              disabled={recorderDisabled}
              onRecordingComplete={(blob) => onRecordingComplete(blob)}
              onClear={onClearReply}
            />

            <div className="flex flex-wrap justify-center gap-3 border-t border-hunter-green/10 pt-4">
              <Button
                variant="ghost"
                onClick={onRetry}
                disabled={
                  !currentTurn ||
                  phase === "assessing" ||
                  (!latestAssessment && !latestFreeTranscript)
                }
              >
                Try again
              </Button>
              <Button onClick={onContinue} disabled={!canContinue}>
                <ArrowRight size={16} color="currentColor" />
                {phase === "continuing" ? "Loading next reply..." : "Next coach reply"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
