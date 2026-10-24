// FILE: src/components/learn-hub/srs.ts
//
// The web's flashcard scheduler is the shared one (src/lib/platform/srs.ts,
// docs/PLATFORM.md section 2), so a card reviewed on the web and on the phone
// is scheduled the same way. This module keeps the web's import path and its
// queue helper; tests/platform/drift.test.ts fails on a second scheduler.
import { planSession, type CardState } from "../../lib/platform/srs.ts";

export * from "../../lib/platform/srs.ts";

/** Today's queue: every due card (oldest due first), then up to `newLimit` new ones. */
export function buildQueue(cardIds: readonly string[], states: Readonly<Record<string, CardState>>, now: Date, newLimit = 10): string[] {
  return planSession(cardIds, states, now, { newLimit, reviewLimit: Number.POSITIVE_INFINITY }).ids;
}
