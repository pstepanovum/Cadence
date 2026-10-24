// FILE: src/components/learn-hub/sync-logic.ts
//
// The pure half of the web's progress sync (sync.ts does the storage and the
// requests). Bodies have the same shape the phone sends
// (mobile/src/learning/state.ts, pushPayloads and remoteFromPull), so the
// server keeps one deck per account whichever device a card was reviewed on.
// tests/web/sync-logic.test.ts runs them through the server's validators.
import type { CardState } from "../../lib/platform/srs.ts";

/** A card state as stored and synced: the shared CardState plus when it changed. */
export type SyncedCard = CardState & { updatedAt: number };

/** Cards added through the MCP connector, kept on this browser. */
export interface CustomCard {
  id: string;
  front: string;
  back: string;
  example?: string;
  addedAt: number;
}

export interface SyncMarks {
  uid: string | null;
  importedAt: number | null;
  pushedAt: number;
  pullCursor: string | null;
}

export const EMPTY_MARKS: SyncMarks = { uid: null, importedAt: null, pushedAt: 0, pullCursor: null };

/** At most this many cards per request, as the server allows. */
export const MAX_CARDS_PER_PUSH = 2000;
export const MAX_CUSTOM_CARDS = 500;

/** The server keeps device-learned cards and added cards in separate deck documents. */
export function deckFor(cardId: string): "custom" | "cards" {
  return cardId.startsWith("card.custom.") || cardId.startsWith("card.mcp.") ? "custom" : "cards";
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function cleanCard(card: Partial<SyncedCard>): SyncedCard | null {
  const { reps, interval, ease, due, lapses, updatedAt } = card;
  if (![reps, interval, ease, lapses, updatedAt].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  if (typeof due !== "string" || due.length > 10) return null;
  return { reps: reps!, interval: interval!, ease: ease!, due, lapses: lapses!, updatedAt: updatedAt! };
}

/** Cards changed after `since`. A card from before sync existed counts as changed at 0. */
export function cardsSince(states: Readonly<Record<string, Partial<SyncedCard>>>, since: number): Record<string, SyncedCard> {
  const out: Record<string, SyncedCard> = {};
  for (const [id, raw] of Object.entries(states)) {
    const card = cleanCard({ ...raw, updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : since === 0 ? 1 : 0 });
    if (card && card.updatedAt > since) out[id] = card;
  }
  return out;
}

/** /api/sync/push (and /import) bodies for these cards, split to fit the server's cap. */
export function pushBodies(installId: string, cards: Readonly<Record<string, SyncedCard>>) {
  const entries = Object.entries(cards);
  const bodies: { installId: string; platform: "web"; srs: Record<string, Record<string, SyncedCard>>; attempts: never[]; mastery: { sounds: Record<string, never>; grammar: Record<string, never> } }[] = [];
  for (let start = 0; start === 0 || start < entries.length; start += MAX_CARDS_PER_PUSH) {
    const srs: Record<string, Record<string, SyncedCard>> = {};
    for (const [id, card] of entries.slice(start, start + MAX_CARDS_PER_PUSH)) srs[deckFor(id)] = { ...srs[deckFor(id)], [id]: card };
    bodies.push({ installId, platform: "web", srs, attempts: [], mastery: { sounds: {}, grammar: {} } });
  }
  return bodies;
}

/** GET /api/sync/pull merged into this browser's cards, last writer wins. */
export function mergePulledCards(local: Readonly<Record<string, Partial<SyncedCard>>>, pulled: unknown): { cards: Record<string, Partial<SyncedCard>>; changed: number; cursor: string | null } {
  const body = isObject(pulled) ? pulled : {};
  const cards: Record<string, Partial<SyncedCard>> = { ...local };
  let changed = 0;
  for (const deck of Object.values(isObject(body.srs) ? body.srs : {})) {
    if (!isObject(deck)) continue;
    for (const [id, raw] of Object.entries(deck)) {
      const card = isObject(raw) ? cleanCard(raw as Partial<SyncedCard>) : null;
      if (!card) continue;
      if ((local[id]?.updatedAt ?? 0) >= card.updatedAt) continue;
      cards[id] = card;
      changed += 1;
    }
  }
  const cursor = body.cursor;
  return { cards, changed, cursor: typeof cursor === "number" && Number.isFinite(cursor) ? String(cursor) : typeof cursor === "string" && cursor ? cursor : null };
}

/** Inbox cards (from the MCP connector) added once each, matched by their front. */
export function addInboxCards(existing: readonly CustomCard[], inbox: unknown, at: number): { cards: CustomCard[]; added: number; ackIds: string[] } {
  const items = Array.isArray(inbox) ? inbox : [];
  const known = new Set(existing.map((card) => card.front.trim().toLowerCase()));
  const added: CustomCard[] = [];
  const ackIds: string[] = [];
  for (const item of items) {
    if (!isObject(item)) continue;
    if (typeof item.id === "string") ackIds.push(item.id);
    const front = typeof item.front === "string" ? item.front.trim() : "";
    const back = typeof item.back === "string" ? item.back.trim() : "";
    if (!front || !back || known.has(front.toLowerCase())) continue;
    known.add(front.toLowerCase());
    added.push({
      id: `card.custom.${at.toString(36)}-${existing.length + added.length}`,
      front: front.slice(0, 240),
      back: back.slice(0, 240),
      ...(typeof item.example === "string" && item.example.trim() ? { example: item.example.trim().slice(0, 240) } : {}),
      addedAt: at,
    });
  }
  return { cards: [...existing, ...added].slice(-MAX_CUSTOM_CARDS), added: added.length, ackIds };
}

/** Marks for this account: a different account on the same browser starts its own sync. */
export function marksFor(stored: SyncMarks | null, uid: string): SyncMarks {
  return stored && stored.uid === uid ? stored : { ...EMPTY_MARKS, uid };
}
