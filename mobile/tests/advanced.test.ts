// The advanced material as the app ships it: every bundled phrase, slang
// entry and plateau error passes the shared validators, today's drill list
// and the plateau program build from the real packs, and the stored state
// parses back (src/learning/advanced-state.ts).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseAdvancedState, EMPTY_ADVANCED } from "../src/learning/advanced-state.ts";
import { dailyDrills, diagnose, diagnosticItems, startTrack, validateFossilError, type FossilError } from "../src/platform/fossilization.ts";
import { searchPhrases, validatePhrase, validateSlang, type Phrase, type SlangEntry } from "../src/platform/phrase-bank.ts";
import { buildPracticeDay } from "../src/platform/practice-day.ts";

const PACKS = join(import.meta.dirname, "../assets/packs");
const read = (id: string) => {
  const path = join(PACKS, id, "content.cpack");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
};

const phraseParts = existsSync(PACKS) ? readdirSync(PACKS).filter((id) => id.startsWith("phrases-")) : [];
const phrases: Phrase[] = phraseParts.flatMap((id) => read(id)?.phrases?.phrases ?? []);
const slang: SlangEntry[] = read("slang")?.slang?.entries ?? [];
const errors: FossilError[] = read("fossilization")?.fossilization?.errors ?? [];
const skip = phrases.length === 0 ? "advanced packs not bundled yet (npm run content:sync)" : false;

describe("bundled advanced packs", { skip }, () => {
  it("hold at least 3,000 valid phrases, 300 slang entries and 25 plateau errors", () => {
    assert.ok(phrases.length >= 3000, `${phrases.length} phrases`);
    assert.ok(slang.length >= 300, `${slang.length} slang entries`);
    assert.ok(errors.length >= 25, `${errors.length} errors`);
    assert.deepEqual(phrases.flatMap(validatePhrase), []);
    assert.deepEqual(slang.flatMap(validateSlang), []);
    assert.deepEqual(errors.flatMap(validateFossilError), []);
  });

  it("search finds a phrase and today's list builds from the real content", () => {
    assert.ok(searchPhrases(phrases, { query: phrases[0].text }).length > 0);
    const evidence = diagnosticItems(errors).map((item) => ({ errorId: item.errorId, day: "2026-10-20", source: "diagnostic" as const, ok: item.errorId.endsWith("s") }));
    const track = startTrack(diagnose(evidence), "2026-10-20");
    assert.ok(track.focus.length > 0);
    assert.ok(dailyDrills(track, errors, "2026-10-24").length > 0);
    const day = buildPracticeDay({ day: "2026-10-24", phrases, slang, cards: {}, list: [{ itemId: phrases[5].id, addedAt: 1, source: "device" }], track, catalog: errors });
    assert.equal(day.items[0].itemId, phrases[5].id);
    assert.ok(day.counts.new > 0 && day.counts.plateau > 0);
  });
});

describe("stored advanced state", () => {
  it("parses what it stored and survives junk", () => {
    const state = { ...EMPTY_ADVANCED, cards: { "phrase.x": { reps: 1, interval: 1, ease: 2.5, due: "2026-10-25", lapses: 0, updatedAt: 5 } }, list: [{ itemId: "phrase.x", addedAt: 1, source: "device" as const }], reviewsUpTo: 9, listDone: ["slang.bet"] };
    assert.deepEqual(parseAdvancedState(JSON.parse(JSON.stringify(state))), state);
    assert.deepEqual(parseAdvancedState("nope"), EMPTY_ADVANCED);
    assert.deepEqual(parseAdvancedState({ list: [null, { itemId: 3 }], track: { format: 7 } }).list, []);
    // A copy saved before removals were tracked reads with none pending.
    assert.deepEqual(parseAdvancedState({ list: [], listDone: [4, "phrase.y"] }).listDone, ["phrase.y"]);
    assert.deepEqual(parseAdvancedState({ list: [] }).listDone, []);
  });
});
