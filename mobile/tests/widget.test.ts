import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { advanceSnapshot, buildWidgetSnapshot, WIDGET_LINKS, WORD_DAYS, wordOfTheDay } from "../src/lib/widget/snapshot.ts";
import { VOCABULARY } from "../src/data/vocabulary.ts";
import { shiftDay } from "../src/platform/progress-model.ts";

const T = "2026-10-24";
const input = { today: T, timeZone: "America/New_York", streak: 5, freezes: 1, practisedToday: true, goalMinutes: 10, minutesToday: 12.4, updatedAt: 1 };

describe("widget snapshot", () => {
  it("carries a week of words ahead and rounds the numbers", () => {
    const snapshot = buildWidgetSnapshot(input);
    assert.equal(snapshot.words.length, WORD_DAYS);
    assert.equal(snapshot.words[0].day, T);
    assert.equal(snapshot.words[0].id, wordOfTheDay(T).id);
    assert.equal(snapshot.minutesToday, 12);
    assert.ok(JSON.stringify(snapshot).length < 4000, "small enough for UserDefaults");
  });

  it("gives everyone the same word on a day, and a different one the next day", () => {
    assert.equal(wordOfTheDay(T).id, wordOfTheDay(T).id);
    assert.notEqual(wordOfTheDay(T).id, wordOfTheDay(shiftDay(T, 1)).id);
    const week = new Set(Array.from({ length: 30 }, (_, i) => wordOfTheDay(shiftDay(T, i)).id));
    assert.equal(week.size, Math.min(30, VOCABULARY.length));
  });

  it("rolls forward on a new day: goal resets, the streak waits", () => {
    const next = advanceSnapshot(buildWidgetSnapshot(input), shiftDay(T, 1));
    assert.equal(next.minutesToday, 0);
    assert.equal(next.practisedToday, false);
    assert.equal(next.streak, 5);
    assert.equal(next.word?.day, shiftDay(T, 1));
  });

  it("spends freezes on missed days, then drops the streak", () => {
    const snapshot = buildWidgetSnapshot(input);
    assert.equal(advanceSnapshot(snapshot, shiftDay(T, 2)).streak, 5, "one missed day, one freeze");
    assert.equal(advanceSnapshot(snapshot, shiftDay(T, 3)).streak, 0);
    const unpractised = buildWidgetSnapshot({ ...input, practisedToday: false, freezes: 0 });
    assert.equal(advanceSnapshot(unpractised, shiftDay(T, 1)).streak, 0);
  });

  it("links to the word's practice screen", () => {
    assert.equal(WIDGET_LINKS.word("ev-01"), "cadence:///word/ev-01");
  });
});
