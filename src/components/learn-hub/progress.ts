// FILE: src/components/learn-hub/progress.ts
//
// Practice progress kept on this device (localStorage), in every mode: the
// summary (progress-model.ts) and flashcard states. For a signed-in account
// each activity is also sent to POST /api/sync/summary, which keeps the free
// tier's one summary document; detailed sync for Plus is the server's
// /api/sync/push. An activity that could not be sent waits (at most 50) and
// goes with the next one. A 401, 403 or 404 means this browser is not syncing
// an account, so nothing is queued.
"use client";

import { useMemo } from "react";
import { cloudFetch } from "@/hooks/cloud-fetch";
import { notifyStored, useStoredString } from "@/hooks/use-stored";
import { applyActivity, emptySummary, type Activity, type ActivityKind, type ProgressSummary } from "@/lib/platform/progress-model.ts";
import type { CefrLevel } from "@/lib/platform/content-model.ts";
import { dayKey, type CardState } from "@/components/learn-hub/srs";

const SUMMARY_KEY = "cadence.summary.v1";
const QUEUE_KEY = "cadence.summary.queue.v1";
const SRS_KEY = "cadence.srs.v1";
const MAX_QUEUE = 50;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full; practice still works this session.
  }
  notifyStored();
}

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** The device's summary, live; empty until anything is practised. */
export function useSummary(): ProgressSummary {
  const raw = useStoredString(SUMMARY_KEY);
  return useMemo(() => parse(raw, emptySummary()), [raw]);
}

export function useCardStates(): Record<string, CardState> {
  const raw = useStoredString(SRS_KEY);
  return useMemo(() => parse<Record<string, CardState>>(raw, {}), [raw]);
}

export function loadSummary(): ProgressSummary {
  return read<ProgressSummary>(SUMMARY_KEY, emptySummary());
}

export function loadCardStates(): Record<string, CardState> {
  return read<Record<string, CardState>>(SRS_KEY, {});
}

export function saveCardState(cardId: string, state: CardState) {
  write(SRS_KEY, { ...loadCardStates(), [cardId]: state });
}

export interface ActivityInput {
  kind: ActivityKind;
  refId: string;
  level: CefrLevel | null;
  /** 0-100, or null. */
  score: number | null;
  minutes: number;
  completedLesson?: boolean;
}

export function logActivity(input: ActivityInput): ProgressSummary {
  const now = new Date();
  const activity: Activity = { ...input, minutes: Math.max(0, Math.round(input.minutes)), day: dayKey(now), at: now.getTime() };
  const summary = applyActivity(loadSummary(), activity);
  write(SUMMARY_KEY, summary);
  const queue = [...read<Activity[]>(QUEUE_KEY, []), activity].slice(-MAX_QUEUE);
  write(QUEUE_KEY, queue);
  void flush();
  return summary;
}

let flushing = false;

async function flush() {
  if (flushing) return;
  const queue = read<Activity[]>(QUEUE_KEY, []);
  if (queue.length === 0) return;
  flushing = true;
  try {
    const response = await cloudFetch("/api/sync/summary", { method: "POST", json: { activities: queue } });
    if (response.ok || [401, 403, 404, 405].includes(response.status)) {
      const remaining = read<Activity[]>(QUEUE_KEY, []).filter((a) => !queue.some((q) => q.at === a.at && q.refId === a.refId));
      write(QUEUE_KEY, remaining);
    }
  } catch {
    // Offline: try again with the next activity.
  } finally {
    flushing = false;
  }
}
