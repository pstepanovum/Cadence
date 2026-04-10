import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { LessonSessionSummary, Stats, UserProgress } from "@/lib/learn";

export const LOCAL_LEARN_STATE_COOKIE = "cadence_local_learn_state";

const LOCAL_LEARN_STATE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type CookieValue = { value: string } | undefined;

type CookieReader = {
  get(name: string): CookieValue;
};

type CookieWriter = CookieReader & {
  set(
    name: string,
    value: string,
    options?: Record<string, unknown>,
  ): unknown;
};

type CompactModuleState = {
  u?: 1;
  c?: 1;
  b?: number;
  ua?: string;
  ca?: string;
};

type CompactLessonState = {
  a?: number;
  b?: number;
  p?: 1;
  u?: string;
};

type CompactPendingSession = {
  l: string;
  m: number;
  t: string;
};

type CompactStatsState = {
  a?: number;
  t?: number;
  d?: string[];
};

interface CompactLocalLearnState {
  v: 1;
  m: Record<string, CompactModuleState>;
  l: Record<string, CompactLessonState>;
  p: Record<string, CompactPendingSession>;
  s: CompactStatsState;
}

function createDefaultLearnState(): CompactLocalLearnState {
  const now = new Date().toISOString();

  return {
    v: 1,
    m: {
      "1": {
        u: 1,
        ua: now,
      },
    },
    l: {},
    p: {},
    s: {},
  };
}

export function parseLocalLearnState(
  value: string | null | undefined,
): CompactLocalLearnState {
  if (!value) {
    return createDefaultLearnState();
  }

  try {
    const parsed = JSON.parse(value) as Partial<CompactLocalLearnState> | null;
    const nextState = createDefaultLearnState();

    if (!parsed || typeof parsed !== "object") {
      return nextState;
    }

    nextState.m = sanitizeRecord(parsed.m);
    nextState.l = sanitizeRecord(parsed.l);
    nextState.p = sanitizeRecord(parsed.p);
    nextState.s =
      parsed.s && typeof parsed.s === "object"
        ? {
            a: typeof parsed.s.a === "number" ? parsed.s.a : undefined,
            t: typeof parsed.s.t === "number" ? parsed.s.t : undefined,
            d: Array.isArray(parsed.s.d)
              ? parsed.s.d.filter((value): value is string => typeof value === "string")
              : undefined,
          }
        : {};

    if (!nextState.m["1"]?.u) {
      nextState.m["1"] = {
        ...(nextState.m["1"] ?? {}),
        u: 1,
        ua: nextState.m["1"]?.ua ?? new Date().toISOString(),
      };
    }

    return nextState;
  } catch {
    return createDefaultLearnState();
  }
}

export function readLocalLearnStateFromCookies(cookieStore: CookieReader) {
  return parseLocalLearnState(cookieStore.get(LOCAL_LEARN_STATE_COOKIE)?.value);
}

export async function getLocalLearnState() {
  return readLocalLearnStateFromCookies(await cookies());
}

export function writeLocalLearnState(
  cookieStore: CookieWriter,
  state: CompactLocalLearnState,
) {
  cookieStore.set(LOCAL_LEARN_STATE_COOKIE, JSON.stringify(state), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: LOCAL_LEARN_STATE_COOKIE_MAX_AGE,
  });
}

export function getLocalModuleProgress(
  state: CompactLocalLearnState,
  moduleId: number,
): UserProgress | null {
  const entry = state.m[String(moduleId)];

  if (!entry) {
    return null;
  }

  return {
    is_unlocked: entry.u === 1,
    is_completed: entry.c === 1,
    best_exam_score: typeof entry.b === "number" ? entry.b : null,
    unlocked_at: entry.ua ?? null,
    completed_at: entry.ca ?? null,
  };
}

export function getLocalLessonSummary(
  state: CompactLocalLearnState,
  lessonSlug: string,
): LessonSessionSummary | null {
  const entry = state.l[lessonSlug];

  if (!entry || typeof entry.a !== "number" || entry.a <= 0) {
    return null;
  }

  return {
    session_id: null,
    attempt_count: entry.a,
    best_score: typeof entry.b === "number" ? entry.b : null,
    passed: entry.p === 1,
  };
}

export function recordLocalAttempt(
  state: CompactLocalLearnState,
  score: number,
): CompactLocalLearnState {
  const roundedScore = Math.round(score);

  return {
    ...state,
    s: {
      ...state.s,
      a: (state.s.a ?? 0) + 1,
      t: (state.s.t ?? 0) + roundedScore,
    },
  };
}

export function startLocalSession(
  state: CompactLocalLearnState,
  lessonSlug: string,
  moduleId: number,
) {
  const sessionId = `local-session-${randomUUID()}`;

  return {
    sessionId,
    state: {
      ...state,
      p: {
        ...state.p,
        [sessionId]: {
          l: lessonSlug,
          m: moduleId,
          t: new Date().toISOString(),
        },
      },
    },
  };
}

export function finishLocalSession(
  state: CompactLocalLearnState,
  sessionId: string,
  payload: { avgScore: number; passed: boolean },
): CompactLocalLearnState {
  const pendingSession = state.p[sessionId];

  if (!pendingSession) {
    return state;
  }

  const lessonState = state.l[pendingSession.l] ?? {};
  const roundedScore = Math.round(payload.avgScore);
  const bestScore = Math.max(roundedScore, lessonState.b ?? 0);
  const completedDay = pendingSession.t.slice(0, 10);
  const sessionDays = new Set(state.s.d ?? []);
  sessionDays.add(completedDay);

  const nextPending = { ...state.p };
  delete nextPending[sessionId];

  return {
    ...state,
    l: {
      ...state.l,
      [pendingSession.l]: {
        a: (lessonState.a ?? 0) + 1,
        b: bestScore,
        p: payload.passed || lessonState.p === 1 ? 1 : undefined,
        u: new Date().toISOString(),
      },
    },
    p: nextPending,
    s: {
      ...state.s,
      d: [...sessionDays]
        .sort((left, right) => right.localeCompare(left))
        .slice(0, 60),
    },
  };
}

export function updateLocalModuleExamProgress(
  state: CompactLocalLearnState,
  moduleId: number,
  examScore: number,
  totalModules: number,
) {
  const now = new Date().toISOString();
  const moduleKey = String(moduleId);
  const existing = state.m[moduleKey] ?? {};
  const passed = examScore >= 70;

  const nextState: CompactLocalLearnState = {
    ...state,
    m: {
      ...state.m,
      [moduleKey]: {
        u: 1,
        c: passed || existing.c === 1 ? 1 : undefined,
        b: Math.max(Math.round(examScore), existing.b ?? 0),
        ua: existing.ua ?? now,
        ca: passed ? existing.ca ?? now : existing.ca,
      },
    },
  };

  if (passed && moduleId < totalModules) {
    const nextModuleKey = String(moduleId + 1);
    const nextModuleState = nextState.m[nextModuleKey] ?? {};
    nextState.m[nextModuleKey] = {
      ...nextModuleState,
      u: 1,
      ua: nextModuleState.ua ?? now,
    };
  }

  return nextState;
}

export function getLocalStats(
  state: CompactLocalLearnState,
  modulesCompleted: number,
): Stats {
  const totalAttempts = state.s.a ?? 0;
  const totalScore = state.s.t ?? 0;

  return {
    total_attempts: totalAttempts,
    average_score:
      totalAttempts > 0 ? Math.round(totalScore / totalAttempts) : 0,
    modules_completed: modulesCompleted,
    current_streak_days: getCurrentStreakDays(state.s.d ?? []),
  };
}

function getCurrentStreakDays(days: string[]) {
  if (days.length === 0) {
    return 0;
  }

  const daySet = new Set(days);
  let streak = 0;
  const currentDay = new Date();

  while (streak < 60) {
    const probe = new Date(currentDay);
    probe.setDate(currentDay.getDate() - streak);
    const key = probe.toISOString().slice(0, 10);

    if (!daySet.has(key)) {
      break;
    }

    streak += 1;
  }

  return streak;
}

function sanitizeRecord<T>(value: unknown): Record<string, T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, T>>((accumulator, [key, entry]) => {
    accumulator[key] = entry as T;
    return accumulator;
  }, {});
}
