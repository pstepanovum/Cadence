// FILE: tests/platform/fossilization.test.ts
//
// The plateau track (src/lib/platform/fossilization.ts): evidence from
// feedback and phoneme scores, the diagnosis, the program's weeks and phases,
// daily drills with spaced review, own sentences, weekly re-tests with fresh
// probes, progress per error, and the daily plan's place for it.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildDailyPlan, PLAN_MAX_MINUTES, PLAN_MIN_MINUTES } from "../../src/lib/platform/daily-plan.ts";
import {
  activeErrors,
  addDaysTo,
  addOwnSentence,
  dailyDrills,
  diagnose,
  diagnosticItems,
  errorProgress,
  evidenceFromGrammarIssues,
  evidenceFromPhonemes,
  gradeCorrection,
  newerTrack,
  parseTrack,
  phaseOf,
  recordDrill,
  recordRetest,
  retestDue,
  retestItems,
  startTrack,
  trackSummary,
  validateFossilError,
  weekOf,
  type Evidence,
  type FossilError,
} from "../../src/lib/platform/fossilization.ts";

const grammarError = (slug: string, gp: string): FossilError => ({
  id: `fossil.${slug}`,
  area: "grammar",
  title: slug,
  what: "",
  summary: "",
  listenFor: "Listen for it.",
  grammarPointIds: [gp],
  soundIds: [],
  contrasts: Array.from({ length: 4 }, (_, i) => ({ wrong: `I live here since ${2010 + i}.`, right: `I've lived here since ${2010 + i}.`, note: "Duration needs the perfect." })),
  drills: Array.from({ length: 8 }, (_, i) => `We have worked together for ${i + 2} years now.`),
  probes: Array.from({ length: 5 }, (_, i) => ({ sentence: `She works here since ${2000 + i}.`, answers: [`She has worked here since ${2000 + i}.`, `She's worked here since ${2000 + i}.`] })),
  pairs: [],
  stress: [],
});

const soundError: FossilError = {
  ...grammarError("th-sounds", "gp.none"),
  area: "pronunciation",
  grammarPointIds: [],
  soundIds: ["sound.th", "sound.dh"],
  pairs: [["thin", "tin"], ["three", "tree"], ["thought", "taught"], ["thank", "tank"]],
  probes: Array.from({ length: 4 }, (_, i) => ({ sentence: `Three things I think about ${i}.` })),
};

const catalog = [grammarError("present-perfect", "gp.present-perfect-for-and-since"), grammarError("articles", "gp.articles-in-general-statements"), grammarError("despite", "gp.despite-and-in-spite-of"), soundError];
const START = "2026-10-01";

describe("content rules", () => {
  it("accepts a complete error and names gaps", () => {
    assert.deepEqual(validateFossilError(catalog[0]), []);
    assert.deepEqual(validateFossilError(soundError), []);
    assert.ok(validateFossilError({ ...soundError, pairs: [] }).some((p) => p.includes("minimal pairs")));
    assert.ok(validateFossilError({ ...catalog[0], probes: [{ sentence: "x" }, { sentence: "y" }, { sentence: "z" }] }).some((p) => p.includes("answers")));
  });
});

describe("evidence and diagnosis", () => {
  it("maps feedback issues and phoneme scores onto errors", () => {
    const fromGrammar = evidenceFromGrammarIssues([{ grammarPointId: "gp.present-perfect-for-and-since" }, { grammarPointId: null }, { grammarPointId: "gp.other" }], catalog, START);
    assert.deepEqual(fromGrammar, [{ errorId: "fossil.present-perfect", day: START, source: "spoken", ok: false }]);
    const fromSound = evidenceFromPhonemes([{ soundId: "sound.th", score: 55 }, { soundId: "sound.dh", score: 90 }, { soundId: "sound.s", score: 20 }], catalog, START);
    assert.deepEqual(fromSound, [{ errorId: "fossil.th-sounds", day: START, source: "pronunciation", ok: false }]);
  });

  it("calls an error persistent only with repeated misses, never after one bad day", () => {
    const oneDay: Evidence[] = [1, 2, 3].map(() => ({ errorId: "fossil.articles", day: START, source: "spoken", ok: false }));
    assert.equal(diagnose(oneDay)[0].persistent, false);
    const twoDays: Evidence[] = [...oneDay, { errorId: "fossil.articles", day: addDaysTo(START, 3), source: "spoken", ok: false }];
    assert.equal(diagnose(twoDays)[0].persistent, true);
    const diagnostic: Evidence[] = [0, 1].map(() => ({ errorId: "fossil.despite", day: START, source: "diagnostic", ok: false }));
    assert.equal(diagnose(diagnostic)[0].persistent, true);
    const mostlyRight: Evidence[] = [...twoDays, ...Array.from({ length: 10 }, () => ({ errorId: "fossil.articles", day: START, source: "spoken" as const, ok: true }))];
    assert.equal(diagnose(mostlyRight)[0].persistent, false);
  });

  it("builds a diagnostic of written and read-aloud probes and grades corrections", () => {
    const items = diagnosticItems(catalog);
    assert.equal(items.filter((i) => i.kind === "correct").length, 6);
    assert.equal(items.filter((i) => i.kind === "read").length, 1);
    for (let i = 1; i < items.length; i += 1) assert.notEqual(items[i].errorId, items[i - 1].errorId);
    assert.ok(gradeCorrection(["She has worked here since 2000."], "she has worked here since 2000"));
    assert.ok(!gradeCorrection(["She has worked here since 2000."], "She works here since 2000."));
  });
});

describe("the program", () => {
  const evidence: Evidence[] = catalog.flatMap((e, i) => [0, 1].map(() => ({ errorId: e.id, day: START, source: "diagnostic" as const, ok: i === 3 })));
  const track = startTrack(diagnose(evidence), START, { weeks: 12 });

  it("starts on the persistent errors with a baseline, and keeps the weeks within 10 to 12", () => {
    assert.deepEqual(track.focus.sort(), ["fossil.articles", "fossil.despite", "fossil.present-perfect"]);
    assert.equal(track.baseline["fossil.articles"], 0);
    assert.equal(startTrack([], START, { weeks: 30 }).weeks, 12);
    assert.equal(startTrack([], START, { weeks: 4 }).weeks, 10);
  });

  it("counts weeks and phases", () => {
    assert.equal(weekOf(track, "2026-09-30"), 0);
    assert.equal(weekOf(track, START), 1);
    assert.equal(weekOf(track, addDaysTo(START, 7)), 2);
    assert.equal(weekOf(track, addDaysTo(START, 7 * 12)), 13);
    assert.deepEqual([1, 2, 3, 8, 9, 12, 13].map((w) => phaseOf(track, w)), ["notice", "notice", "rebuild", "rebuild", "automate", "automate", "done"]);
  });

  it("works on two errors at a time while rebuilding, rotating weekly, and on all of them otherwise", () => {
    assert.equal(activeErrors(track, 1).length, 3);
    assert.equal(activeErrors(track, 3).length, 2);
    assert.notDeepEqual(activeErrors(track, 3), activeErrors(track, 4));
    assert.equal(activeErrors(track, 10).length, 3);
    assert.deepEqual(activeErrors(track, 13), []);
  });

  it("fits today's drills in the time, shrinks the list as steps are done, and brings them back when due", () => {
    const day = addDaysTo(START, 2);
    const steps = dailyDrills(track, catalog, day, { minutes: 6 });
    assert.ok(steps.length >= 6);
    assert.ok(new Set(steps.map((s) => s.errorId)).size >= 2, "every active error gets a share");
    let t = recordDrill(track, steps[0].id, "good", day, 1);
    const after = dailyDrills(t, catalog, day, { minutes: 6 });
    assert.ok(!after.some((s) => s.id === steps[0].id));
    t = recordDrill(t, steps[1].id, "again", day, 2);
    assert.ok(dailyDrills(t, catalog, addDaysTo(day, 1), { minutes: 30 }).some((s) => s.id === steps[1].id), "an 'again' step is due the next day");
    assert.deepEqual(dailyDrills(track, catalog, addDaysTo(START, 7 * 12)), []);
  });

  it("drills the learner's own corrected sentences, without repeats", () => {
    const day = addDaysTo(START, 1);
    let t = addOwnSentence(track, { text: "I've been working on this since March.", said: "I am working on this since March.", errorId: "fossil.present-perfect" }, day, 3);
    t = addOwnSentence(t, { text: "I've been working on this since March." }, day, 4);
    assert.equal(t.ownSentences.length, 1);
    assert.ok(dailyDrills(t, catalog, day, { minutes: 10 }).some((s) => s.kind === "own_sentence"));
  });

  it("asks a weekly re-test with fresh probes and reports progress per error", () => {
    assert.equal(retestDue(track, addDaysTo(START, 5)), null);
    assert.equal(retestDue(track, addDaysTo(START, 6)), 1);
    const week1 = retestItems(track, catalog, 1);
    const week2 = retestItems(track, catalog, 2);
    assert.equal(week1.length, 3);
    assert.notEqual(week1[0].sentence, week2[0].sentence);
    const diagnostic = new Set(diagnosticItems(catalog).map((i) => i.sentence));
    assert.ok(week1.every((i) => !diagnostic.has(i.sentence)), "re-tests never repeat the diagnostic");
    let t = recordRetest(track, 1, addDaysTo(START, 6), { "fossil.articles": 90, "fossil.despite": 40, "fossil.unknown": 100 }, 5);
    assert.equal(retestDue(t, addDaysTo(START, 6)), null);
    t = recordRetest(t, 2, addDaysTo(START, 13), { "fossil.articles": 95, "fossil.despite": 60 }, 6);
    const progress = Object.fromEntries(errorProgress(t).map((p) => [p.errorId, p]));
    assert.equal(progress["fossil.articles"].status, "fixed");
    assert.equal(progress["fossil.despite"].status, "improving");
    assert.equal(progress["fossil.present-perfect"].status, "persistent");
    assert.equal(progress["fossil.despite"].trend, "up");
    assert.ok(!t.retests[0].scores["fossil.unknown"]);
    const summary = trackSummary(t, addDaysTo(START, 14));
    assert.equal(summary.week, 3);
    assert.equal(summary.fixed, 1);
    assert.equal(summary.daysLeft, 70);
  });

  it("parses stored copies and keeps the newer one", () => {
    assert.deepEqual(parseTrack(JSON.parse(JSON.stringify(track))), track);
    assert.equal(parseTrack({ format: 2 }), null);
    assert.equal(parseTrack({ ...track, weeks: 40 }), null);
    const newer = { ...track, updatedAt: 99 };
    assert.equal(newerTrack(track, newer), newer);
    assert.equal(newerTrack(null, track), track);
  });
});

describe("the daily plan", () => {
  const base = { today: "2026-10-24", dueCards: [], sounds: [], grammar: [], level: "C1" as const, aiAvailable: true };
  it("puts the plateau drills or re-test and due phrases in, and still fits 10 to 15 minutes", () => {
    const sounds = [{ soundId: "sound.th", ema: 50, attempts: 5 }, { soundId: "sound.r", ema: 60, attempts: 5 }];
    const grammar = [{ grammarPointId: "gp.x", accuracy: 40, attempts: 4 }];
    const dueCards = Array.from({ length: 30 }, (_, i) => ({ cardId: `card.${i}`, due: "2026-10-20" }));
    const dueItems = Array.from({ length: 12 }, (_, i) => ({ itemId: `phrase.p${i}`, due: "2026-10-23" }));
    for (const plateau of [null, { steps: 8, retestDue: false }, { steps: 0, retestDue: true }])
      for (const items of [[], dueItems])
        for (const cards of [[], dueCards]) {
          const plan = buildDailyPlan({ ...base, sounds, grammar, dueCards: cards, dueItems: items, plateau });
          assert.ok(plan.minutes >= PLAN_MIN_MINUTES && plan.minutes <= PLAN_MAX_MINUTES, `${plan.minutes} minutes`);
          assert.equal(plan.items.some((i) => i.kind === "plateau"), Boolean(plateau));
          if (plateau?.retestDue) assert.ok(plan.items.some((i) => i.kind === "plateau" && i.retest));
          if (items.length) assert.ok(plan.items.some((i) => i.kind === "phrases"));
        }
  });
});
