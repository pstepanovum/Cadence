// FILE: tests/server/emulator/mcp-teacher.test.ts
//
// The connector's teacher tools end to end against the emulators, through
// the same handler /api/mcp runs, over a small fixture of the phrase, slang
// and plateau packs: search, today's drills on free and Plus, the spoken
// drill session step by step, the practice list, logging (inbox for free,
// review state for Plus), the Plus tools' refusal and output, and that
// recordings come back as metadata only. Output keys are checked against
// docs/PLATFORM.md section 20.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, beforeEach, describe, it } from "node:test";

import { clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { createAuthorizationCode, redeemAuthorizationCode, registerOAuthClient } from "../../../src/lib/oauth/store.ts";
import { handleMcpPost } from "../../../src/lib/mcp/handler.ts";
import { resetAdvancedLibrary } from "../../../src/lib/mcp/advanced-content.ts";
import { mergeAdvanced, readAdvanced, readPractice } from "../../../src/lib/server/mcp-teacher-store.ts";
import { startTrack } from "../../../src/lib/platform/fossilization.ts";

const ORIGIN = "http://localhost:3000";
const RESOURCE = `${ORIGIN}/api/mcp`;

function fixturePacks() {
  const dir = mkdtempSync(join(tmpdir(), "cadence-packs-"));
  const phrases = Array.from({ length: 12 }, (_, i) => ({
    id: `phrase.fixture-${i}`,
    text: i === 0 ? "raise a concern" : `fixture phrase ${i}`,
    kind: "chunk",
    form: i === 0 ? "raised a concern" : `fixture phrase ${i}`,
    level: i < 6 ? "C1" : "B2",
    situations: [i % 2 ? "meetings" : "negotiation"],
    meaning: `Meaning ${i}.`,
    example: i === 0 ? "She raised a concern about the timeline." : `This uses fixture phrase ${i} naturally.`,
    plain: "Plain.",
    note: "Neutral.",
    audio: `audio/p${i}.m4a`,
  }));
  const slang = [{ id: "slang.mid", term: "mid", partOfSpeech: "adjective", meaning: "Average, unremarkable.", register: "informal", fits: ["texting", "friends"], region: "global", category: "quality", examples: ["The film was mid.", "Honestly, mid."], usageNote: "Young, a little dismissive.", dated: false, popularSince: "2020s", contextQuiz: { prompt: "Where?", options: ["a", "b", "c", "d"], answer: 0 }, replyQuiz: { prompt: "mid", options: ["x", "y", "z"], answer: 0 } }];
  const errors = [{ id: "fossil.articles", area: "grammar", title: "Articles", what: "", summary: "", listenFor: "Listen for the.", grammarPointIds: [], soundIds: [], contrasts: [{ wrong: "The life is hard.", right: "Life is hard.", note: "General." }], drills: ["Life is expensive.", "Music helps."], probes: [{ sentence: "The life is hard.", answers: ["Life is hard."] }], pairs: [], stress: [] }];
  const empty = { topics: [], grammarPoints: [], lessons: [], exercises: [] };
  const write = (id: string, content: unknown, audio: string[] = []) => {
    const root = join(dir, id, "v1");
    mkdirSync(join(root, "audio"), { recursive: true });
    writeFileSync(join(root, "content.json"), JSON.stringify(content));
    for (const a of audio) writeFileSync(join(root, a), "audio");
    writeFileSync(join(root, "manifest.json"), JSON.stringify({ format: 1, contentModel: 1, id, version: 1, title: id, generatedAt: "2026-10-24T00:00:00Z", files: [{ path: "content.json", sha256: "x", bytes: 1 }, ...audio.map((path) => ({ path, sha256: "x", bytes: 5 }))] }));
  };
  write("phrases-c1", { ...empty, phrases: { format: 1, phrases } }, ["audio/p0.m4a"]);
  write("slang", { ...empty, slang: { format: 1, categories: [{ id: "quality", title: "Good and bad" }], entries: slang } });
  write("fossilization", { ...empty, fossilization: { format: 1, errors } });
  writeFileSync(join(dir, "index.json"), JSON.stringify({ format: 1, packs: ["phrases-c1", "slang", "fossilization"].map((id) => ({ id, version: 1, manifest: `${id}/v1/manifest.json`, bytes: 1 })) }));
  return dir;
}

async function tokenFor(uid: string, scopes: string[]) {
  const client = await registerOAuthClient({ clientName: "Test client", redirectUris: ["http://127.0.0.1:9999/callback"] });
  const verifier = randomBytes(40).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await createAuthorizationCode({ clientId: client.clientId, redirectUri: "http://127.0.0.1:9999/callback", scopes, codeChallenge: challenge, resource: RESOURCE, uid });
  const outcome = await redeemAuthorizationCode({ code, clientId: client.clientId, redirectUri: "http://127.0.0.1:9999/callback", codeVerifier: verifier });
  return outcome.ok ? outcome.tokens.accessToken : "";
}

let id = 0;
async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const request = new Request(RESOURCE, {
    method: "POST",
    headers: { host: "localhost:3000", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/call", params: { name, arguments: args } }),
  });
  const response = await handleMcpPost(request);
  assert.equal(response.status, 200);
  const body = (await response.json()) as { result: { structuredContent?: Record<string, unknown>; isError?: boolean; content: { text: string }[] } };
  return body.result;
}

async function makePlus(uid: string) {
  const record = plusRecord("app_store", Date.now());
  await db().collection("users").doc(uid).set({ plus: record, plusSources: { app_store: record } }, { merge: true });
}

describe("mcp teacher tools", { skip }, () => {
  before(() => {
    process.env.CADENCE_PACKS_DIR = fixturePacks();
    resetAdvancedLibrary();
  });
  beforeEach(clearFirestore);

  it("lists the teacher tools, write ones only with write access", async () => {
    const { uid } = await signUp();
    const list = async (token: string) => {
      const response = await handleMcpPost(new Request(RESOURCE, { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method: "tools/list" }) }));
      return ((await response.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    };
    const read = await list(await tokenFor(uid, ["cadence:read"]));
    for (const name of ["search_phrases", "search_slang", "get_todays_drills", "start_spoken_drill", "next_drill_step", "get_plateau_progress", "list_recordings"]) assert.ok(read.includes(name), name);
    assert.ok(!read.includes("assign_practice") && !read.includes("log_drill_practice"));
    const write = await list(await tokenFor(uid, ["cadence:read", "cadence:write"]));
    assert.ok(write.includes("assign_practice") && write.includes("log_drill_practice"));
  });

  it("searches phrases and slang with audio links only where the audio exists", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    const phrases = (await call(token, "search_phrases", { query: "concern" })).structuredContent!;
    const first = (phrases.matches as Record<string, unknown>[])[0];
    assert.deepEqual(Object.keys(first).sort(), ["audioUrl", "example", "id", "kind", "level", "meaning", "note", "pageUrl", "situations", "text"]);
    assert.equal(first.audioUrl, `${ORIGIN}/packs/phrases-c1/v1/audio/p0.m4a`);
    const other = (await call(token, "search_phrases", { query: "fixture phrase 3" })).structuredContent!.matches as Record<string, unknown>[];
    assert.equal(other[0].audioUrl, null);
    const slang = (await call(token, "search_slang", { query: "mid" })).structuredContent!.matches as Record<string, unknown>[];
    assert.equal(slang[0].term, "mid");
    assert.ok(Array.isArray(slang[0].fits));
  });

  it("assigns practice, drills it hands-free step by step, and logs it to the free inbox", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    const assigned = (await call(token, "assign_practice", { itemIds: ["phrase.fixture-3", "slang.mid", "phrase.nope"] })).structuredContent!;
    assert.deepEqual(assigned, { added: 2, total: 2, unknown: ["phrase.nope"] });
    const today = (await call(token, "get_todays_drills")).structuredContent!;
    assert.deepEqual(Object.keys(today).sort(), ["counts", "day", "items", "note"]);
    const items = today.items as { itemId: string; reason: string }[];
    assert.deepEqual(items.slice(0, 2).map((i) => [i.itemId, i.reason]), [["phrase.fixture-3", "assigned"], ["slang.mid", "assigned"]]);
    assert.ok(items.some((i) => i.reason === "new"));

    const start = (await call(token, "start_spoken_drill", { source: "list", count: 3 })).structuredContent!;
    const step1 = start.step as Record<string, unknown>;
    assert.deepEqual(Object.keys(step1).sort(), ["audioUrl", "itemId", "meaning", "n", "pageUrl", "reps", "say", "tip", "total"]);
    assert.equal(step1.n, 1);
    const step2 = (await call(token, "next_drill_step", { sessionId: start.sessionId, after: 1 })).structuredContent!;
    assert.equal((step2.step as { itemId: string }).itemId, "slang.mid");
    const done = (await call(token, "next_drill_step", { sessionId: start.sessionId, after: 2 })).structuredContent!;
    assert.deepEqual(done, { done: true, itemIds: ["phrase.fixture-3", "slang.mid"], total: 2 });
    assert.equal((await call(token, "next_drill_step", { sessionId: "d1.forged.x", after: 0 })).isError, true);

    const logged = (await call(token, "log_drill_practice", { items: [{ itemId: "phrase.fixture-3", result: "good" }, { itemId: "slang.mid", result: "again" }], minutes: 6 })).structuredContent!;
    assert.equal(logged.logged, 2);
    assert.equal(logged.streak, 1);
    const inbox = await readPractice(uid);
    assert.deepEqual(inbox.reviews.map((r) => [r.itemId, r.grade]), [["phrase.fixture-3", "good"], ["slang.mid", "again"]]);
    assert.equal((await readAdvanced(uid)).updatedAt, 0, "a free account keeps no detail in the cloud");
  });

  it("refuses the Plus tools on free and answers them on Plus, recordings as metadata only", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    for (const name of ["get_plateau_progress", "list_recordings"]) {
      const refused = await call(token, name);
      assert.equal(refused.isError, true);
      assert.match(refused.content[0].text, /needs Cadence Plus/);
    }
    await makePlus(uid);
    assert.deepEqual((await call(token, "get_plateau_progress")).structuredContent, { onTrack: false });
    const track = startTrack([{ errorId: "fossil.articles", misses: 4, hits: 0, missDays: 2, missRate: 1, persistent: true, severity: 2 }], new Date().toISOString().slice(0, 10), { now: 1 });
    await mergeAdvanced(uid, {
      installId: "install-12345",
      cards: { "phrase.fixture-1": { reps: 1, interval: 1, ease: 2.5, due: "2000-01-01", lapses: 0, updatedAt: 1 } },
      track,
      recordings: { upsert: [{ id: "mabc12-xyz123", itemId: "phrase.fixture-1", kind: "phrase", text: "This uses fixture phrase 1 naturally.", createdAt: 1_790_000_000_000, durationMs: 2500, score: 77, device: "install-12345" }], remove: [] },
    });
    const progress = (await call(token, "get_plateau_progress")).structuredContent!;
    assert.deepEqual(Object.keys(progress).sort(), ["daysLeft", "errors", "nextRetestDay", "onTrack", "ownSentences", "phase", "phaseDetail", "retestDue", "week", "weeks"]);
    assert.equal(progress.week, 1);
    assert.equal((progress.errors as { title: string }[])[0].title, "Articles");
    const recordings = (await call(token, "list_recordings")).structuredContent!;
    const first = (recordings.recordings as Record<string, unknown>[])[0];
    assert.deepEqual(Object.keys(first).sort(), ["at", "device", "durationMs", "id", "itemId", "kind", "score", "text"]);
    assert.ok(!("file" in first) && !("audio" in first));

    const today = (await call(token, "get_todays_drills")).structuredContent!;
    const reasons = (today.items as { reason: string; itemId: string }[]).map((i) => i.reason);
    assert.ok(reasons.includes("due") && reasons.includes("plateau"));
    const logged = (await call(token, "log_drill_practice", { items: [{ itemId: "phrase.fixture-1", result: "easy" }, { itemId: "fossil.articles#c0", result: "good" }], minutes: 5 })).structuredContent!;
    assert.equal(logged.logged, 2);
    const state = await readAdvanced(uid);
    assert.ok(state.cards["phrase.fixture-1"].due > "2000-01-01");
    assert.ok(state.track?.cards["fossil.articles#c0"]);
  });
});
