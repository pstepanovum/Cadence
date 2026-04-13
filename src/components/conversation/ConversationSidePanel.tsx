// FILE: src/components/conversation/ConversationSidePanel.tsx
import { AssessmentResult } from "@/components/learn/AssessmentResult";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import type { PronunciationAssessment } from "@/lib/pronunciation";
import type { Phase } from "@/components/conversation/ConversationSession";

interface ConversationSidePanelProps {
  assessment: PronunciationAssessment | null;
  phase: Phase;
  turnIndex: number;
  moduleLength: number;
  /** Object URL for the take being scored; enables per-word playback in word feedback. */
  replyAudioUrl: string | null;
  onRetry: () => void;
  onNext: () => void;
}

export function ConversationSidePanel({
  assessment,
  phase,
  turnIndex,
  moduleLength,
  replyAudioUrl,
  onRetry,
  onNext,
}: ConversationSidePanelProps) {
  return (
    <Card className="self-start bg-white xl:sticky xl:top-6">
      {assessment ? (
        <AssessmentResult
          assessment={assessment}
          replyAudioUrl={replyAudioUrl}
          onRetry={onRetry}
          onNext={onNext}
          showActions={false}
          nextLabel={turnIndex + 1 >= moduleLength ? "Finish Module" : "Next Reply"}
        />
      ) : (
        <div className="flex h-full min-h-[20rem] flex-col justify-center rounded-[2rem] bg-vanilla-cream px-5 py-5 text-center sm:min-h-[30rem] sm:px-6 sm:py-6">
          <CardTitle className="text-3xl">
            {phase === "intro"
              ? "Conversation feedback appears here."
              : phase === "coach"
                ? "Coach turn is active."
                : phase === "recording"
                  ? "Your reply is next."
                  : "Scoring in progress."}
          </CardTitle>
          <CardDescription className="mt-3">
            {phase === "intro"
              ? "Start the module to hear the first coach line, then answer one turn at a time."
              : phase === "coach"
                ? "Listen to the coach message first. Once that turn finishes, the recorder unlocks automatically."
                : phase === "recording"
                  ? "Record one clear answer. Cadence will score the sentence before the next coach message."
                  : "Cadence is comparing your live phoneme decode against the target sentence now."}
          </CardDescription>
        </div>
      )}
    </Card>
  );
}
