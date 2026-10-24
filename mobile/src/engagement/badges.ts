// Badges: what they are, how far the learner is towards each, and which are
// newly earned. Computed from the learner's state, so a free account sees
// them from what this phone holds, and a Plus account from the synced detail
// (streaks and lessons come from the account's summary in every tier, grammar
// mastery and flashcards from the synced detail with Plus). Pure, so it is
// unit tested (tests/engagement.test.ts).
import { CEFR_LEVELS, type CefrLevel } from "../platform/content-model.ts";
import type { LearningState } from "../learning/state.ts";

export type BadgeGroup = "streak" | "lessons" | "levels" | "flashcards" | "practice" | "grammar";

export interface Badge {
  id: string;
  group: BadgeGroup;
  title: string;
  /** How to earn it, one short line. */
  detail: string;
  /** Progress towards it, `value` of `target`. */
  value: number;
  target: number;
  earned: boolean;
  /** When this phone first saw it earned. */
  earnedAt: number | null;
}

/** What the installed content packs say about each level and topic. */
export interface ContentFacts {
  /** Lesson ids per level, for the levels whose pack is on the phone. */
  lessonsByLevel: Partial<Record<CefrLevel, string[]>>;
  /** Grammar topics with their points. */
  topics: { id: string; title: string; grammarPointIds: string[] }[];
}

export const STREAK_BADGES = [7, 30, 100] as const;
export const CARD_BADGES = [100, 1000] as const;
/** A grammar point counts as mastered at this smoothed accuracy and attempt count. */
export const GRAMMAR_MASTER_EMA = 85;
export const GRAMMAR_MASTER_ATTEMPTS = 5;

export interface BadgeInput {
  state: LearningState;
  /** Longest streak, local or from the account. */
  bestStreak: number;
  facts: ContentFacts;
}

function lessonsDoneAt(state: LearningState, level: CefrLevel, ids: readonly string[] | undefined): number {
  const local = ids ? ids.filter((id) => id in state.lessons).length : 0;
  return Math.max(local, state.summary.lessonsCompleted[level] ?? 0);
}

export function buildBadges(input: BadgeInput): Badge[] {
  const { state, bestStreak, facts } = input;
  const earnedAt = (id: string) => state.activity.badges[id] ?? null;
  const badge = (b: Omit<Badge, "earned" | "earnedAt">): Badge => {
    const at = earnedAt(b.id);
    const earned = at !== null || b.value >= b.target;
    return { ...b, value: Math.min(b.value, b.target), earned, earnedAt: at };
  };

  const totalLessons = Math.max(
    Object.keys(state.lessons).length,
    CEFR_LEVELS.reduce((sum, level) => sum + (state.summary.lessonsCompleted[level] ?? 0), 0),
  );
  const recent = state.summary.recent;
  const perfect = state.activity.perfectQuizzes + (recent.some((r) => r.kind === "quiz" && r.score === 100) ? 1 : 0);
  const conversations = state.activity.conversations + (recent.some((r) => r.kind === "coach") ? 1 : 0);

  const list: Badge[] = [
    badge({ id: "first-lesson", group: "lessons", title: "First lesson", detail: "Finish any lesson.", value: totalLessons, target: 1 }),
    ...STREAK_BADGES.map((days) =>
      badge({ id: `streak-${days}`, group: "streak", title: `${days}-day streak`, detail: `Practise ${days} days in a row.`, value: bestStreak, target: days }),
    ),
    ...CEFR_LEVELS.flatMap((level) => {
      const ids = facts.lessonsByLevel[level];
      if (!ids || ids.length === 0) return [];
      return [badge({ id: `level-${level}`, group: "levels", title: `${level} complete`, detail: `Finish every ${level} lesson.`, value: lessonsDoneAt(state, level, ids), target: ids.length })];
    }),
    ...CARD_BADGES.map((cards) =>
      badge({ id: `cards-${cards}`, group: "flashcards", title: `${cards} cards`, detail: `Review ${cards} flashcards.`, value: state.activity.cardsReviewed, target: cards }),
    ),
    badge({ id: "perfect-quiz", group: "practice", title: "Perfect quiz", detail: "Get every answer right in a quiz.", value: perfect, target: 1 }),
    badge({ id: "first-conversation", group: "practice", title: "First conversation", detail: "Finish a coach conversation.", value: conversations, target: 1 }),
    ...facts.topics
      .filter((topic) => topic.grammarPointIds.length > 0)
      .map((topic) => {
        const mastered = topic.grammarPointIds.filter((id) => {
          const m = state.grammar[id];
          return m && m.attempts >= GRAMMAR_MASTER_ATTEMPTS && m.ema >= GRAMMAR_MASTER_EMA;
        }).length;
        return badge({
          id: `grammar-${topic.id}`,
          group: "grammar",
          title: `${topic.title} master`,
          detail: `Master every point in ${topic.title}.`,
          value: mastered,
          target: topic.grammarPointIds.length,
        });
      }),
  ];
  // Badges earned before (a level whose pack was removed, say) stay listed.
  const shown = new Set(list.map((b) => b.id));
  for (const [id, at] of Object.entries(state.activity.badges)) {
    if (!shown.has(id)) list.push({ id, group: "practice", title: fallbackTitle(id), detail: "Earned.", value: 1, target: 1, earned: true, earnedAt: at });
  }
  return list;
}

function fallbackTitle(id: string): string {
  const level = /^level-(\w\d)$/.exec(id);
  if (level) return `${level[1]} complete`;
  return id.replace(/^grammar-/, "").replace(/[-_.]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Badges that are earned now but not recorded yet: the ones to celebrate. */
export function newlyEarned(badges: readonly Badge[]): Badge[] {
  return badges.filter((b) => b.earned && b.earnedAt === null);
}

export function earnedCount(badges: readonly Badge[]): number {
  return badges.filter((b) => b.earned).length;
}

export const BADGE_GROUP_TITLES: Record<BadgeGroup, string> = {
  streak: "Streaks",
  lessons: "Lessons",
  levels: "Levels",
  flashcards: "Flashcards",
  practice: "Practice",
  grammar: "Grammar",
};
