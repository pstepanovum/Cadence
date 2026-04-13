// FILE: src/components/coach/CoachSetupCard.tsx
"use client";

import { ArrowRight } from "griddy-icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AiCoachPhase, AiCoachReplyMode, AiCoachStatusPayload } from "@/lib/ai-coach";
import { cn } from "@/lib/utils";

const TOPIC_SUGGESTIONS = [
  "Describing my role at work",
  "Talking about skiing",
  "Giving product feedback",
  "Explaining a weekend trip",
];

interface CoachSetupCardProps {
  topicDraft: string;
  onTopicDraftChange: (value: string) => void;
  sessionTopic: string;
  phase: AiCoachPhase;
  replyMode: AiCoachReplyMode;
  onReplyModeChange: (mode: AiCoachReplyMode) => void;
  coachStatus: AiCoachStatusPayload | null;
  engineReady: boolean;
  transcriptionReady: boolean;
  transcriptionError: string | null;
  error: string | null;
  turnsCount: number;
  startDisabled: boolean;
  startHelperMessage: string | null;
  onStart: () => void;
  onReset: () => void;
  /** Local mode: show coach/engine warmup tiles. Cloud: omit for a simpler paid experience. */
  showEngineDiagnostics?: boolean;
}

export function CoachSetupCard({
  topicDraft,
  onTopicDraftChange,
  sessionTopic,
  phase,
  replyMode,
  onReplyModeChange,
  coachStatus,
  engineReady,
  transcriptionReady,
  transcriptionError,
  error,
  turnsCount,
  startDisabled,
  startHelperMessage,
  onStart,
  onReset,
  showEngineDiagnostics = true,
}: CoachSetupCardProps) {
  // Active session: show compact card with current topic and reset action only.
  if (turnsCount > 0 && sessionTopic) {
    return (
      <Card className="bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="eyebrow text-sm text-sage-green">Active session</p>
            <p className="text-lg font-semibold text-hunter-green">{sessionTopic}</p>
          </div>
          <Button variant="ghost" onClick={onReset}>
            New conversation
          </Button>
        </div>
      </Card>
    );
  }

  // Empty / setup state: full form.
  return (
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
            <span className="eyebrow block text-xs text-sage-green">Topic or situation</span>
            <Input
              className="rounded-full border border-hunter-green/10 bg-vanilla-cream px-5"
              value={topicDraft}
              onChange={(e) => onTopicDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !startDisabled) {
                  e.preventDefault();
                  onStart();
                }
              }}
              placeholder="Example: describing my job, asking for travel advice, talking about skiing"
              disabled={phase === "starting" || phase === "continuing"}
            />
          </label>
          <Button onClick={onStart} disabled={startDisabled}>
            <ArrowRight size={16} color="currentColor" />
            {phase === "starting" ? "Starting..." : "Start coach"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {TOPIC_SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full bg-vanilla-cream px-3 py-2 text-sm font-semibold text-hunter-green transition-colors hover:bg-[#eadfbe]"
              onClick={() => onTopicDraftChange(suggestion)}
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
                onClick={() => onReplyModeChange("target")}
              >
                Targeted
              </Button>
              <Button
                variant={replyMode === "freedom" ? "primary" : "ghost"}
                className={cn(replyMode === "freedom" && "text-white")}
                onClick={() => onReplyModeChange("freedom")}
              >
                Freedom
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-3xl bg-blushed-brick px-4 py-3 text-sm text-bright-snow">
            {error}
          </div>
        ) : startHelperMessage ? (
          <div className="rounded-3xl bg-vanilla-cream px-4 py-3 text-sm text-iron-grey">
            {startHelperMessage}
          </div>
        ) : null}

        {showEngineDiagnostics ? (
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
        ) : null}
      </div>
    </Card>
  );
}
