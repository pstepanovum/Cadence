// FILE: src/components/conversation/ConversationFlowCard.tsx
import { Pause, Play } from "griddy-icons";
import { AudioRecorder } from "@/components/audio/AudioRecorder";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { PronunciationAssessment, PronunciationHighlight } from "@/lib/pronunciation";
import type { ConversationModule } from "@/lib/conversation";
import type { Phase, CoachAudioState, TurnResponse } from "@/components/conversation/ConversationSession";

function getHighlightStyles(status: PronunciationHighlight["status"]) {
  if (status === "correct") return "bg-yellow-green text-hunter-green";
  if (status === "mixed") return "bg-[#efd889] text-hunter-green";
  return "bg-blushed-brick text-bright-snow";
}

function ReplyWordFeedback({
  highlights,
  className,
  turnId,
  audioUrl,
  activeWordKey,
  onWordClick,
}: {
  highlights: PronunciationHighlight[];
  className?: string;
  turnId: string;
  audioUrl: string | null;
  activeWordKey: string | null;
  onWordClick: (
    turnId: string,
    audioUrl: string,
    highlight: PronunciationHighlight,
    index: number,
  ) => void;
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-2 gap-y-2", className)}>
      {highlights.map((highlight, index) => {
        const wordKey = `${turnId}:${index}`;
        const playable = Boolean(audioUrl);
        return (
          <button
            type="button"
            key={`${highlight.text}-${highlight.status}-${index}`}
            disabled={!playable}
            className={cn(
              "appearance-none border-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors",
              getHighlightStyles(highlight.status),
              playable ? "cursor-pointer" : "cursor-default opacity-80",
              activeWordKey === wordKey && "brightness-95",
            )}
            title={
              playable
                ? `${highlight.feedback} Tap to hear your recording for this word.`
                : highlight.feedback
            }
            onClick={() => {
              if (audioUrl) onWordClick(turnId, audioUrl, highlight, index);
            }}
          >
            {highlight.text}
          </button>
        );
      })}
    </div>
  );
}

function getEngineMessage(ready: boolean, phase: Phase, coachAudioError: string | null) {
  if (!ready) {
    return "The pronunciation engine is warming up. You can still listen to the coach while the model finishes loading.";
  }
  if (phase === "coach") {
    return coachAudioError
      ? "Coach voice is unavailable for this turn. You can replay the message or continue with the written prompt."
      : "The coach speaks first. Recording unlocks as soon as the first message finishes.";
  }
  if (phase === "recording") {
    return "Your turn is live. Record one clean reply, then let Cadence score the pronunciation before the next coach message.";
  }
  if (phase === "assessing") {
    return "Cadence is scoring your reply against the expected sentence and phoneme path.";
  }
  if (phase === "result") {
    return "Review the feedback, then move to the next turn when the score feels strong enough.";
  }
  return "Start the conversation to hear the first coach message and unlock the first spoken reply.";
}

interface ConversationFlowCardProps {
  phase: Phase;
  engineReady: boolean;
  coachAudioState: CoachAudioState;
  coachAudioError: string | null;
  visibleTurns: ConversationModule["turns"];
  responses: TurnResponse[];
  turnIndex: number;
  moduleLength: number;
  currentTurn: ConversationModule["turns"][number];
  activeCoachTurnId: string | null;
  activeReplyTurnId: string | null;
  activeReplyWordKey: string | null;
  assessment: PronunciationAssessment | null;
  error: string | null;
  hasStarted: boolean;
  instruct: string;
  onStartConversation: () => void;
  onPlayCoachMessage: (turn: ConversationModule["turns"][number], unlockOnEnd: boolean) => void;
  onContinueToReply: () => void;
  onPlayReplyAudio: (turnId: string, audioUrl: string | null) => void;
  onPlayReplyWord: (
    turnId: string,
    audioUrl: string,
    highlight: PronunciationHighlight,
    index: number,
  ) => void;
  onRecordingComplete: (blob: Blob) => void;
  onClearRecording: () => void;
  onRetry: () => void;
  onNext: () => void;
}

export function ConversationFlowCard({
  phase,
  engineReady,
  coachAudioState,
  coachAudioError,
  visibleTurns,
  responses,
  turnIndex,
  moduleLength,
  currentTurn,
  activeCoachTurnId,
  activeReplyTurnId,
  activeReplyWordKey,
  assessment,
  error,
  hasStarted,
  instruct,
  onStartConversation,
  onPlayCoachMessage,
  onContinueToReply,
  onPlayReplyAudio,
  onPlayReplyWord,
  onRecordingComplete,
  onClearRecording,
  onRetry,
  onNext,
}: ConversationFlowCardProps) {
  return (
    <Card className="bg-white">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="eyebrow text-sm text-sage-green">Conversation flow</p>
          <CardTitle className="text-2xl">
            A real back-and-forth, one spoken reply at a time.
          </CardTitle>
          <CardDescription>
            The coach opens the turn, you answer clearly, and Cadence scores
            the reply before the next message starts.
          </CardDescription>
        </div>

        <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <p className="eyebrow text-xs text-sage-green">Turn status</p>
              <p className="text-lg font-semibold text-hunter-green">
                {phase === "intro"
                  ? "Start the chat."
                  : phase === "coach"
                    ? "Coach turn in progress."
                    : phase === "recording"
                      ? "Your reply is live."
                      : phase === "assessing"
                        ? "Scoring your reply."
                        : "Feedback is ready."}
              </p>
              <p className="max-w-2xl text-sm leading-6 text-iron-grey">
                {getEngineMessage(engineReady, phase, coachAudioError)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {phase === "intro" ? (
                <Button variant="primary" className="text-white" onClick={onStartConversation}>
                  Start conversation
                </Button>
              ) : (
                <Button
                  variant={phase === "coach" ? "primary" : "ghost"}
                  className={phase === "coach" ? "text-white" : undefined}
                  onClick={() => onPlayCoachMessage(currentTurn, phase === "coach")}
                >
                  {activeCoachTurnId === currentTurn.id ? (
                    <Pause size={16} filled color="currentColor" />
                  ) : (
                    <Play size={16} filled color="currentColor" />
                  )}
                  {coachAudioState === "loading" || coachAudioState === "playing"
                    ? "Playing coach..."
                    : activeCoachTurnId === currentTurn.id
                      ? "Pause coach"
                      : phase === "coach"
                        ? "Play coach message"
                        : "Replay coach message"}
                </Button>
              )}

              {phase === "coach" && coachAudioError ? (
                <Button variant="ghost" onClick={onContinueToReply}>
                  Continue to my reply
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {visibleTurns.length === 0 ? (
            <div className="rounded-[1.75rem] bg-bright-snow px-4 py-5 text-center">
              <p className="eyebrow text-xs text-sage-green">Ready state</p>
              <p className="mt-2 text-lg font-semibold text-hunter-green">
                Click start to hear the first coach line.
              </p>
            </div>
          ) : (
            visibleTurns.map((turn, index) => {
              const response = responses[index];
              const isCurrent = index === turnIndex;

              return (
                <div key={turn.id} className="space-y-3">
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-[1.75rem] bg-vanilla-cream px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="eyebrow text-xs text-sage-green">Coach</p>
                        <Button
                          variant="ghost"
                          className="min-h-8 px-3 py-2 text-xs"
                          onClick={() => onPlayCoachMessage(turn, false)}
                        >
                          {activeCoachTurnId === turn.id ? (
                            <Pause size={14} filled color="currentColor" />
                          ) : (
                            <Play size={14} filled color="currentColor" />
                          )}
                          {activeCoachTurnId === turn.id ? "Pause" : "Play"}
                        </Button>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-hunter-green">
                        {turn.coachMessage}
                      </p>
                      {isCurrent ? (
                        <p className="mt-2 text-xs font-semibold text-sage-green">
                          {phase === "coach"
                            ? coachAudioState === "playing"
                              ? "Speaking now"
                              : "Current coach message"
                            : "Coach message complete"}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div
                      className={cn(
                        "max-w-[85%] rounded-[1.75rem] px-4 py-4",
                        response
                          ? "bg-hunter-green text-bright-snow"
                          : "bg-bright-snow text-hunter-green",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p
                          className={cn(
                            "eyebrow text-xs",
                            response ? "text-yellow-green/84" : "text-sage-green",
                          )}
                        >
                          You
                        </p>
                        {response?.audioUrl ? (
                          <Button
                            variant="ghost"
                            className="min-h-8 bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/15 hover:text-white"
                            onClick={() => onPlayReplyAudio(response.turnId, response.audioUrl)}
                          >
                            {activeReplyTurnId === response.turnId ? (
                              <Pause size={14} filled color="currentColor" />
                            ) : (
                              <Play size={14} filled color="currentColor" />
                            )}
                            {activeReplyTurnId === response.turnId ? "Pause" : "Play"}
                          </Button>
                        ) : null}
                      </div>
                      {response ? (
                        <div className="mt-2 space-y-2">
                          <p className="text-xs font-semibold text-yellow-green/84">
                            Your scored reply
                          </p>
                          <p className="text-xs leading-5 text-yellow-green/70">
                            Tap a word to hear that part of your recording.
                          </p>
                          <ReplyWordFeedback
                            highlights={response.highlights}
                            className="text-left"
                            turnId={response.turnId}
                            audioUrl={response.audioUrl}
                            activeWordKey={activeReplyWordKey}
                            onWordClick={onPlayReplyWord}
                          />
                        </div>
                      ) : (
                        <p className="mt-2 text-sm font-semibold leading-6">
                          {turn.expectedResponse}
                        </p>
                      )}
                      {response ? (
                        <p className="mt-3 text-xs font-semibold text-yellow-green">
                          Score {response.score}/100
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {hasStarted ? (
          <AudioRecorder
            key={currentTurn.id}
            targetWord={currentTurn.expectedResponse}
            instruct={instruct}
            disabled={!engineReady || phase !== "recording"}
            onRecordingComplete={(blob) => onRecordingComplete(blob)}
            onClear={onClearRecording}
          />
        ) : null}

        {assessment ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="ghost" onClick={onRetry} className="flex-1">
              Try Again
            </Button>
            <Button
              variant="primary"
              onClick={onNext}
              className="flex-1 text-white"
            >
              {turnIndex + 1 >= moduleLength ? "Finish Module" : "Next Reply"}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-3xl bg-blushed-brick px-4 py-4 text-sm leading-6 text-bright-snow">
            {error}
          </div>
        ) : null}

        {coachAudioError && phase !== "coach" ? (
          <div className="rounded-3xl bg-blushed-brick px-4 py-4 text-sm leading-6 text-bright-snow">
            {coachAudioError}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
