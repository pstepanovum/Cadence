"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SavedAiCoachSession } from "@/lib/ai-coach";
import {
  deleteSavedAiCoachSession,
  readSavedAiCoachSessions,
} from "@/lib/ai-coach-storage";

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function AiCoachHistory({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<SavedAiCoachSession[]>([]);

  useEffect(() => {
    setSessions(readSavedAiCoachSessions(userId));
  }, [userId]);

  function handleDeleteSession(sessionId: string) {
    const confirmed = window.confirm("Delete this saved conversation?");
    if (!confirmed) {
      return;
    }

    setSessions(deleteSavedAiCoachSession(userId, sessionId));
  }

  return (
    <div className="space-y-4">
      <Card className="bg-hunter-green text-bright-snow">
        <div className="space-y-3">
          <p className="eyebrow text-sm text-yellow-green">Coach history</p>
          <h1 className="text-4xl font-semibold text-bright-snow sm:text-5xl">
            Saved conversations you can reopen anytime.
          </h1>
          <p className="max-w-3xl text-base leading-7 text-bright-snow/78">
            Each saved thread stays local to this browser, so you can reopen a
            strong topic and continue speaking without rebuilding the whole flow.
          </p>
        </div>
      </Card>

      {sessions.length === 0 ? (
        <Card className="bg-white">
          <div className="space-y-3">
            <p className="eyebrow text-sm text-sage-green">No saved sessions</p>
            <h2 className="text-2xl font-semibold text-hunter-green">
              Start an AI Coach topic and it will appear here.
            </h2>
            <div>
              <Link href="/coach">
                <Button>Back to coach</Button>
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sessions.map((session) => (
            <Card key={session.id} className="bg-white">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="eyebrow text-xs text-sage-green">
                    {session.replyMode === "target" ? "Targeted mode" : "Freedom mode"}
                  </p>
                  <h2 className="text-2xl font-semibold text-hunter-green">
                    {session.topic}
                  </h2>
                  <p className="text-sm leading-6 text-iron-grey">
                    {session.turns.length} turns saved · {formatTimestamp(session.updatedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link href={`/coach?resume=${session.id}`}>
                    <Button>Resume in coach</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    onClick={() => handleDeleteSession(session.id)}
                  >
                    Delete conversation
                  </Button>
                  <Link href="/coach">
                    <Button variant="ghost">Back to coach</Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
