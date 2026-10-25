// FILE: tests/platform/practice-day.test.ts
//
// Today's drill list across phrases, slang and the plateau track
// (src/lib/platform/practice-day.ts), and the steps of a spoken drill.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startTrack, type FossilError } from "../../src/lib/platform/fossilization.ts";
import type { Phrase, SlangEntry } from "../../src/lib/platform/phrase-bank.ts";
import { buildPracticeDay, spokenSteps } from "../../src/lib/platform/practice-day.ts";
import { review } from "../../src/lib/platform/srs.ts";

const phrase = (n: number, level: "B2" | "C1" | "C2" = "C1"): Phrase => ({
  id: `phrase.p${n}`,
  text: `phrase number ${n}`,
  kind: "chunk",
  form: `phrase number ${n}`,
  level,
  situations: ["meetings"],
  meaning: `Meaning ${n}.`,
  example: `This is phrase number ${n} in a sentence.`,
  plain: `This is plain ${n}.`,
  note: "Neutral.",
});
const phrases = Array.from({ length: 20 }, (_, i) => phrase(i, i < 10 ? "B2" : "C1"));
const slangEntry = { id: "slang.mid", term: "mid", meaning: "Average.", examples: ["The film was mid.", "Honestly mid."], usageNote: "Young, dismissive.", dated: false } as SlangEntry;
const error: FossilError = {
  id: "fossil.articles",
  area: "grammar",
  title: "Articles",
  what: "",
  summary: "",
  listenFor: "Listen for 'the' before general nouns.",
  grammarPointIds: [],
  soundIds: [],
  contrasts: [{ wrong: "The life is hard.", right: "Life is hard.", note: "General statement." }],
  drills: ["Life in a big city is expensive.", "Music helps me focus."],
  probes: [{ sentence: "The life is hard.", answers: ["Life is hard."] }],
  pairs: [],
  stress: [],
};
const DAY = "2026-10-24";

describe("today's drills", () => {
  it("lists assigned items first, then due reviews, new phrases at the learner's level, then plateau steps", () => {
    const cards = { "phrase.p3": review(undefined, "again", new Date(2026, 9, 22, 12)), "slang.mid": review(undefined, "good", new Date(2026, 9, 20, 12)) };
    const track = startTrack([{ errorId: error.id, misses: 4, hits: 0, missDays: 2, missRate: 1, persistent: true, severity: 2 }], "2026-10-20");
    const day = buildPracticeDay({ day: DAY, phrases, slang: [slangEntry], cards, list: [{ itemId: "phrase.p15", addedAt: 1, source: "connector" }], track, catalog: [error], levels: ["C1"] });
    assert.equal(day.items[0].itemId, "phrase.p15");
    assert.equal(day.items[0].reason, "assigned");
    assert.deepEqual(day.items.filter((i) => i.reason === "due").map((i) => i.itemId).sort(), ["phrase.p3", "slang.mid"]);
    const fresh = day.items.filter((i) => i.reason === "new");
    assert.equal(fresh.length, 5);
    assert.ok(fresh.every((i) => Number(i.itemId.slice(8)) >= 10), "new phrases come from the learner's level");
    assert.ok(day.items.some((i) => i.reason === "plateau" && i.tip.includes("The life is hard")));
    assert.equal(new Set(day.items.map((i) => i.itemId)).size, day.items.length);
    assert.deepEqual(buildPracticeDay({ day: DAY, phrases: [...phrases].reverse(), slang: [slangEntry], cards, list: [{ itemId: "phrase.p15", addedAt: 1, source: "connector" }], track, catalog: [error], levels: ["C1"] }).items.map((i) => i.itemId), day.items.map((i) => i.itemId));
  });

  it("skips an assigned item already reviewed and not yet due", () => {
    const cards = { "phrase.p1": review(undefined, "good", new Date(2026, 9, 24, 9)) };
    const day = buildPracticeDay({ day: DAY, phrases, slang: [], cards, list: [{ itemId: "phrase.p1", addedAt: 1, source: "device" }], track: null, catalog: [] });
    assert.ok(!day.items.some((i) => i.itemId === "phrase.p1"));
  });

  it("turns the list into numbered spoken steps", () => {
    const day = buildPracticeDay({ day: DAY, phrases, slang: [], cards: {}, list: [], track: null, catalog: [] });
    const steps = spokenSteps(day.items, 3);
    assert.deepEqual(steps.map((s) => [s.n, s.total]), [[1, 3], [2, 3], [3, 3]]);
    assert.ok(steps.every((s) => s.say.length > 0 && s.reps >= 2));
  });
});
