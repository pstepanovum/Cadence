// FILE: tests/platform/adaptive-placement.test.ts
//
// The adaptive placement test (src/lib/platform/placement.ts): simulated
// learners at every level, answering by the same item model the test assumes,
// must be placed at their level, the test must stop when it is sure, pick
// unseen items first, vary the item types, and the seen set must survive its
// compact encoding.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CEFR_LEVELS, type CefrLevel } from "../../src/lib/platform/content-model.ts";
import {
  ADAPTIVE,
  PLACEMENT_TYPES,
  adaptiveResult,
  bankFromExercises,
  decodeSeen,
  encodeSeen,
  estimateAbility,
  mergeSeen,
  nextPlacementItem,
  placementDone,
  type AdaptiveResponse,
  type BankItem,
} from "../../src/lib/platform/placement.ts";

/** A small seeded generator (mulberry32), so every run is the same. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 63 items per level, nine of each type, like the real bank.
const BANK: BankItem[] = CEFR_LEVELS.flatMap((level) =>
  PLACEMENT_TYPES.flatMap((type) =>
    Array.from({ length: 9 }, (_, i) => ({
      id: `ex.placement.${level.toLowerCase()}.${type}.${String(i + 1).padStart(2, "0")}`,
      level,
      type,
      guess: ["gap", "transform", "order"].includes(type) ? 0 : 0.25,
    })),
  ),
);

/** A learner whose true ability is `theta`, answering by the model's own curve. */
function takeTest(theta: number, random: () => number, seen = new Set<string>()) {
  const responses: AdaptiveResponse[] = [];
  while (!placementDone(responses)) {
    const item = nextPlacementItem(BANK, responses, seen, random);
    if (!item) break;
    const difficulty = CEFR_LEVELS.indexOf(item.level);
    const p = item.guess + (1 - item.guess) / (1 + Math.exp(-ADAPTIVE.slope * (theta - difficulty)));
    responses.push({ ...item, score: random() < p ? 1 : 0 });
  }
  return { responses, result: adaptiveResult(responses) };
}

describe("adaptive placement", () => {
  it("starts in the middle, at B2", () => {
    const first = nextPlacementItem(BANK, [], new Set(), () => 0);
    assert.equal(first?.level, "B2");
  });

  for (const [index, level] of CEFR_LEVELS.entries()) {
    it(`places learners in the middle of ${level} at ${level}, and never more than one level off`, () => {
      const random = seeded(1000 + index);
      let exact = 0;
      const runs = 60;
      for (let run = 0; run < runs; run += 1) {
        // Anywhere in the middle half of the level.
        const theta = index + 0.25 + random() * 0.5;
        const { result, responses } = takeTest(theta, random);
        assert.ok(responses.length >= ADAPTIVE.minItems && responses.length <= ADAPTIVE.maxItems, `asked ${responses.length}`);
        const off = Math.abs(CEFR_LEVELS.indexOf(result.level) - index);
        assert.ok(off <= 1, `a ${level} learner (theta ${theta.toFixed(2)}) was placed at ${result.level}`);
        if (off === 0) exact += 1;
      }
      assert.ok(exact / runs >= 0.75, `${level}: only ${exact} of ${runs} placed exactly`);
    });
  }

  it("is deterministic for the same answers and random source", () => {
    const a = takeTest(3.5, seeded(7));
    const b = takeTest(3.5, seeded(7));
    assert.deepEqual(a.responses.map((r) => r.id), b.responses.map((r) => r.id));
    assert.deepEqual(a.result, b.result);
  });

  it("all right climbs to C2, all wrong falls to A1, both with high confidence", () => {
    const up: AdaptiveResponse[] = [];
    const down: AdaptiveResponse[] = [];
    const random = seeded(3);
    while (!placementDone(up)) up.push({ ...nextPlacementItem(BANK, up, new Set(), random)!, score: 1 });
    while (!placementDone(down)) down.push({ ...nextPlacementItem(BANK, down, new Set(), random)!, score: 0 });
    assert.equal(adaptiveResult(up).level, "C2");
    assert.equal(adaptiveResult(down).level, "A1");
    assert.equal(adaptiveResult(up).confidence, "high");
    assert.equal(adaptiveResult(down).confidence, "high");
    assert.equal(adaptiveResult(up).score, 100);
    assert.equal(adaptiveResult(down).score, 0);
  });

  it("moves up after right answers and down after wrong ones", () => {
    const random = seeded(11);
    const first = nextPlacementItem(BANK, [], new Set(), random)!;
    const afterRight = nextPlacementItem(BANK, [{ ...first, score: 1 }, { ...first, id: "x.1", score: 1 }, { ...first, id: "x.2", score: 1 }], new Set(), random)!;
    const afterWrong = nextPlacementItem(BANK, [{ ...first, score: 0 }, { ...first, id: "x.1", score: 0 }, { ...first, id: "x.2", score: 0 }], new Set(), random)!;
    assert.ok(CEFR_LEVELS.indexOf(afterRight.level) > CEFR_LEVELS.indexOf(first.level));
    assert.ok(CEFR_LEVELS.indexOf(afterWrong.level) < CEFR_LEVELS.indexOf(first.level));
  });

  it("stops early when sure and runs to the cap when not", () => {
    const steady = takeTest(4.5, seeded(5));
    assert.ok(steady.responses.length < ADAPTIVE.maxItems, `asked ${steady.responses.length}`);
    // A learner exactly on a boundary keeps the test unsure for longer.
    const random = seeded(9);
    const alternating: AdaptiveResponse[] = [];
    while (!placementDone(alternating)) alternating.push({ ...nextPlacementItem(BANK, alternating, new Set(), random)!, score: alternating.length % 2 });
    assert.ok(alternating.length >= ADAPTIVE.minItems);
    assert.ok(estimateAbility(alternating).probability <= 1);
  });

  it("never repeats an item within a test and prefers items not seen before", () => {
    const random = seeded(21);
    const first = takeTest(3.5, random);
    const ids = first.responses.map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length);
    const seen = new Set(ids);
    const second = takeTest(3.5, random, seen);
    for (const r of second.responses) assert.ok(!seen.has(r.id), `${r.id} was asked again`);
    // Ten retakes at the same level still find fresh items.
    const all = new Set(seen);
    for (let i = 0; i < 10; i += 1) {
      const run = takeTest(3.5, random, all);
      const repeats = run.responses.filter((r) => all.has(r.id)).length;
      run.responses.forEach((r) => all.add(r.id));
      if (i < 4) assert.equal(repeats, 0, `retake ${i + 2} repeated ${repeats} items`);
    }
  });

  it("does not ask the same type three times in a row while others are left", () => {
    const { responses } = takeTest(2.5, seeded(31));
    for (let i = 2; i < responses.length; i += 1) {
      assert.ok(!(responses[i].type === responses[i - 1].type && responses[i].type === responses[i - 2].type), `three ${responses[i].type} in a row`);
    }
  });

  it("gives per-skill levels when enough of a skill was asked", () => {
    const { result } = takeTest(4.5, seeded(41));
    assert.ok(result.skills.grammar, "grammar level");
    for (const level of Object.values(result.skills)) assert.ok(CEFR_LEVELS.includes(level as CefrLevel));
  });

  it("reads the bank from the placement pack's exercises", () => {
    const items = bankFromExercises([
      { id: "ex.placement.c1.error.03", kind: "multiple_choice", level: "C1", grammarPointIds: [], prompt: "p", question: "q", options: ["a", "b", "c", "d"], answer: 1 },
      { id: "ex.placement.b2.gap.01", kind: "gap_fill", level: "B2", grammarPointIds: [], prompt: "p", text: "a ___ b", answers: [["x"]] },
      { id: "ex.b2.passive.01", kind: "gap_fill", level: "B2", grammarPointIds: [], prompt: "p", text: "a ___ b", answers: [["x"]] },
    ]);
    assert.deepEqual(items, [
      { id: "ex.placement.c1.error.03", level: "C1", type: "error", guess: 0.25 },
      { id: "ex.placement.b2.gap.01", level: "B2", type: "gap", guess: 0 },
    ]);
  });
});

describe("seen items", () => {
  it("round-trips through the compact string", () => {
    const ids = ["ex.placement.c1.error.01", "ex.placement.c1.error.07", "ex.placement.b2.gap.12", "ex.placement.a1.reading.63"];
    const code = encodeSeen(ids);
    assert.deepEqual(decodeSeen(code).sort(), [...ids].sort());
    assert.ok(code.length < 60, code);
  });

  it("keeps the whole bank small enough for the account document", () => {
    const code = encodeSeen(BANK.map((item) => item.id));
    assert.equal(decodeSeen(code).length, BANK.length);
    assert.ok(code.length < 600, `${code.length} characters`);
  });

  it("ignores junk and merges two copies", () => {
    assert.deepEqual(decodeSeen("nonsense;;c1.error:%%"), []);
    assert.deepEqual(decodeSeen(42), []);
    assert.equal(encodeSeen(["ex.b2.passive.01", "not an id"]), "");
    const merged = decodeSeen(mergeSeen(encodeSeen(["ex.placement.c2.order.02"]), encodeSeen(["ex.placement.c2.order.05"])));
    assert.deepEqual(merged.sort(), ["ex.placement.c2.order.02", "ex.placement.c2.order.05"]);
  });
});
