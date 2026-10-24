// The optional two-minute placement quiz in onboarding: twelve multiple-choice
// questions, two per CEFR level from A1 to C2, written for Cadence. Graded on
// the phone with the shared grader; the estimate is the highest level reached
// before two levels in a row go mostly wrong. Pure, so it is unit tested
// (tests/onboarding.test.ts). The spoken sample of the full placement test
// needs the AI engine and lives with the AI features, not here.
import { CEFR_LEVELS, type CefrLevel, type MultipleChoiceExercise } from "../platform/content-model.ts";

const q = (id: string, level: CefrLevel, question: string, options: string[], answer: number, explanation: string): MultipleChoiceExercise => ({
  id: `placement.${id}`,
  kind: "multiple_choice",
  level,
  grammarPointIds: [],
  prompt: "Choose the best answer.",
  question,
  options,
  answer,
  explanation,
});

export const PLACEMENT_QUESTIONS: MultipleChoiceExercise[] = [
  q("a1-1", "A1", "She ___ a teacher.", ["is", "are", "be", "am"], 0, "With he, she or it, use is."),
  q("a1-2", "A1", "There ___ two cups on the table.", ["is", "are", "has", "have"], 1, "Use there are with more than one thing."),
  q("a2-1", "A2", "I ___ to the cinema last weekend.", ["go", "have gone", "went", "was go"], 2, "A finished time in the past takes the past simple."),
  q("a2-2", "A2", "This box is ___ than that one.", ["heavy", "heavier", "more heavy", "heaviest"], 1, "Short adjectives ending in -y take -ier."),
  q("b1-1", "B1", "I've lived here ___ 2019.", ["for", "since", "from", "during"], 1, "Since goes with a starting point."),
  q("b1-2", "B1", "If it rains tomorrow, we ___ inside.", ["would stay", "will stay", "stayed", "had stayed"], 1, "A real future condition takes will in the result."),
  q("b2-1", "B2", "By the time we arrived, the film ___.", ["has already started", "had already started", "already starts", "will already start"], 1, "An action before another past action takes the past perfect."),
  q("b2-2", "B2", "She suggested ___ a taxi.", ["to take", "take", "taking", "that taking"], 2, "Suggest is followed by the -ing form."),
  q("c1-1", "C1", "___ had I sat down than the phone rang.", ["No sooner", "Hardly", "As soon", "Barely"], 0, "No sooner pairs with than, with the verb inverted."),
  q("c1-2", "C1", "The report, ___ findings surprised everyone, was published today.", ["which", "that", "whose", "who's"], 2, "Whose shows possession in a relative clause."),
  q("c2-1", "C2", "Little ___ that the decision would change everything.", ["they knew", "did they know", "they did know", "knew they"], 1, "After a negative adverb like little, the auxiliary comes first."),
  q("c2-2", "C2", "His explanation was so ___ that nobody could follow it.", ["convoluted", "concise", "candid", "cogent"], 0, "Convoluted means too complicated to follow."),
];

/** About ten seconds a question. */
export const PLACEMENT_MINUTES = 2;

/**
 * The estimated level from per-question scores (0 to 1, keyed by exercise id).
 * A level counts as reached when at least half its questions are right; the
 * estimate stops at the first level missed after which the next is missed too.
 */
export function placementLevel(scores: Readonly<Record<string, number>>): CefrLevel {
  let reached: CefrLevel = "A1";
  let misses = 0;
  for (const level of CEFR_LEVELS) {
    const items = PLACEMENT_QUESTIONS.filter((item) => item.level === level);
    const right = items.reduce((sum, item) => sum + ((scores[item.id] ?? 0) >= 1 ? 1 : 0), 0);
    if (items.length > 0 && right / items.length >= 0.5) {
      reached = level;
      misses = 0;
    } else {
      misses += 1;
      if (misses >= 2) break;
    }
  }
  return reached;
}

/** Score of a finished quiz, 0 to 100. */
export function placementScore(scores: Readonly<Record<string, number>>): number {
  const total = PLACEMENT_QUESTIONS.reduce((sum, item) => sum + (scores[item.id] ?? 0), 0);
  return Math.round((total / PLACEMENT_QUESTIONS.length) * 100);
}
