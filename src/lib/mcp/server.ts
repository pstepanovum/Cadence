// FILE: src/lib/mcp/server.ts
//
// A fresh MCP server per request (stateless; Cloud Run gives no instance
// affinity), carrying only the tools the token's scopes allow and bound to
// the token's uid, so no tool can be told whose progress to act on. Also the
// per-learner rate limit on tool calls.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Firestore } from "firebase-admin/firestore";

import { SCOPE_WRITE, hasScope } from "../oauth/config";
import { getAccount } from "../server/entitlement";
import { LIMITS, hitAll, type RateLimitResult } from "../server/rate-limit";
import { registerReadTools, registerWriteTools } from "./tools";

export const INSTRUCTIONS = `Cadence is an English learning app for advanced learners: pronunciation, grammar by CEFR level, quizzes, flashcards and conversation practice.
Every tool acts on the account that approved this connection and no other.

Start with get_progress_overview for anything about progress. Days are UTC days, YYYY-MM-DD.

Free tools: get_progress_overview, get_streak, lookup_grammar, start_quiz and grade_quiz, add_flashcards and log_practice (these two need write access).
Cadence Plus tools: get_weak_areas, get_due_flashcards, get_practice_history, get_quiz_history. For a free account they answer that Plus is needed; pass that on plainly and do not retry.

Quizzes: start_quiz returns questions without answers. Ask the learner each one, then send their own answers to grade_quiz with the quizId; never answer for them. Tell them which ones were wrong and why, using the explanations.

Flashcards: add_flashcards takes what the learner wants to remember (a word, phrase or pattern on the front, the meaning or a correct form on the back). Only log practice the learner says they did.

Tone: encouraging and brief. Mistakes are information, not failure.`;

export interface McpContext {
  uid: string;
  scopes: string[];
  origin: string;
  db?: Firestore;
}

export function buildCadenceMcpServer(context: McpContext): McpServer {
  const server = new McpServer(
    {
      name: "cadence",
      title: "Cadence",
      version: "1.0.0",
      description: "Your Cadence English practice: progress, streak, grammar lookup, quizzes and flashcards.",
      websiteUrl: context.origin,
      icons: [{ src: `${context.origin}/favicon/web-app-manifest-512x512.png`, mimeType: "image/png", sizes: ["512x512"] }],
    },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  const ctx = { uid: context.uid, origin: context.origin, db: context.db };
  registerReadTools(server, ctx);
  if (hasScope(context.scopes, SCOPE_WRITE)) registerWriteTools(server, ctx);
  return server;
}

/** How many tools/call requests a JSON-RPC body holds (a batch may hold several). */
export function countToolCalls(body: unknown): number {
  const messages = Array.isArray(body) ? body : [body];
  return messages.filter((m) => m && typeof m === "object" && (m as { method?: unknown }).method === "tools/call").length;
}

/** Charges each tool call against the hour and day windows for the learner's plan. */
export async function limitToolCalls(uid: string, calls: number, options: { db?: Firestore; now?: number } = {}): Promise<RateLimitResult> {
  let last: RateLimitResult = { allowed: true, count: 0, limit: 0, retryAfterSeconds: 0 };
  if (calls === 0) return last;
  const plus = (await getAccount(uid, options.db)).isPlus;
  const [hour, day] = plus ? [LIMITS.mcpPlusHour, LIMITS.mcpPlusDay] : [LIMITS.mcpFreeHour, LIMITS.mcpFreeDay];
  for (let i = 0; i < calls; i += 1) {
    last = await hitAll([{ rule: hour, subject: uid, uid }, { rule: day, subject: uid, uid }], options);
    if (!last.allowed) return last;
  }
  return last;
}

/** The JSON-RPC error a rate-limited request gets, one per message that asked. */
export function rateLimitedBody(body: unknown, retryAfterSeconds: number) {
  const messages = Array.isArray(body) ? body : [body];
  const errors = messages
    .filter((m) => m && typeof m === "object" && "id" in (m as object))
    .map((m) => ({
      jsonrpc: "2.0",
      id: (m as { id: unknown }).id,
      error: { code: -32029, message: `Too many Cadence requests. Try again in ${retryAfterSeconds} seconds.`, data: { retryAfterSeconds } },
    }));
  return Array.isArray(body) ? errors : (errors[0] ?? { jsonrpc: "2.0", id: null, error: { code: -32029, message: "Too many requests.", data: { retryAfterSeconds } } });
}
