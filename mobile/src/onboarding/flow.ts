// The first-run setup as data: which steps a person sees, in what order,
// what each answer means for the profile, and how a saved half-finished run
// is read back. One question a screen. Pure, so it is unit tested
// (tests/onboarding.test.ts); src/onboarding/store.ts persists it and
// src/components/onboarding/ draws it.
import type { PracticeCadence, PracticeFocus } from "../lib/profile.ts";
import { isCefrLevel, type CefrLevel } from "../platform/content-model.ts";
import { DEFAULT_DAILY_GOAL, isDailyGoal, type DailyGoal } from "../engagement/today.ts";

export const ONBOARDING_VERSION = 1;
export const INTRO_SLIDES = 3;

export type OnboardingStep = "welcome" | "goal" | "level" | "placement" | "minutes" | "reminders" | "where" | "account" | "paywall";

export type LearningGoal = "accent" | "grammar" | "fluency" | "exam" | "work";
export const LEARNING_GOALS: { value: LearningGoal; title: string; detail: string }[] = [
  { value: "accent", title: "A clearer accent", detail: "Sounds, stress and rhythm." },
  { value: "grammar", title: "Better grammar", detail: "Lessons and practice by level." },
  { value: "fluency", title: "Speaking fluency", detail: "Conversations that flow." },
  { value: "exam", title: "An English exam", detail: "Grammar, vocabulary and speaking." },
  { value: "work", title: "English for work", detail: "Meetings, interviews, emails." },
];

/** The self-check offers A2 to C2; complete beginners start at A1 through the quiz. */
export const SELF_CHECK_LEVELS: { value: CefrLevel; title: string; detail: string }[] = [
  { value: "A2", title: "A2 · Elementary", detail: "Simple everyday conversations." },
  { value: "B1", title: "B1 · Intermediate", detail: "Most everyday situations." },
  { value: "B2", title: "B2 · Upper intermediate", detail: "Work and complex topics." },
  { value: "C1", title: "C1 · Advanced", detail: "Fluent and flexible." },
  { value: "C2", title: "C2 · Proficient", detail: "Close to native." },
];

export type PracticePlace = "own" | "cloud";

export interface OnboardingAnswers {
  goal: LearningGoal | null;
  level: CefrLevel | null;
  /** Set when the placement quiz was taken. */
  placementLevel: CefrLevel | null;
  minutes: DailyGoal;
  remindersOn: boolean;
  /** Minutes after midnight. */
  reminderTime: number;
  place: PracticePlace | null;
}

export const DEFAULT_ANSWERS: OnboardingAnswers = {
  goal: null,
  level: null,
  placementLevel: null,
  minutes: DEFAULT_DAILY_GOAL,
  remindersOn: false,
  reminderTime: 19 * 60,
  place: null,
};

export interface OnboardingPosition {
  step: OnboardingStep;
  slide: number;
}

export interface FlowContext {
  /** Walking through again from Settings: no place, account or paywall. */
  replay: boolean;
  /** The build can use Cadence cloud at all. */
  cloudAvailable: boolean;
  /** The placement quiz was asked for on the level step. */
  wantsPlacement: boolean;
  place: PracticePlace | null;
  signedIn: boolean;
  plus: boolean;
}

/** The steps for this person, in order. */
export function onboardingSteps(ctx: FlowContext): OnboardingStep[] {
  const steps: OnboardingStep[] = ["welcome", "goal", "level"];
  if (ctx.wantsPlacement) steps.push("placement");
  steps.push("minutes", "reminders");
  if (ctx.replay) return steps;
  steps.push("where");
  if (ctx.cloudAvailable) steps.push("account");
  // Plus is offered only on the cloud path, to someone with an account who
  // does not have it. Never on your own server.
  if (ctx.cloudAvailable && ctx.place === "cloud" && ctx.signedIn && !ctx.plus) steps.push("paywall");
  return steps;
}

/** Steps with a safe default, so Skip is offered. */
export const SKIPPABLE: ReadonlySet<OnboardingStep> = new Set(["welcome", "goal", "level", "placement", "minutes"]);

/** The account step is optional on your own server and required for the cloud. */
export function accountOptional(place: PracticePlace | null): boolean {
  return place !== "cloud";
}

export function nextPosition(position: OnboardingPosition, steps: readonly OnboardingStep[], slides = INTRO_SLIDES): OnboardingPosition | null {
  if (position.step === "welcome" && position.slide + 1 < slides) return { step: "welcome", slide: position.slide + 1 };
  const index = steps.indexOf(position.step);
  const next = steps[index + 1];
  return next ? { step: next, slide: 0 } : null;
}

export function previousPosition(position: OnboardingPosition, steps: readonly OnboardingStep[], slides = INTRO_SLIDES): OnboardingPosition | null {
  if (position.step === "welcome") return position.slide > 0 ? { step: "welcome", slide: position.slide - 1 } : null;
  const index = steps.indexOf(position.step);
  const previous = steps[index - 1];
  if (!previous) return null;
  return previous === "welcome" ? { step: "welcome", slide: slides - 1 } : { step: previous, slide: 0 };
}

/** Skip on the welcome slides jumps past all of them. */
export function afterWelcome(steps: readonly OnboardingStep[]): OnboardingPosition | null {
  const next = steps[steps.indexOf("welcome") + 1];
  return next ? { step: next, slide: 0 } : null;
}

/** 1-based position for the progress bar; the slides count as one step. */
export function progressIndex(position: OnboardingPosition, steps: readonly OnboardingStep[]): number {
  return Math.max(1, steps.indexOf(position.step) + 1);
}

/** Where a saved run resumes: its step if this person still has it, else the nearest earlier one. */
export function resumePosition(saved: OnboardingPosition | null, steps: readonly OnboardingStep[]): OnboardingPosition {
  if (!saved) return { step: "welcome", slide: 0 };
  if (steps.includes(saved.step)) return saved.step === "welcome" ? { step: "welcome", slide: Math.max(0, Math.min(INTRO_SLIDES - 1, saved.slide)) } : { step: saved.step, slide: 0 };
  const order: OnboardingStep[] = ["welcome", "goal", "level", "placement", "minutes", "reminders", "where", "account", "paywall"];
  for (let i = order.indexOf(saved.step) - 1; i >= 0; i -= 1) if (steps.includes(order[i])) return { step: order[i], slide: 0 };
  return { step: "welcome", slide: 0 };
}

/** The web profile's focus for a goal, so both apps start in the same place. */
export function focusForGoal(goal: LearningGoal | null): PracticeFocus {
  switch (goal) {
    case "accent":
      return "vowels";
    case "work":
      return "work";
    case "fluency":
      return "conversations";
    default:
      return "daily";
  }
}

export function cadenceForMinutes(minutes: number): PracticeCadence {
  if (minutes <= 5) return "5-minutes";
  if (minutes <= 15) return "15-minutes";
  return "30-minutes";
}

/** The level practice starts at: the quiz's answer, else the self-check, else A1. */
export function startingLevel(answers: OnboardingAnswers): CefrLevel {
  return answers.placementLevel ?? answers.level ?? "A1";
}

const STEPS: readonly OnboardingStep[] = ["welcome", "goal", "level", "placement", "minutes", "reminders", "where", "account", "paywall"];

export interface StoredOnboarding {
  version: number;
  completedAt: number | null;
  position: OnboardingPosition | null;
  answers: OnboardingAnswers;
}

export function parseStoredOnboarding(raw: unknown): StoredOnboarding | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const a = (typeof o.answers === "object" && o.answers !== null ? o.answers : {}) as Record<string, unknown>;
  const p = (typeof o.position === "object" && o.position !== null ? o.position : null) as Record<string, unknown> | null;
  const minute = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 1440 ? v : DEFAULT_ANSWERS.reminderTime);
  return {
    version: ONBOARDING_VERSION,
    completedAt: typeof o.completedAt === "number" ? o.completedAt : null,
    position:
      p && STEPS.includes(p.step as OnboardingStep)
        ? { step: p.step as OnboardingStep, slide: typeof p.slide === "number" && p.slide >= 0 ? Math.floor(p.slide) : 0 }
        : null,
    answers: {
      goal: LEARNING_GOALS.some((g) => g.value === a.goal) ? (a.goal as LearningGoal) : null,
      level: isCefrLevel(a.level) ? a.level : null,
      placementLevel: isCefrLevel(a.placementLevel) ? a.placementLevel : null,
      minutes: isDailyGoal(a.minutes) ? a.minutes : DEFAULT_ANSWERS.minutes,
      remindersOn: a.remindersOn === true,
      reminderTime: minute(a.reminderTime),
      place: a.place === "own" || a.place === "cloud" ? a.place : null,
    },
  };
}
