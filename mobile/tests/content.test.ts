import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildPracticeSet,
  countForMode,
  emphasisRuns,
  grammarByTopic,
  lessonExercises,
  levelForPackId,
  packIdForLevel,
  searchGrammar,
} from "../src/content/catalog.ts";
import { seededRng } from "../src/games/random.ts";
import { validatePackContent, type PackContent } from "../src/platform/content-model.ts";
import { validateArticulationTarget, type ArticulationTarget } from "../src/platform/vocal-tract/articulation.ts";

const root = new URL("..", import.meta.url).pathname;
const fixtures = join(root, "src/content/fixtures/packs");

function loadFixture(id: string): PackContent {
  const dir = join(fixtures, id);
  const version = readdirSync(dir).sort().at(-1)!;
  return JSON.parse(readFileSync(join(dir, version, "content.json"), "utf8")) as PackContent;
}

describe("fixture packs", () => {
  for (const id of readdirSync(fixtures)) {
    it(`${id} passes the pack validator`, () => {
      assert.deepEqual(validatePackContent(loadFixture(id)), []);
    });
  }

  it("the bundled articulation targets are valid", () => {
    const body = JSON.parse(readFileSync(join(root, "src/content/articulation.generated.json"), "utf8")) as {
      targets: ArticulationTarget[];
    };
    assert.ok(body.targets.length > 0);
    for (const target of body.targets) assert.deepEqual(validateArticulationTarget(target), [], target.soundId);
  });
});

describe("catalog", () => {
  const a1 = loadFixture("core-a1");

  it("maps levels to pack ids and back", () => {
    assert.equal(packIdForLevel("B2"), "core-b2");
    assert.equal(levelForPackId("core-c1"), "C1");
    assert.equal(levelForPackId("sounds"), null);
  });

  it("returns a lesson's exercises in lesson order", () => {
    const exercises = lessonExercises(a1, "lesson.a1.daily-routines");
    assert.deepEqual(
      exercises.map((e) => e.id),
      a1.lessons[0].exerciseIds,
    );
    assert.deepEqual(lessonExercises(a1, "lesson.nope"), []);
  });

  it("builds practice sets from the mode's kinds only", () => {
    const set = buildPracticeSet(a1, "quiz", { rng: seededRng(1) });
    assert.ok(set.length > 0);
    assert.ok(set.every((e) => ["multiple_choice", "gap_fill", "error_correction"].includes(e.kind)));
    assert.equal(countForMode(a1, "matching"), 1);
  });

  it("puts the weakest grammar first", () => {
    const set = buildPracticeSet(a1, "quiz", {
      rng: seededRng(2),
      accuracy: { "gp.a1.a-an": { attempts: 10, correct: 1 }, "gp.a1.present-simple-third-person": { attempts: 10, correct: 10 } },
    });
    assert.ok(set[0].grammarPointIds.includes("gp.a1.a-an"));
  });

  it("is deterministic for a fixed seed", () => {
    const a = buildPracticeSet(a1, "sentences", { rng: seededRng(7) }).map((e) => e.id);
    const b = buildPracticeSet(a1, "sentences", { rng: seededRng(7) }).map((e) => e.id);
    assert.deepEqual(a, b);
  });

  it("filters by grammar point", () => {
    const set = buildPracticeSet(a1, "quiz", { grammarPointId: "gp.a1.a-an" });
    assert.ok(set.length > 0 && set.every((e) => e.grammarPointIds.includes("gp.a1.a-an")));
  });

  it("searches grammar by title, summary and pattern", () => {
    assert.equal(searchGrammar(a1.grammarPoints, "doesn't")[0].id, "gp.a1.present-simple-negatives");
    assert.equal(searchGrammar(a1.grammarPoints, "vowel sound")[0].id, "gp.a1.a-an");
    assert.equal(searchGrammar(a1.grammarPoints, "").length, a1.grammarPoints.length);
    assert.deepEqual(searchGrammar(a1.grammarPoints, "zzzz"), []);
  });

  it("groups grammar by topic", () => {
    const groups = grammarByTopic(a1);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].points.length, 2);
  });

  it("splits emphasis markup", () => {
    assert.deepEqual(emphasisRuns("Use *an* here"), [
      { text: "Use ", emphasis: false },
      { text: "an", emphasis: true },
      { text: " here", emphasis: false },
    ]);
  });
});
