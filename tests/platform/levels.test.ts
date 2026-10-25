// FILE: tests/platform/levels.test.ts
//
// Level settings (src/lib/platform/levels.ts): parsing what storage or a
// request holds, per-skill levels that fall back to the overall one, the newer
// copy winning, and the exam equivalents shown for every level.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CEFR_LEVELS } from "../../src/lib/platform/content-model.ts";
import {
  DEFAULT_LEVEL,
  DEFAULT_LEVEL_PREFS,
  LEVELS_ADVANCED_FIRST,
  LEVEL_INFO,
  examLine,
  levelFor,
  newerLevelPrefs,
  parseLevelPrefs,
  prefsFromPlacement,
  withLevel,
} from "../../src/lib/platform/levels.ts";

describe("level settings", () => {
  it("describes all six levels, advanced first, with approximate exam equivalents", () => {
    assert.deepEqual(LEVELS_ADVANCED_FIRST, ["C2", "C1", "B2", "B1", "A2", "A1"]);
    for (const level of CEFR_LEVELS) {
      const info = LEVEL_INFO[level];
      assert.equal(info.level, level);
      assert.ok(info.detail.length > 0 && info.detail.length <= 60, `${level} detail`);
      assert.match(examLine(level), /TOEFL iBT .+\(approx\.\)$/);
    }
    assert.equal(examLine("C1"), "IELTS 7.0 to 8.0 · TOEFL iBT 95 to 113 (approx.)");
    assert.equal(examLine("A1"), "TOEFL iBT below 42 (approx.)");
    assert.equal(DEFAULT_LEVEL, "B2");
  });

  it("parses stored settings and refuses anything else", () => {
    assert.equal(parseLevelPrefs(null), null);
    assert.equal(parseLevelPrefs({ overall: "D1" }), null);
    assert.equal(parseLevelPrefs([]), null);
    assert.deepEqual(parseLevelPrefs({ overall: "C1", skills: { grammar: "C2", vocabulary: "C1", pronunciation: "Z9", other: "A1" }, source: "self", updatedAt: 5.7 }), {
      overall: "C1",
      skills: { grammar: "C2" },
      source: "self",
      updatedAt: 5,
    });
    assert.equal(parseLevelPrefs({ overall: "B2", source: "hacked", updatedAt: -1 })?.source, "default");
  });

  it("gives each skill its own level or the overall one", () => {
    const prefs = withLevel(DEFAULT_LEVEL_PREFS, { overall: "C1" }, 10);
    assert.equal(levelFor(prefs), "C1");
    assert.equal(levelFor(prefs, "pronunciation"), "C1");
    const split = withLevel(prefs, { skill: "pronunciation", level: "B2" }, 20);
    assert.equal(levelFor(split, "pronunciation"), "B2");
    assert.equal(levelFor(split, "grammar"), "C1");
    assert.equal(split.source, "self");
    // Setting a skill back to the overall level, or clearing it, makes it follow again.
    assert.deepEqual(withLevel(split, { skill: "pronunciation", level: "C1" }, 30).skills, {});
    assert.deepEqual(withLevel(split, { skill: "pronunciation", level: null }, 30).skills, {});
    // Moving the overall level onto a skill's level drops the now redundant skill setting.
    assert.deepEqual(withLevel(split, { overall: "B2" }, 40).skills, {});
  });

  it("keeps the newer of two copies", () => {
    const old = withLevel(DEFAULT_LEVEL_PREFS, { overall: "B1" }, 100);
    const fresh = withLevel(DEFAULT_LEVEL_PREFS, { overall: "C2" }, 200);
    assert.equal(newerLevelPrefs(old, fresh)?.overall, "C2");
    assert.equal(newerLevelPrefs(fresh, old)?.overall, "C2");
    assert.equal(newerLevelPrefs(null, old)?.overall, "B1");
    assert.equal(newerLevelPrefs(null, null), null);
  });

  it("takes a placement result with the skills that came out different", () => {
    assert.deepEqual(prefsFromPlacement("C1", { grammar: "C2", vocabulary: "C1" }, 7), { overall: "C1", skills: { grammar: "C2" }, source: "placement", updatedAt: 7 });
  });
});
