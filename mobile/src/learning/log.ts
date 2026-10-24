// Records a finished practice that is not a content-pack session (a word
// game, a coach chat, a pronunciation module) so it counts towards the daily
// goal, the streak and the summary like any other.
import { useState } from "react";

import { finishSession, type FinishedSession } from "@/learning/state";
import { today, updateLearning } from "@/learning/store";

export function logPractice(session: Omit<FinishedSession, "minutes"> & { minutes: number }): void {
  const now = new Date();
  updateLearning((state) => finishSession(state, session, now.getTime(), today(now)).state);
}

/** Minutes since the screen opened, for logPractice. */
export function useSessionClock(): () => number {
  const [startedAt] = useState(() => Date.now());
  return () => Math.max(1, (Date.now() - startedAt) / 60_000);
}
