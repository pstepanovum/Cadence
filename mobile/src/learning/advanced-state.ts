// The shape of the phone's advanced practice state and its parser, apart
// from the store so it can be tested without a device (tests/advanced.test.ts).
import { parseTrack, type Track } from "../platform/fossilization.ts";
import type { PracticeListItem } from "../platform/phrase-bank.ts";
import type { CardState } from "../platform/srs.ts";

export type StoredCard = CardState & { updatedAt: number };

export interface AdvancedState {
  cards: Record<string, StoredCard>;
  list: PracticeListItem[];
  track: Track | null;
  reviewsUpTo: number;
  removedRecordings: string[];
  syncedAt: number;
}

export const EMPTY_ADVANCED: AdvancedState = { cards: {}, list: [], track: null, reviewsUpTo: 0, removedRecordings: [], syncedAt: 0 };

export function parseAdvancedState(value: unknown): AdvancedState {
  if (!value || typeof value !== "object") return EMPTY_ADVANCED;
  const v = value as Partial<AdvancedState>;
  return {
    cards: v.cards && typeof v.cards === "object" ? v.cards : {},
    list: Array.isArray(v.list) ? v.list.filter((i) => i && typeof i.itemId === "string") : [],
    track: parseTrack(v.track ?? null),
    reviewsUpTo: Number(v.reviewsUpTo) || 0,
    removedRecordings: Array.isArray(v.removedRecordings) ? v.removedRecordings.slice(-1000) : [],
    syncedAt: Number(v.syncedAt) || 0,
  };
}

