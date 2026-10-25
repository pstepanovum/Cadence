// FILE: tests/platform/recordings.test.ts
//
// The recordings index every store keeps beside its audio files
// (src/lib/platform/recordings.ts): parsing, limits and eviction, grouping by
// item and by day, and the metadata a Plus account syncs, which never holds a
// file name or audio.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addRecording,
  EMPTY_INDEX,
  exportName,
  formatBytes,
  formatDuration,
  groupByDay,
  groupByItem,
  isRecordingMeta,
  kindForItem,
  mergeMeta,
  metadataForSync,
  parseIndex,
  recordingFileName,
  recordingId,
  removeRecordings,
  takesFor,
  totals,
  type Recording,
} from "../../src/lib/platform/recordings.ts";

const take = (n: number, itemId = "phrase.raise-a-concern", at = 1_790_000_000_000 + n * 60_000): Recording => {
  const id = recordingId(`abc${n}def`, at);
  return { id, itemId, kind: kindForItem(itemId), text: "She raised a concern about the timeline.", createdAt: at, durationMs: 3200, bytes: 100_000, file: recordingFileName(id, "audio/wav"), mime: "audio/wav" };
};

describe("recordings index", () => {
  it("parses what it wrote and drops anything malformed, never throwing", () => {
    const { index } = addRecording(EMPTY_INDEX, take(1));
    assert.deepEqual(parseIndex(JSON.parse(JSON.stringify(index))), index);
    assert.deepEqual(parseIndex(null), EMPTY_INDEX);
    assert.deepEqual(parseIndex({ format: 1, items: [{ ...take(2), file: "../../etc/passwd.wav" }, { nope: true }] }).items, []);
  });

  it("keeps at most ten takes per item and evicts the oldest, and caps the total", () => {
    let index = EMPTY_INDEX;
    const evicted: Recording[] = [];
    for (let n = 0; n < 12; n += 1) {
      const result = addRecording(index, take(n));
      index = result.index;
      evicted.push(...result.evicted);
    }
    assert.equal(index.items.length, 10);
    assert.deepEqual(evicted.map((r) => r.createdAt), [take(0).createdAt, take(1).createdAt]);
    const capped = addRecording(addRecording(EMPTY_INDEX, take(1, "slang.mid")).index, take(2), { total: 1 });
    assert.equal(capped.index.items.length, 1);
    assert.equal(capped.evicted[0].itemId, "slang.mid");
  });

  it("removes takes and reports which files to delete", () => {
    const { index } = addRecording(EMPTY_INDEX, take(1));
    const { index: after, removed } = removeRecordings(index, [take(1).id]);
    assert.equal(after.items.length, 0);
    assert.equal(removed[0].file, take(1).file);
  });

  it("groups the library by item, newest first, and by day", () => {
    let index = EMPTY_INDEX;
    for (const r of [take(1), take(2, "slang.mid"), take(3), take(4, "own.x1", 1_790_000_000_000 + 2 * 86_400_000)]) index = addRecording(index, r).index;
    const items = groupByItem(index);
    assert.deepEqual(items.map((g) => g.itemId), ["own.x1", "phrase.raise-a-concern", "slang.mid"]);
    assert.equal(items[1].takes[0].createdAt, take(3).createdAt);
    assert.equal(takesFor(index, "phrase.raise-a-concern").length, 2);
    const days = groupByDay(index, (ms) => new Date(ms).toISOString().slice(0, 10));
    assert.equal(days.length, 2);
    assert.ok(days[0].day > days[1].day);
    assert.deepEqual(totals(index), { takes: 4, items: 3, bytes: 400_000, durationMs: 12_800 });
  });

  it("syncs metadata only: no file names, no audio, valid for the server", () => {
    const { index } = addRecording(EMPTY_INDEX, { ...take(1), score: 82 });
    const meta = metadataForSync(index, "install-1");
    assert.equal(meta.length, 1);
    assert.ok(!("file" in meta[0]) && !("bytes" in meta[0]) && !("mime" in meta[0]));
    assert.ok(isRecordingMeta(meta[0]));
    assert.equal(meta[0].score, 82);
    const merged = mergeMeta(meta, [{ ...meta[0], id: recordingId("zzzzzz", 5), device: "install-2" }], [meta[0].id]);
    assert.deepEqual(merged.map((m) => m.device), ["install-2"]);
  });

  it("names, measures and exports takes readably", () => {
    assert.equal(kindForItem("fossil.th#d1"), "drill");
    assert.equal(kindForItem("ex.c1.dictation.123"), "sentence");
    assert.equal(recordingFileName("abc", "audio/webm;codecs=opus"), "abc.webm");
    assert.equal(formatDuration(62_400), "1:02");
    assert.equal(formatBytes(2048), "2 KB");
    assert.equal(exportName(take(1), "2026-10-24"), "cadence-she-raised-a-concern-about-the-timeline-2026-10-24.wav");
  });
});
