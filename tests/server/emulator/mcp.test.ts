// FILE: tests/server/emulator/mcp.test.ts
//
// The MCP connector end to end against the emulators, through the same
// handler /api/mcp runs: OAuth challenge and audience binding, 405 for GET
// and DELETE after auth, scopes, the Plus error, tool output shapes, and the
// free plan's hourly limit.
//
// "Every tool's output matches section 8" is checked key by key against the
// tool table in docs/PLATFORM.md, so a new or renamed field fails here.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

import { clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { createAuthorizationCode, redeemAuthorizationCode, registerOAuthClient } from "../../../src/lib/oauth/store.ts";
import { handleMcpPost, handleMcpPostOnly } from "../../../src/lib/mcp/handler.ts";
import { applyActivities, pushDetail } from "../../../src/lib/server/sync.ts";

const ORIGIN = "http://localhost:3000";
const RESOURCE = `${ORIGIN}/api/mcp`;

async function tokenFor(uid: string, scopes: string[], resource = RESOURCE) {
  const client = await registerOAuthClient({ clientName: "Test client", redirectUris: ["http://127.0.0.1:9999/callback"] });
  const verifier = randomBytes(40).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const code = await createAuthorizationCode({ clientId: client.clientId, redirectUri: "http://127.0.0.1:9999/callback", scopes, codeChallenge: challenge, resource, uid });
  const outcome = await redeemAuthorizationCode({ code, clientId: client.clientId, redirectUri: "http://127.0.0.1:9999/callback", codeVerifier: verifier });
  assert.equal(outcome.ok, true);
  return outcome.ok ? outcome.tokens.accessToken : "";
}

let id = 0;
function rpc(token: string | null, method: string, params: Record<string, unknown> = {}, verb = "POST") {
  return new Request(RESOURCE, {
    method: verb,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: verb === "POST" ? JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) : undefined,
  });
}

async function call(token: string, name: string, args: Record<string, unknown> = {}) {
  const response = await handleMcpPost(rpc(token, "tools/call", { name, arguments: args }));
  assert.equal(response.status, 200);
  return (await response.json()) as { result?: { structuredContent?: Record<string, unknown>; isError?: boolean; content: { text: string }[] }; error?: { code: number; data?: { retryAfterSeconds: number } } };
}

describe("mcp connector", { skip }, () => {
  beforeEach(clearFirestore);

  it("answers 401 with the resource metadata challenge without a token", async () => {
    const response = await handleMcpPost(rpc(null, "tools/list"));
    assert.equal(response.status, 401);
    const challenge = response.headers.get("www-authenticate") ?? "";
    assert.match(challenge, /^Bearer resource_metadata="http:\/\/localhost:3000\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  });

  it("refuses a token minted for another audience", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"], "https://elsewhere.example/api/mcp");
    const response = await handleMcpPost(rpc(token, "tools/list"));
    assert.equal(response.status, 401);
    assert.ok(response.headers.get("www-authenticate"));
  });

  it("answers GET and DELETE with 405, but only after auth", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    assert.equal((await handleMcpPostOnly(rpc(null, "", {}, "GET"))).status, 401);
    assert.equal((await handleMcpPostOnly(rpc(token, "", {}, "GET"))).status, 405);
    assert.equal((await handleMcpPostOnly(rpc(token, "", {}, "DELETE"))).status, 405);
  });

  it("hides write tools from a read-only grant", async () => {
    const { uid } = await signUp();
    const read = await tokenFor(uid, ["cadence:read"]);
    const write = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    const list = async (token: string) => ((await (await handleMcpPost(rpc(token, "tools/list"))).json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    const readTools = await list(read);
    assert.ok(readTools.includes("get_progress_overview"));
    assert.ok(!readTools.includes("add_flashcards"));
    assert.ok(!readTools.includes("log_practice"));
    assert.ok((await list(write)).includes("add_flashcards"));
  });

  it("returns the overview and streak in the documented shape", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    const today = new Date().toISOString().slice(0, 10);
    await applyActivities(uid, [{ kind: "lesson", refId: "lesson.b1.x", level: "B1", score: 80, minutes: 12, day: today, at: Date.now(), completedLesson: true }]);
    const overview = (await call(token, "get_progress_overview")).result?.structuredContent ?? {};
    assert.deepEqual(Object.keys(overview).sort(), ["lastActiveAt", "lessonsCompleted", "placementLevel", "plan", "recent", "streak", "totalMinutes"]);
    assert.equal(overview.plan, "free");
    assert.equal(overview.totalMinutes, 12);
    const streak = (await call(token, "get_streak")).result?.structuredContent ?? {};
    assert.deepEqual(streak, { current: 1, best: 1, lastDay: today, activeToday: true });
  });

  it("gives a free account the Plus message on Plus tools, and Plus the data", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    const refused = await call(token, "get_weak_areas");
    assert.equal(refused.result?.isError, true);
    assert.match(refused.result?.content[0].text ?? "", /This needs Cadence Plus/);
    const record = plusRecord("app_store", Date.now());
    await db().collection("users").doc(uid).set({ plus: record, plusSources: { app_store: record } }, { merge: true });
    const allowed = await call(token, "get_weak_areas");
    assert.notEqual(allowed.result?.isError, true);
    assert.deepEqual(allowed.result?.structuredContent, { sounds: [], grammar: [] });
  });

  it("queues flashcards for a free account and logs practice", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    const added = await call(token, "add_flashcards", { cards: [{ front: "put off", back: "postpone" }] });
    assert.equal(added.result?.structuredContent?.queued, 1);
    const inbox = await db().collection("users").doc(uid).collection("inbox").doc("flashcards").get();
    assert.equal(inbox.data()?.cards.length, 1);
    const logged = await call(token, "log_practice", { kind: "shadowing", minutes: 10 });
    assert.equal(logged.result?.structuredContent?.totalMinutes, 10);
  });

  it("refuses a write tool called directly with a read-only grant", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    const response = await handleMcpPost(rpc(token, "tools/call", { name: "add_flashcards", arguments: { cards: [{ front: "a", back: "b" }] } }));
    const body = (await response.json()) as { result?: { isError?: boolean }; error?: unknown };
    assert.ok(body.error || body.result?.isError, "the call is refused");
    const inbox = await db().collection("users").doc(uid).collection("inbox").doc("flashcards").get();
    assert.equal(inbox.exists, false, "nothing was queued");
  });

  it("answers every free tool in the documented shape", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    const keys = (value: unknown) => Object.keys(value as object).sort();

    const grammar = (await call(token, "lookup_grammar", { query: "present perfect" })).result?.structuredContent as { matches: Record<string, unknown>[] };
    assert.ok(grammar.matches.length > 0);
    for (const match of grammar.matches) {
      assert.deepEqual(keys(match), ["commonErrors", "examples", "id", "level", "patterns", "summary", "title", "url"]);
      assert.ok((match.examples as string[]).length <= 3 && (match.commonErrors as string[]).length <= 2);
    }

    const quiz = (await call(token, "start_quiz", { count: 4 })).result?.structuredContent as { quizId: string; questions: Record<string, unknown>[] };
    assert.deepEqual(keys(quiz), ["questions", "quizId"]);
    assert.equal(quiz.questions.length, 4);
    const allowed = new Set(["n", "kind", "prompt", "question", "options", "left", "text", "tokens"]);
    for (const question of quiz.questions) {
      for (const key of Object.keys(question)) assert.ok(allowed.has(key), `question field ${key} is not in section 8`);
      assert.ok(!("answer" in question) && !("correct" in question) && !("pairs" in question), "no answers leak");
    }

    const graded = (await call(token, "grade_quiz", { quizId: quiz.quizId, answers: [] })).result?.structuredContent as { score: number; results: Record<string, unknown>[] };
    assert.deepEqual(keys(graded), ["results", "score"]);
    assert.equal(graded.results.length, 4);
    for (const result of graded.results) assert.deepEqual(keys(result), ["correct", "expected", "explanation", "grammarPointId", "n"]);

    const added = (await call(token, "add_flashcards", { cards: [{ front: "put off", back: "postpone", example: "We put it off." }] })).result?.structuredContent;
    assert.deepEqual(keys(added), ["note", "queued"]);

    const logged = (await call(token, "log_practice", { kind: "quiz", minutes: 3, score: 75 })).result?.structuredContent as Record<string, unknown>;
    for (const key of ["streak", "totalMinutes", "lessonsCompleted", "recent", "lastActiveAt"]) assert.ok(key in logged, `summary has ${key}`);
    assert.ok((logged.recent as { kind: string }[]).some((r) => r.kind === "quiz"), "the graded quiz is in the summary");
  });

  it("answers every Plus tool in the documented shape", async () => {
    const { uid } = await signUp();
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const record = plusRecord("stripe", now);
    await db().collection("users").doc(uid).set({ plus: record, plusSources: { stripe: record } }, { merge: true });
    await pushDetail(uid, {
      installId: "install-mcp-1",
      platform: "ios",
      srs: { "core-b1": { "card.b1.one": { reps: 1, interval: 1, ease: 2.5, due: today, lapses: 0, updatedAt: now } } },
      attempts: [{ id: "att-1", kind: "pronunciation", refId: "sound.th", at: now, score: 55 }],
      mastery: { sounds: { "sound.th": { attempts: 4, ema: 55, best: 70, lastAt: now, history: [{ day: today, score: 55 }] } }, grammar: { "gp.b1.present-perfect": { attempts: 5, correct: 2, ema: 40, lastAt: now } } },
      coach: [],
    });
    const token = await tokenFor(uid, ["cadence:read", "cadence:write"]);
    const keys = (value: unknown) => Object.keys(value as object).sort();
    const content = async (name: string, args: Record<string, unknown> = {}) => {
      const answer = await call(token, name, args);
      assert.notEqual(answer.result?.isError, true, `${name}: ${answer.result?.content[0]?.text}`);
      return answer.result?.structuredContent as Record<string, unknown>;
    };

    const weak = (await content("get_weak_areas")) as { sounds: unknown[]; grammar: unknown[] };
    assert.deepEqual(keys(weak), ["grammar", "sounds"]);
    assert.deepEqual(keys(weak.sounds[0]), ["attempts", "ipa", "score", "soundId", "trend"]);
    assert.deepEqual(keys(weak.grammar[0]), ["accuracy", "attempts", "grammarPointId", "title"]);

    const due = (await content("get_due_flashcards")) as { cards: unknown[] };
    assert.deepEqual(keys(due), ["cards", "dueToday", "overdue"]);
    assert.deepEqual(keys(due.cards[0]), ["back", "cardId", "due", "front", "interval"]);

    const history = (await content("get_practice_history", { limit: 10 })) as { items: unknown[] };
    assert.deepEqual(keys(history), ["items", "nextCursor"]);
    assert.equal(history.items.length, 1);

    const quiz = (await content("start_quiz", { count: 3 })) as { quizId: string };
    await content("grade_quiz", { quizId: quiz.quizId, answers: [] });
    const quizzes = (await content("get_quiz_history", { limit: 5 })) as { quizzes: unknown[] };
    assert.deepEqual(keys(quizzes), ["nextCursor", "quizzes"]);
    assert.deepEqual(keys(quizzes.quizzes[0]), ["at", "grammarPointIds", "score"]);

    const added = await content("add_flashcards", { cards: [{ front: "carry on", back: "continue" }] });
    assert.deepEqual(keys(added), ["note", "queued"]);
    const deck = await db().collection("users").doc(uid).collection("srs").doc("mcp").get();
    assert.equal(Object.keys(deck.data()?.cards ?? {}).length, 1, "Plus cards go straight into spaced review");
  });

  it("rate limits the 31st tool call in an hour on the free plan", async () => {
    const { uid } = await signUp();
    const token = await tokenFor(uid, ["cadence:read"]);
    for (let i = 0; i < 30; i += 1) {
      const ok = await call(token, "get_streak");
      assert.ok(ok.result, `call ${i + 1}`);
    }
    const limited = await call(token, "get_streak");
    assert.equal(limited.error?.code, -32029);
    assert.ok((limited.error?.data?.retryAfterSeconds ?? 0) > 0);
  });
});
