// FILE: tests/web/content-fixtures.test.ts
//
// The web's built-in content: the starter pack per level and the placeholder
// articulation targets must pass the same validators as real content.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { fixturePack } from "../../src/components/learn-hub/fixture-pack.ts";
import { CEFR_LEVELS, validatePackContent } from "../../src/lib/platform/content-model.ts";
import { ENGLISH_SOUNDS, validateArticulationTarget, type ArticulationTarget } from "../../src/lib/platform/vocal-tract/articulation.ts";

describe("starter packs", () => {
  for (const level of CEFR_LEVELS) {
    it(`${level} is a valid pack with every practice kind`, () => {
      const pack = fixturePack(level);
      assert.deepEqual(validatePackContent(pack), []);
      const kinds = new Set(pack.exercises.map((e) => e.kind));
      for (const kind of ["multiple_choice", "gap_fill", "sentence_building", "matching", "error_correction", "transformation", "flashcard"]) {
        assert.ok(kinds.has(kind as never), `${level} has no ${kind}`);
      }
      assert.ok(pack.exercises.every((e) => e.level === level));
    });
  }
});

describe("placeholder articulation targets", () => {
  const file = JSON.parse(readFileSync(new URL("../../src/components/mouth-map/fixture-targets.json", import.meta.url), "utf8")) as {
    format: number;
    targets: ArticulationTarget[];
  };

  it("are valid and all marked for review", () => {
    assert.equal(file.format, 1);
    for (const target of file.targets) {
      assert.deepEqual(validateArticulationTarget(target), [], `${target.soundId} ${target.variant}`);
      assert.equal(target.needsReview, true);
    }
  });

  it("cover every sound in every accent it exists in", () => {
    for (const sound of ENGLISH_SOUNDS) {
      for (const variant of ["GA", "RP"] as const) {
        if (!sound.ipa[variant]) continue;
        const found = file.targets.some((t) => t.soundId === sound.id && (t.variant === variant || t.variant === "both"));
        assert.ok(found, `${sound.id} ${variant}`);
      }
    }
  });
});
