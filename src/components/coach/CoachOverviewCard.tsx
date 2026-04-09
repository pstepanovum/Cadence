// FILE: src/components/coach/CoachOverviewCard.tsx
import Link from "next/link";
import { Microphone } from "griddy-icons";
import { Card } from "@/components/ui/card";
import { ProgressRing } from "@/components/learn/ProgressRing";
import type { AiCoachTurn, SavedAiCoachSession } from "@/lib/ai-coach";

interface CoachOverviewCardProps {
  completedTurns: AiCoachTurn[];
  averageScore: number;
  savedSessions: SavedAiCoachSession[];
}

export function CoachOverviewCard({ completedTurns, averageScore, savedSessions }: CoachOverviewCardProps) {
  return (
    <Card className="bg-hunter-green text-bright-snow">
      <div className="grid gap-5 lg:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-yellow-green">
            <Microphone size={18} filled color="currentColor" />
            <span className="eyebrow text-sm">AI Coach</span>
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-semibold text-bright-snow sm:text-4xl lg:text-5xl">
              Open-topic speaking practice with a live pronunciation coach.
            </h1>
            <p className="max-w-3xl text-base leading-7 text-bright-snow/78">
              Pick any topic, let the coach open the exchange, then switch between
              strict target scoring and open freedom replies as the conversation unfolds.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="rounded-3xl bg-white/10 px-4 py-4">
            <p className="eyebrow text-xs text-yellow-green/82">Turns scored</p>
            <p className="mt-2 text-2xl font-semibold text-bright-snow">
              {completedTurns.length}
            </p>
          </div>

          <div className="rounded-3xl bg-white/10 px-4 py-4">
            <p className="eyebrow text-xs text-yellow-green/82">Average score</p>
            <div className="mt-2 flex items-center gap-3">
              <ProgressRing
                score={averageScore}
                size={52}
                strokeWidth={5}
                valueLabel={completedTurns.length === 0 ? "0" : `${averageScore}`}
                trackColor="rgba(255,255,255,0.18)"
                className="[&_span]:text-bright-snow shrink-0"
              />
              <p className="hidden text-sm leading-6 text-bright-snow/78 lg:block">
                Keep the conversation moving and the score climbs with each stronger reply.
              </p>
            </div>
          </div>

          <div className="col-span-2 rounded-3xl bg-white/10 px-4 py-4 lg:col-span-1">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <p className="eyebrow text-xs text-yellow-green/82">Saved conversations</p>
                <p className="text-2xl font-semibold text-bright-snow">{savedSessions.length}</p>
                <p className="hidden text-sm leading-6 text-bright-snow/78 sm:block">
                  Restore any recent coach session and keep going from where you left it.
                </p>
              </div>
              <Link
                href="/coach/history"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-yellow-green/10 px-4 py-2 text-sm font-semibold transition-colors hover:bg-yellow-green/20"
              >
                See more
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
