// FILE: mobile/src/platform/goals.ts
//
// What a learner is working towards, asked on the first-run setup ("What
// brings you to Cadence?") on the phone and the web. A learner picks one or
// more; the account keeps them as `learningGoals`, an array, beside the older
// single `practiceFocus`, which is still written (derived from the goals) for
// app builds that only know that field. Pure: the profile validator, the
// onboarding flow, the daily plan and the suggestions all read it.
//
// Twin: src/lib/platform/goals.ts, byte-identical below this header,
// checked by tests/platform/drift.test.ts.

/** Every goal, in the order the setup lists them: the advanced ones first. */
export const LEARNING_GOAL_VALUES = ["plateau", "natural", "accent", "work", "exam", "grammar", "fluency"] as const;
export type LearningGoal = (typeof LEARNING_GOAL_VALUES)[number];

export const LEARNING_GOALS: readonly { value: LearningGoal; title: string; detail: string }[] = [
  { value: "plateau", title: "Break a plateau", detail: "Persistent errors you no longer notice." },
  { value: "natural", title: "Sound natural", detail: "Idioms, phrasal verbs and current slang." },
  { value: "accent", title: "Accent clarity", detail: "Sounds, stress, rhythm and intonation." },
  { value: "work", title: "Work and meetings", detail: "Meetings, presentations, interviews." },
  { value: "exam", title: "IELTS or TOEFL", detail: "Speaking and writing to a target band." },
  { value: "grammar", title: "Grammar precision", detail: "The slips that remain at C1 and C2." },
  { value: "fluency", title: "Fluent conversation", detail: "Longer turns, fewer pauses." },
];

/** The older single focus field, kept on the account for builds that predate goals. */
export const PRACTICE_FOCUS_VALUES = ["conversations", "vowels", "work", "daily", "grammar", "exam"] as const;
export type PracticeFocus = (typeof PRACTICE_FOCUS_VALUES)[number];

export function isLearningGoal(value: unknown): value is LearningGoal {
  return LEARNING_GOAL_VALUES.includes(value as LearningGoal);
}

/**
 * Goals out of anything stored: an array, or a single goal from before the
 * question allowed several. Unknown values are dropped, duplicates removed,
 * and the result is in the setup's order, so equal choices compare equal.
 */
export function parseGoals(raw: unknown): LearningGoal[] {
  const values = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw];
  const chosen = new Set(values.filter(isLearningGoal));
  return LEARNING_GOAL_VALUES.filter((goal) => chosen.has(goal));
}

/** Adds or removes one goal, keeping the setup's order. */
export function toggleGoal(goals: readonly LearningGoal[], goal: LearningGoal): LearningGoal[] {
  return goals.includes(goal) ? goals.filter((g) => g !== goal) : parseGoals([...goals, goal]);
}

export function sameGoals(a: readonly LearningGoal[], b: readonly LearningGoal[]): boolean {
  return a.length === b.length && a.every((goal, i) => goal === b[i]);
}

/** An account from before goals existed: its single focus as a goal. */
export function goalsFromFocus(focus: unknown): LearningGoal[] {
  switch (focus) {
    case "vowels":
      return ["accent"];
    case "work":
      return ["work"];
    case "conversations":
    case "daily":
      return ["fluency"];
    case "grammar":
      return ["grammar"];
    case "exam":
      return ["exam"];
    default:
      return [];
  }
}

/** The stored goals, else the ones the older focus implies. */
export function resolveGoals(stored: unknown, focus: unknown): LearningGoal[] {
  const goals = parseGoals(stored);
  return goals.length ? goals : goalsFromFocus(focus);
}

const FOCUS_FOR_GOAL: Record<LearningGoal, PracticeFocus> = {
  plateau: "vowels",
  accent: "vowels",
  natural: "conversations",
  fluency: "conversations",
  work: "work",
  exam: "exam",
  grammar: "grammar",
};

/** The single focus older builds read: the first chosen goal's, else conversations. */
export function focusForGoals(goals: readonly LearningGoal[]): PracticeFocus {
  const first = parseGoals(goals)[0];
  return first ? FOCUS_FOR_GOAL[first] : "conversations";
}

/** What the goals ask the daily plan and the suggestions to put first. */
export interface GoalEmphasis {
  /** Sounds, stress and shadowing. */
  sounds: boolean;
  /** Grammar points. */
  grammar: boolean;
  /** Phrases, idioms and slang. */
  phrases: boolean;
  /** Talking: the coach and scenarios. */
  conversation: boolean;
}

export function goalEmphasis(goals: readonly LearningGoal[]): GoalEmphasis {
  const has = (...wanted: LearningGoal[]) => wanted.some((goal) => goals.includes(goal));
  return {
    sounds: has("accent", "plateau"),
    grammar: has("grammar", "exam", "plateau"),
    phrases: has("natural", "work"),
    conversation: has("fluency", "work", "exam"),
  };
}
