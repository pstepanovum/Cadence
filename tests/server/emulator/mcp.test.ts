// FILE: tests/server/emulator/mcp.test.ts
//
// The MCP connector end to end against the emulators, through the same
// handler /api/mcp runs: OAuth challenge and audience binding, 405 for GET
// and DELETE after auth, scopes, the Plus error, tool output shapes, and the
// free plan's hourly limit.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

import { clearFirestore, plusRecord, signUp, skip } from "./helpers.ts";
import { db } from "../../../src/lib/server/firebase.ts";
import { createAuthorizationCode, redeemAuthorizationCode, registerOAuthClient } from "../../../src/lib/oauth/store.ts";
import { handleMcpPost, handleMcpPostOnly } from "../../../src/lib/mcp/handler.ts";
import { applyActivities } from "../../../src/lib/server/sync.ts";

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
