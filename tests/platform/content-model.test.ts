// FILE: tests/platform/content-model.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTENT_MODEL_VERSION,
  PACK_FORMAT_VERSION,
  canReadPack,
  compareCefr,
  gradeExercise,
  isContentId,
  normalizeAnswer,
  packsToUpdate,
  validateExercise,
  validatePackContent,
  wordAccuracy,
  type Exercise,
  type PackContent,
} from "../../src/lib/platform/content-model.ts";

const base = { level: "B1" as const, grammarPointIds: ["gp.present-perfect"], prompt: "Choose the best answer." };

const mc: Exercise = {
  ...base,
  id: "ex.b1.pp.01",
  kind: "multiple_choice",
  question: "I ___ here since 2019.",
  options: ["live", "have lived", "am living"],
  answer: 1,
};

const gap: Exercise = {
  ...base,
  id: "ex.b1.pp.02",
  kind: "gap_fill",
  text: "She ___ (finish) her report, and she ___ (send) it.",
  answers: [["has finished", "'s finished"], ["has sent", "'s sent"]],
};

const building: Exercise = {
  ...base,
  id: "ex.b1.pp.03",
  kind: "sentence_building",
  answer: ["I", "have", "never", "been", "to", "Rome"],
  distractors: ["went"],
};

const pack: PackContent = {
  topics: [{ id: "topic.time", title: "Time", summary: "Talking about time." }],
  grammarPoints: [
    {
      id: "gp.present-perfect",
      level: "B1",
      topicId: "topic.time",
      title: "Present perfect",
      summary: "Past actions with a link to now.",
      explanation: "Use it for experiences and for actions that continue to now.",
      patterns: ["have/has + past participle"],
      examples: [
        { text: "I have lived here since 2019.", source: { kind: "generated" } },
        { text: "Have you ever been to Rome?", source: { kind: "tatoeba", sentenceId: 123456 } },
      ],
      commonErrors: [{ wrong: "I am here since 2019.", right: "I have been here since 2019.", note: "Use the present perfect with since." }],
      related: ["gp.past-simple"],
    },
  ],
  lessons: [
    {
      id: "lesson.b1.experiences",
      level: "B1",
      topicId: "topic.time",
      title: "Talking about experiences",
      goal: "Say what you have and have not done.",
      minutes: 8,
      grammarPointIds: ["gp.present-perfect"],
      soundIds: [],
      exerciseIds: [mc.id, gap.id, building.id],
    },
  ],
  exercises: [mc, gap, building],
};

describe("ids and levels", () => {
  it("accepts namespaced slugs and refuses anything else", () => {
    assert.equal(isContentId("gp.present-perfect", "gp"), true);
    assert.equal(isContentId("ex.b1.travel-plans.03"), true);
    for (const bad of ["Gp.x", "gp.", "gp.Present", "foo.bar", "gp.a b", "", 42]) {
      assert.equal(isContentId(bad), false, String(bad));
    }
    assert.equal(isContentId("ex.a", "gp"), false);
  });

  it("orders CEFR levels", () => {
    assert.ok(compareCefr("A2", "B1") < 0);
    assert.equal(compareCefr("C1", "C1"), 0);
  });
});

describe("validation", () => {
  it("passes a well-formed pack", () => {
    assert.deepEqual(validatePackContent(pack), []);
  });

  it("finds broken references and duplicate ids", () => {
    const broken: PackContent = {
      ...pack,
      lessons: [{ ...pack.lessons[0], exerciseIds: ["ex.missing"], grammarPointIds: ["gp.nope"] }],
      exercises: [mc, mc],
    };
    const problems = validatePackContent(broken);
    assert.ok(problems.some((p) => p.includes("unknown exercise ex.missing")));
    assert.ok(problems.some((p) => p.includes("unknown grammar point gp.nope")));
    assert.ok(problems.some((p) => p.includes("duplicate id")));
  });

  it("checks each exercise kind's own rules", () => {
    assert.deepEqual(validateExercise(mc), []);
    assert.ok(validateExercise({ ...mc, answer: 5 } as Exercise).some((p) => p.includes("answer must index")));
    assert.ok(validateExercise({ ...gap, answers: [["x"]] } as Exercise).some((p) => p.includes("one answer list per gap")));
    assert.ok(validateExercise({ ...building, distractors: ["Rome"] } as Exercise).some((p) => p.includes("distractor")));
    const pair: Exercise = {
      ...base,
      id: "ex.sounds.ship-sheep",
      kind: "minimal_pair",
      words: ["ship", "ship"],
      soundIds: ["sound.ih", "sound.ee"],
      audio: ["audio/a.m4a", "audio/b.m4a"],
    };
    assert.ok(validateExercise(pair).some((p) => p.includes("the words are the same")));
  });
});

describe("grading", () => {
  it("normalizes typed answers", () => {
    assert.equal(normalizeAnswer("  She’s   FINISHED. "), "she's finished");
  });

  it("grades multiple choice and gap fill with partial credit", () => {
    assert.equal(gradeExercise(mc, { kind: "multiple_choice", choice: 1 }).correct, true);
    const half = gradeExercise(gap, { kind: "gap_fill", gaps: ["Has  finished", "sended"] });
    assert.equal(half.correct, false);
    assert.equal(half.score, 0.5);
    assert.deepEqual(half.parts, [true, false]);
    const full = gradeExercise(gap, { kind: "gap_fill", gaps: ["’s finished", "Has sent"] });
    assert.equal(full.correct, true);
  });

  it("grades word order", () => {
    assert.equal(gradeExercise(building, { kind: "sentence_building", tokens: building.answer }).correct, true);
    assert.equal(
      gradeExercise(building, { kind: "sentence_building", tokens: ["I", "have", "been", "never", "to", "Rome"] }).correct,
      false,
    );
  });

  it("scores dictation by word accuracy", () => {
    assert.equal(wordAccuracy("I have never been to Rome.", "i have never been to rome"), 1);
    assert.ok(wordAccuracy("I have never been to Rome.", "I never been to Rome") < 0.9);
  });

  it("refuses an answer of the wrong kind", () => {
    assert.throws(() => gradeExercise(mc, { kind: "dictation", text: "x" }));
  });
});

describe("packs", () => {
  it("reads only packs it understands", () => {
    assert.equal(canReadPack({ format: PACK_FORMAT_VERSION, contentModel: CONTENT_MODEL_VERSION }), true);
    assert.equal(canReadPack({ format: PACK_FORMAT_VERSION, contentModel: CONTENT_MODEL_VERSION + 1 }), false);
    assert.equal(canReadPack({ format: PACK_FORMAT_VERSION + 1, contentModel: 1 }), false);
  });

  it("updates only packs with a newer version", () => {
    const index = {
      format: PACK_FORMAT_VERSION,
      packs: [
        { id: "core-a1", version: 3, manifest: "packs/core-a1/v3/manifest.json", bytes: 1 },
        { id: "core-b1", version: 2, manifest: "packs/core-b1/v2/manifest.json", bytes: 1 },
      ],
    };
    assert.deepEqual(
      packsToUpdate(index, { "core-a1": 3, "core-b1": 1 }).map((p) => p.id),
      ["core-b1"],
    );
  });
});
