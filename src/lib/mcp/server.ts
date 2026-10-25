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
import { registerTeacherReadTools, registerTeacherWriteTools } from "./teacher-tools";
import { registerReadTools, registerWriteTools } from "./tools";

export const INSTRUCTIONS = `Cadence is an English learning app for advanced learners: pronunciation, grammar by CEFR level, quizzes, flashcards and conversation practice.
Every tool acts on the account that approved this connection and no other.

Start with get_progress_overview for anything about progress. Days are UTC days, YYYY-MM-DD.

Free tools: get_progress_overview, get_streak, lookup_grammar, start_quiz and grade_quiz, add_flashcards and log_practice (these two need write access).
Also free: search_phrases, search_slang, get_todays_drills, start_spoken_drill, next_drill_step, and assign_practice and log_drill_practice (write access).
Cadence Plus tools: get_weak_areas, get_due_flashcards, get_practice_history, get_quiz_history, get_plateau_progress, list_recordings. For a free account they answer that Plus is needed; pass that on plainly and do not retry.

Quizzes: start_quiz returns questions without answers. Ask the learner each one, then send their own answers to grade_quiz with the quizId; never answer for them. Tell them which ones were wrong and why, using the explanations.

Flashcards: add_flashcards takes what the learner wants to remember (a word, phrase or pattern on the front, the meaning or a correct form on the back). Only log practice the learner says they did.

Teaching (phrases, slang, the plateau track):
- search_phrases and search_slang browse Cadence's phrase bank (chunks, collocations and sentence frames for B2 to C2, by situation) and its modern-slang dictionary. Teach phrases, not single words.
- get_todays_drills lists what to practise today. assign_practice puts items on the learner's practice list so they come first on every device.
- Spoken drills, for example on a drive: start_spoken_drill returns one sentence at a time with a sessionId. Say the sentence (or play audioUrl when it is not null), have the learner repeat it the number of times in reps, give one short, specific note on rhythm, stress or the target phrase, then call next_drill_step with the step number just done. Keep each turn short; never read out ids or JSON. At the end, log what they did with log_drill_practice, rating each item honestly (again, hard, good, easy).
- get_plateau_progress (Plus) reports the learner's program for fossilized errors; list_recordings (Plus) lists their recordings' metadata. Recording audio stays on their devices and is never available here.

Tone: precise, adult and brief. This learner is advanced: correct the detail that matters, skip praise for basics. Mistakes are information, not failure.`;

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
      description: "Your Cadence English practice: progress, streak, grammar lookup, quizzes, flashcards, the phrase bank, slang, spoken drills and the plateau track.",
      websiteUrl: context.origin,
      icons: [{ src: `${context.origin}/favicon/web-app-manifest-512x512.png`, mimeType: "image/png", sizes: ["512x512"] }],
    },
    { capabilities: { tools: {} }, instructions: INSTRUCTIONS },
  );

  const ctx = { uid: context.uid, origin: context.origin, db: context.db };
  registerReadTools(server, ctx);
  registerTeacherReadTools(server, ctx);
  if (hasScope(context.scopes, SCOPE_WRITE)) {
    registerWriteTools(server, ctx);
    registerTeacherWriteTools(server, ctx);
  }
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
