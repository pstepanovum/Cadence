// FILE: tests/platform/phrase-bank.test.ts
//
// The phrase bank and slang dictionary (src/lib/platform/phrase-bank.ts):
// validators, search, drills and their grading, slang quizzes, the mapping
// from results to review grades, review planning through the one scheduler,
// and the practice list.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addToPracticeList,
  buildPhraseDrill,
  buildSlangQuiz,
  dailyNewOrder,
  drillsForPhrase,
  gapText,
  gradeFromAnswer,
  gradeFromScore,
  gradeGapFill,
  gradeRephrase,
  planItemReview,
  PRACTICE_LIST_CAP,
  removeFromPracticeList,
  searchPhrases,
  searchSlang,
  validatePhrase,
  validateSlang,
  type Phrase,
  type SlangEntry,
} from "../../src/lib/platform/phrase-bank.ts";
import { review } from "../../src/lib/platform/srs.ts";

const concern: Phrase = {
  id: "phrase.raise-a-concern",
  text: "raise a concern",
  kind: "collocation",
  form: "raised a concern",
  level: "B2",
  situations: ["meetings", "feedback"],
  meaning: "To mention a worry or problem so that people deal with it.",
  example: "During the review, Maya raised a concern about the timeline.",
  plain: "During the review, Maya said she was worried about the timeline.",
  note: "Neutral and professional.",
};
const fair: Phrase = { ...concern, id: "phrase.to-be-fair", text: "to be fair", kind: "chunk", form: "to be fair", level: "C1", situations: ["disagreeing"], meaning: "Used to add a point that balances a criticism.", example: "To be fair, they had very little time to prepare.", plain: "They had very little time to prepare, which explains it." };

const slang = (over: Partial<SlangEntry>): SlangEntry => ({
  id: "slang.lowkey",
  term: "lowkey",
  partOfSpeech: "adverb",
  meaning: "Slightly, or secretly; said to play a feeling down.",
  register: "informal",
  fits: ["texting", "friends"],
  region: "global",
  category: "agreement",
  examples: ["I'm lowkey excited about Friday.", "Lowkey want to skip the gym tonight."],
  usageNote: "Common under 35; sounds relaxed and a little ironic.",
  dated: false,
  popularSince: "2010s",
  contextQuiz: { prompt: "Where would 'lowkey' sound most natural?", options: ["A text to a friend", "A legal contract", "A eulogy", "A job application"], answer: 0 },
  replyQuiz: { prompt: "lowkey starving rn", options: ["Same, want to grab tacos?", "Please keep your voice down.", "Why are you hiding?"], answer: 0 },
  ...over,
});

describe("validators", () => {
  it("accept good records and name what is wrong with bad ones", () => {
    assert.deepEqual(validatePhrase(concern), []);
    assert.deepEqual(validateSlang(slang({})), []);
    assert.ok(validatePhrase({ ...concern, example: "During the review, Maya was worried." }).some((p) => p.includes("does not contain")));
    assert.ok(validatePhrase({ ...concern, id: "raise-a-concern" }).some((p) => p.includes("phrase.<slug>")));
    assert.ok(validatePhrase({ ...concern, situations: ["parties" as never] }).some((p) => p.includes("situations")));
    assert.ok(validateSlang(slang({ fits: ["work-casual", "avoid-at-work"] })).some((p) => p.includes("at work")));
    assert.ok(validateSlang(slang({ replyQuiz: { prompt: "x", options: ["a", "a", "b"], answer: 0 } })).some((p) => p.includes("repeats")));
  });
});

describe("search", () => {
  it("ranks the phrase itself above its examples and filters by level and situation", () => {
    assert.equal(searchPhrases([fair, concern], { query: "concern" })[0].id, concern.id);
    assert.deepEqual(searchPhrases([fair, concern], { situation: "disagreeing" }).map((p) => p.id), [fair.id]);
    assert.deepEqual(searchPhrases([fair, concern], { level: "C1" }).map((p) => p.id), [fair.id]);
    assert.deepEqual(searchPhrases([fair, concern], { query: "zzz" }), []);
  });

  it("finds slang by term first, keeps dated entries unless asked, and treats global as every region", () => {
    const dated = slang({ id: "slang.on-fleek", term: "on fleek", meaning: "Perfectly done; flawless.", dated: true });
    assert.equal(searchSlang([dated, slang({})], { query: "lowkey" })[0].id, "slang.lowkey");
    assert.equal(searchSlang([dated, slang({})], {}).length, 2);
    assert.equal(searchSlang([dated, slang({})], { includeDated: false }).length, 1);
    assert.equal(searchSlang([slang({})], { region: "UK" }).length, 1);
  });
});

describe("drills", () => {
  it("blanks the phrase in its example and grades the gap by form or dictionary form", () => {
    assert.equal(gapText(concern), "During the review, Maya ___ about the timeline.");
    assert.ok(gradeGapFill(concern, "Raised a concern"));
    assert.ok(gradeGapFill(concern, "raise a concern"));
    assert.ok(!gradeGapFill(concern, "mentioned a worry"));
    assert.ok(!gradeGapFill(concern, ""));
  });

  it("accepts a rephrase that uses the phrase in any verb form, and refuses one that does not", () => {
    assert.ok(gradeRephrase(concern, "In the review Maya raised a concern about the timeline."));
    assert.ok(gradeRephrase(concern, "She keeps raising a concern about it."));
    assert.ok(!gradeRephrase(concern, "Maya was worried about the timeline."));
    assert.ok(gradeRephrase(fair, "To be fair, they had no time."));
  });

  it("builds every drill kind, hearing first and recall after", () => {
    assert.deepEqual(drillsForPhrase(concern).map((d) => d.kind), ["listen_repeat", "gap_fill", "rephrase", "shadowing"]);
    assert.deepEqual(drillsForPhrase(concern, { recall: false }).map((d) => d.kind), ["listen_repeat", "shadowing"]);
    const gap = buildPhraseDrill(concern, "gap_fill");
    assert.ok(gap.kind === "gap_fill" && gap.answers.includes("raised a concern") && gap.hint.includes("r_____ a c______"));
  });
});

describe("slang quizzes", () => {
  const pool = [slang({}), slang({ id: "slang.mid", term: "mid", meaning: "Average, unremarkable." }), slang({ id: "slang.bet", term: "bet", meaning: "OK, agreed." }), slang({ id: "slang.cap", term: "cap", meaning: "A lie." })];

  it("asks the meaning with distractors from other entries, the same way for the same seed", () => {
    const quiz = buildSlangQuiz(pool[0], "meaning", pool, "2026-10-24");
    assert.equal(quiz.options.length, 4);
    assert.equal(quiz.options[quiz.answer], pool[0].meaning);
    assert.deepEqual(buildSlangQuiz(pool[0], "meaning", pool, "2026-10-24"), quiz);
  });

  it("keeps the stored context and reply questions' answers through the shuffle", () => {
    for (const kind of ["context", "reply"] as const) {
      const quiz = buildSlangQuiz(pool[0], kind, pool, "seed");
      const source = kind === "context" ? pool[0].contextQuiz : pool[0].replyQuiz;
      assert.equal(quiz.options[quiz.answer], source.options[source.answer]);
    }
  });
});

describe("review", () => {
  it("maps results to grades", () => {
    assert.equal(gradeFromAnswer(false), "again");
    assert.equal(gradeFromAnswer(true), "good");
    assert.equal(gradeFromAnswer(true, 2), "hard");
    assert.deepEqual([40, 70, 85, 95].map(gradeFromScore), ["again", "hard", "good", "easy"]);
  });

  it("plans due items before new ones through the shared scheduler", () => {
    const now = new Date(2026, 9, 24, 12);
    const earlier = new Date(2026, 9, 20, 12);
    const cards = { [concern.id]: review(undefined, "good", earlier) };
    const plan = planItemReview([fair.id, concern.id], cards, now);
    assert.deepEqual(plan.ids, [concern.id, fair.id]);
    assert.equal(plan.dueCount, 1);
  });

  it("orders new items by day, the same on every device", () => {
    const ids = Array.from({ length: 30 }, (_, i) => `phrase.p${i}`);
    assert.deepEqual(dailyNewOrder(ids, "2026-10-24"), dailyNewOrder([...ids].reverse(), "2026-10-24"));
    assert.notDeepEqual(dailyNewOrder(ids, "2026-10-24"), dailyNewOrder(ids, "2026-10-25"));
  });
});

describe("practice list", () => {
  it("adds without repeats, caps the list and removes", () => {
    let list = addToPracticeList([], [{ itemId: "phrase.a", addedAt: 1, source: "connector" }]);
    list = addToPracticeList(list, [{ itemId: "phrase.a", addedAt: 5, source: "device" }, { itemId: "slang.b", addedAt: 2, source: "device" }]);
    assert.deepEqual(list.map((i) => i.itemId), ["phrase.a", "slang.b"]);
    const many = Array.from({ length: PRACTICE_LIST_CAP + 5 }, (_, i) => ({ itemId: `phrase.x${i}`, addedAt: 10 + i, source: "connector" as const }));
    const capped = addToPracticeList(list, many);
    assert.equal(capped.length, PRACTICE_LIST_CAP);
    assert.ok(!capped.some((i) => i.itemId === "phrase.a"));
    assert.deepEqual(removeFromPracticeList(list, ["phrase.a"]).map((i) => i.itemId), ["slang.b"]);
  });
});
