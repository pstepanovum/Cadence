// The flashcard deck for a level: the pack's cards plus the learner's own
// (added through the MCP connector or by hand), scheduled with the same SRS.
import { flashcards } from "../content/catalog.ts";
import type { CefrLevel, FlashcardExercise, PackContent } from "../platform/content-model.ts";
import { planSession, summarizeDeck } from "../games/srs.ts";
import type { LearningState } from "./state.ts";

export function deckFor(pack: PackContent | null, state: LearningState, level: CefrLevel): FlashcardExercise[] {
  const own: FlashcardExercise[] = state.customCards.map((card) => ({
    id: card.id,
    kind: "flashcard",
    level,
    grammarPointIds: [],
    prompt: "Your card",
    front: card.front,
    back: card.back,
    ...(card.example ? { example: { text: card.example, source: { kind: "generated" as const } } } : {}),
  }));
  return [...own, ...(pack ? flashcards(pack) : [])];
}

/** Today's cards: everything due, then a few new ones. */
export function todaysCards(deck: readonly FlashcardExercise[], state: LearningState, now: Date): FlashcardExercise[] {
  const plan = planSession(
    deck.map((card) => card.id),
    state.cards,
    now,
  );
  const byId = new Map(deck.map((card) => [card.id, card]));
  return plan.ids.map((id) => byId.get(id)!).filter(Boolean);
}

export function deckSummary(deck: readonly FlashcardExercise[], state: LearningState, now: Date) {
  return summarizeDeck(
    deck.map((card) => card.id),
    state.cards,
    now,
  );
}
