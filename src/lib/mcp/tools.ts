// FILE: src/lib/mcp/tools.ts
//
// The Cadence connector's tools (docs/PLATFORM.md section 8). Every tool acts
// on the uid bound to the access token and no other. Free accounts get the
// summary-level tools; the detail tools check Plus on every call from
// users/{uid}.plus and answer "This needs Cadence Plus." otherwise. Write tools
// are registered only for a cadence:write grant.
import { randomBytes } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { CEFR_LEVELS, gradeExercise, type Exercise, type ExerciseAnswer } from "../platform/content-model";
import { ACTIVITY_KINDS, currentStreak, type Activity, type ActivityKind } from "../platform/progress-model";
import { ENGLISH_SOUNDS } from "../platform/vocal-tract/articulation";
import { getAccount } from "../server/entitlement";
import { db as defaultDb } from "../server/firebase";
import { contentLibrary, searchGrammar } from "../server/packs";
import { addToInbox, applyActivities, getSummary } from "../server/sync";
import type { AttemptRecord, GrammarMastery, SoundMastery } from "../server/sync-input";
import { expectedAnswer, matchingMappingFromOptions, pickExercises, presentExercise, signQuiz, verifyQuiz, QUIZ_TTL_MS } from "./quiz";

export const PLUS_REQUIRED = "This needs Cadence Plus. The free connector covers your progress overview, streak, grammar lookup, quizzes and adding flashcards.";

export interface ToolContext {
  uid: string;
  origin: string;
  db?: Firestore;
  now?: () => number;
}

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function ok(summary: string, data: Record<string, unknown>): ToolResult {
  return { content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data)}` }], structuredContent: data };
}

function refuse(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

async function requirePlus(ctx: ToolContext): Promise<boolean> {
  return (await getAccount(ctx.uid, ctx.db ?? defaultDb())).isPlus;
}

const levelSchema = z.enum(CEFR_LEVELS);

// Read tools, every account ----------------------------------------------------

export function registerReadTools(server: McpServer, ctx: ToolContext) {
  const firestore = () => ctx.db ?? defaultDb();
  const now = () => (ctx.now ? ctx.now() : Date.now());

  server.registerTool(
    "get_progress_overview",
    {
      title: "Progress overview",
      description: "The learner's plan, streak, total practice minutes, lessons completed per CEFR level, placement level, last active time and 20 most recent results. Call this first for anything about progress.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      const [account, summary] = await Promise.all([getAccount(ctx.uid, firestore()), getSummary(ctx.uid, firestore())]);
      const data = {
        plan: account.isPlus ? "plus" : "free",
        streak: { current: currentStreak(summary, utcDay(now())), best: summary.streak.best },
        totalMinutes: summary.totalMinutes,
        lessonsCompleted: summary.lessonsCompleted,
        placementLevel: summary.placementLevel,
        lastActiveAt: summary.lastActiveAt,
        recent: summary.recent,
      };
      return ok(`Plan: ${data.plan}. Streak ${data.streak.current} days (best ${data.streak.best}), ${data.totalMinutes} minutes in total.`, data);
    },
  );

  server.registerTool(
    "get_streak",
    { title: "Streak", description: "The learner's current and best daily practice streak and whether they practised today (UTC).", inputSchema: {}, annotations: { readOnlyHint: true } },
    async () => {
      const summary = await getSummary(ctx.uid, firestore());
      const today = utcDay(now());
      const data = { current: currentStreak(summary, today), best: summary.streak.best, lastDay: summary.streak.lastDay, activeToday: summary.streak.lastDay === today };
      return ok(`${data.current}-day streak${data.activeToday ? ", practised today" : ""}.`, data);
    },
  );

  server.registerTool(
    "lookup_grammar",
    {
      title: "Look up grammar",
      description: "Finds grammar points in Cadence's lessons by name or form (e.g. 'present perfect', 'third conditional'), with patterns, examples and common errors.",
      inputSchema: { query: z.string().min(1).max(100), level: levelSchema.optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ query, level }) => {
      const library = await contentLibrary();
      const matches = searchGrammar(library, query, level).map((gp) => ({
        id: gp.id,
        title: gp.title,
        level: gp.level,
        summary: gp.summary,
        patterns: gp.patterns,
        examples: gp.examples.slice(0, 3).map((e) => e.text),
        commonErrors: gp.commonErrors.slice(0, 2),
        url: `${ctx.origin}/learn/grammar/${encodeURIComponent(gp.id)}`,
      }));
      return ok(matches.length ? `${matches.length} grammar point(s) found.` : "No grammar point matched that query.", { matches });
    },
  );

  server.registerTool(
    "start_quiz",
    {
      title: "Start a quiz",
      description: "Picks 3 to 10 exercises from Cadence's lessons, optionally for one grammar point, topic or level, and returns them without answers. Present them to the learner, then pass their answers to grade_quiz with the quizId.",
      inputSchema: { grammarPointId: z.string().max(96).optional(), topic: z.string().max(96).optional(), level: levelSchema.optional(), count: z.number().int().min(3).max(10).default(5) },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const library = await contentLibrary();
      const chosen = pickExercises(library.exercises.values(), { grammarPointId: input.grammarPointId, topic: input.topic, level: input.level, count: input.count }, (gp) => library.grammarPoints.get(gp)?.topicId);
      if (chosen.length === 0) return refuse("No exercises match that. Try another grammar point or level, or none at all.");
      const quizId = signQuiz({ uid: ctx.uid, ids: chosen.map((e) => e.id), exp: now() + QUIZ_TTL_MS });
      const questions = chosen.map((exercise, index) => presentExercise(exercise, index + 1));
      return ok(`Quiz with ${questions.length} questions. Answers: multiple_choice {choice: index}; matching {matches: [right item for each left item]}; gap_fill {gaps: [...]}; sentence_building {tokens: [...]}; error_correction and transformation {text}.`, { quizId, questions });
    },
  );

  server.registerTool(
    "grade_quiz",
    {
      title: "Grade a quiz",
      description: "Grades the learner's answers to a quiz from start_quiz and adds the result to their progress.",
      inputSchema: {
        quizId: z.string().max(4000),
        answers: z
          .array(
            z.object({
              n: z.number().int().min(1).max(10),
              answer: z.object({
                choice: z.number().int().min(0).max(10).optional(),
                matches: z.array(z.string().max(200)).max(8).optional(),
                gaps: z.array(z.string().max(200)).max(10).optional(),
                tokens: z.array(z.string().max(60)).max(20).optional(),
                text: z.string().max(500).optional(),
              }),
            }),
          )
          .max(10),
      },
    },
    async ({ quizId, answers }) => {
      const claims = verifyQuiz(quizId, ctx.uid, now());
      if (!claims) return refuse("That quiz has expired or isn't valid. Start a new one with start_quiz.");
      const library = await contentLibrary();
      const results = claims.ids.map((id, index) => {
        const exercise = library.exercises.get(id);
        const given = answers.find((a) => a.n === index + 1)?.answer;
        if (!exercise) return { n: index + 1, correct: false, expected: "", explanation: "This exercise is no longer available.", grammarPointId: null, score: 0 };
        const answer = toExerciseAnswer(exercise, given);
        const grade = answer ? gradeExercise(exercise, answer) : { correct: false, score: 0 };
        return { n: index + 1, correct: grade.correct, expected: expectedAnswer(exercise), explanation: exercise.explanation ?? "", grammarPointId: exercise.grammarPointIds[0] ?? null, score: grade.score };
      });
      const score = Math.round((results.reduce((sum, r) => sum + r.score, 0) / Math.max(1, results.length)) * 100);
      const at = now();
      const firstExercise = library.exercises.get(claims.ids[0]);
      await applyActivities(ctx.uid, [{ kind: "quiz", refId: `quiz.${quizId.slice(-12).toLowerCase().replace(/[^a-z0-9]/g, "x")}`, level: firstExercise?.level ?? null, score, minutes: Math.max(1, Math.round(results.length / 2)), day: utcDay(at), at }], ctx.db ?? defaultDb());
      if (await requirePlus(ctx)) await recordQuizAttempt(ctx, at, score, results.map((r) => r.grammarPointId).filter((id): id is string => Boolean(id)));
      return ok(`Score ${score}%. ${results.filter((r) => r.correct).length} of ${results.length} correct.`, { score, results: results.map((r) => ({ n: r.n, correct: r.correct, expected: r.expected, explanation: r.explanation, grammarPointId: r.grammarPointId })) });
    },
  );

  // Plus ---------------------------------------------------------------

  server.registerTool(
    "get_weak_areas",
    {
      title: "Weak sounds and grammar",
      description: "Cadence Plus: the learner's weakest sounds (by pronunciation score) and grammar points (by accuracy), worst first, with attempts and trend.",
      inputSchema: { limit: z.number().int().min(1).max(20).default(5) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      if (!(await requirePlus(ctx))) return refuse(PLUS_REQUIRED);
      const user = firestore().collection("users").doc(ctx.uid);
      const [sounds, grammar, library] = await Promise.all([user.collection("mastery").doc("sounds").get(), user.collection("mastery").doc("grammar").get(), contentLibrary()]);
      const soundItems = (sounds.data()?.items ?? {}) as Record<string, SoundMastery>;
      const grammarItems = (grammar.data()?.items ?? {}) as Record<string, GrammarMastery>;
      const data = {
        sounds: Object.entries(soundItems)
          .filter(([, m]) => m.attempts > 0)
          .sort((a, b) => a[1].ema - b[1].ema)
          .slice(0, limit)
          .map(([soundId, m]) => ({ soundId, ipa: ENGLISH_SOUNDS.find((s) => s.id === soundId)?.ipa.GA ?? null, score: Math.round(m.ema), attempts: m.attempts, trend: trendOf(m.history) })),
        grammar: Object.entries(grammarItems)
          .filter(([, m]) => m.attempts > 0)
          .map(([grammarPointId, m]) => ({ grammarPointId, title: library.grammarPoints.get(grammarPointId)?.title ?? grammarPointId, accuracy: Math.round((m.correct / m.attempts) * 100), attempts: m.attempts }))
          .sort((a, b) => a.accuracy - b.accuracy)
          .slice(0, limit),
      };
      return ok(`${data.sounds.length} weak sound(s), ${data.grammar.length} weak grammar point(s).`, data);
    },
  );

  server.registerTool(
    "get_due_flashcards",
    {
      title: "Due flashcards",
      description: "Cadence Plus: flashcards due for review today across all the learner's devices, most overdue first.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      if (!(await requirePlus(ctx))) return refuse(PLUS_REQUIRED);
      const today = utcDay(now());
      const decks = await firestore().collection("users").doc(ctx.uid).collection("srs").get();
      const library = await contentLibrary();
      const due: { cardId: string; front: string; back: string; due: string; interval: number }[] = [];
      for (const deck of decks.docs) {
        for (const [cardId, card] of Object.entries((deck.data().cards ?? {}) as Record<string, Record<string, unknown>>)) {
          const dueDay = typeof card.due === "string" ? card.due : "";
          if (!dueDay || dueDay > today) continue;
          const content = library.exercises.get(cardId) as Extract<Exercise, { kind: "flashcard" }> | undefined;
          due.push({ cardId, front: String(card.front ?? content?.front ?? ""), back: String(card.back ?? content?.back ?? ""), due: dueDay, interval: Number(card.interval ?? 0) });
        }
      }
      due.sort((a, b) => a.due.localeCompare(b.due));
      const data = { dueToday: due.filter((c) => c.due === today).length, overdue: due.filter((c) => c.due < today).length, cards: due.slice(0, limit) };
      return ok(`${due.length} card(s) due.`, data);
    },
  );

  server.registerTool(
    "get_practice_history",
    {
      title: "Practice history",
      description: "Cadence Plus: the learner's practice attempts between two days (YYYY-MM-DD, default the last 7 days), newest first, optionally of one kind.",
      inputSchema: {
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        kind: z.enum(ACTIVITY_KINDS).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().max(40).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      if (!(await requirePlus(ctx))) return refuse(PLUS_REQUIRED);
      const page = await historyPage(ctx, input);
      return ok(`${page.items.length} attempt(s).`, page);
    },
  );

  server.registerTool(
    "get_quiz_history",
    {
      title: "Quiz history",
      description: "Cadence Plus: the learner's quiz results from the connector, newest first.",
      inputSchema: { limit: z.number().int().min(1).max(50).default(20), cursor: z.string().max(40).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ limit, cursor }) => {
      if (!(await requirePlus(ctx))) return refuse(PLUS_REQUIRED);
      const page = await historyPage(ctx, { kind: "quiz", limit, cursor, from: utcDay(now() - 180 * 86_400_000) });
      const quizzes = page.items.map((a) => ({ at: a.at, score: a.score, grammarPointIds: ((a.detail?.grammarPointIds as string[] | undefined) ?? []).slice(0, 10) }));
      return ok(`${quizzes.length} quiz result(s).`, { quizzes, nextCursor: page.nextCursor });
    },
  );
}

// Write tools ---------------------------------------------------------------

export function registerWriteTools(server: McpServer, ctx: ToolContext) {
  const firestore = () => ctx.db ?? defaultDb();
  const now = () => (ctx.now ? ctx.now() : Date.now());

  server.registerTool(
    "add_flashcards",
    {
      title: "Add flashcards",
      description: "Adds 1 to 20 flashcards to the learner's review queue. Free accounts get them on their device the next time they open Cadence; Cadence Plus adds them straight to spaced review on every device.",
      inputSchema: {
        cards: z
          .array(z.object({ front: z.string().min(1).max(200), back: z.string().min(1).max(400), example: z.string().max(300).optional() }))
          .min(1)
          .max(20),
      },
    },
    async ({ cards }) => {
      const at = now();
      const withIds = cards.map((card) => ({ id: `card.mcp.${randomBytes(6).toString("hex")}`, front: card.front.trim(), back: card.back.trim(), ...(card.example ? { example: card.example.trim() } : {}) }));
      if (await requirePlus(ctx)) {
        const ref = firestore().collection("users").doc(ctx.uid).collection("srs").doc("mcp");
        await firestore().runTransaction(async (tx) => {
          const existing = ((await tx.get(ref)).data()?.cards ?? {}) as Record<string, unknown>;
          const added = Object.fromEntries(withIds.map((c) => [c.id, { front: c.front, back: c.back, ...(c.example ? { example: c.example } : {}), reps: 0, interval: 0, ease: 2.5, lapses: 0, due: utcDay(at), source: "mcp", updatedAt: at }]));
          tx.set(ref, { cards: { ...existing, ...added }, updatedAt: at });
        });
        return ok(`Added ${withIds.length} card(s) to spaced review.`, { queued: withIds.length, note: "Added to spaced review on every device." });
      }
      const result = await addToInbox(ctx.uid, withIds, firestore(), at);
      const note = result.dropped ? `${result.dropped} card(s) didn't fit: the queue holds 200 until the app picks them up.` : "They'll appear in Cadence the next time the learner opens the app.";
      return ok(`Queued ${result.queued} card(s).`, { queued: result.queued, note });
    },
  );

  server.registerTool(
    "log_practice",
    {
      title: "Log practice",
      description: "Records practice the learner did (minutes, and a score from 0 to 100 if there was one). Updates their streak and totals.",
      inputSchema: { kind: z.enum(ACTIVITY_KINDS), minutes: z.number().int().min(1).max(180), refId: z.string().max(96).optional(), score: z.number().min(0).max(100).optional() },
    },
    async ({ kind, minutes, refId, score }) => {
      const at = now();
      const activity: Activity = { kind: kind as ActivityKind, refId: refId && /^[a-z0-9][a-z0-9._:-]{0,95}$/.test(refId) ? refId : `mcp.${kind}`, level: null, score: score ?? null, minutes, day: utcDay(at), at };
      const summary = await applyActivities(ctx.uid, [activity], firestore());
      return ok(`Logged ${minutes} minutes of ${kind}. Streak: ${summary.streak.current} days.`, summary as unknown as Record<string, unknown>);
    },
  );
}

// Helpers ---------------------------------------------------------------

type GivenAnswer = { choice?: number; matches?: string[]; gaps?: string[]; tokens?: string[]; text?: string } | undefined;

export function toExerciseAnswer(exercise: Exercise, given: GivenAnswer): ExerciseAnswer | null {
  if (!given) return null;
  switch (exercise.kind) {
    case "multiple_choice":
      return typeof given.choice === "number" ? { kind: "multiple_choice", choice: given.choice } : null;
    case "matching":
      return given.matches ? { kind: "matching", mapping: matchingMappingFromOptions(exercise, given.matches) } : null;
    case "gap_fill":
      return given.gaps ? { kind: "gap_fill", gaps: given.gaps } : null;
    case "sentence_building":
      return given.tokens ? { kind: "sentence_building", tokens: given.tokens } : given.text ? { kind: "sentence_building", tokens: given.text.split(/\s+/) } : null;
    case "error_correction":
      return typeof given.text === "string" ? { kind: "error_correction", text: given.text } : null;
    case "transformation":
      return typeof given.text === "string" ? { kind: "transformation", text: given.text } : null;
    default:
      return null;
  }
}

export function trendOf(history: { day: string; score: number }[]): "up" | "down" | "flat" | "new" {
  if (history.length < 4) return "new";
  const half = Math.floor(history.length / 2);
  const avg = (items: { score: number }[]) => items.reduce((s, h) => s + h.score, 0) / items.length;
  const delta = avg(history.slice(half)) - avg(history.slice(0, half));
  return delta > 3 ? "up" : delta < -3 ? "down" : "flat";
}

async function recordQuizAttempt(ctx: ToolContext, at: number, score: number, grammarPointIds: string[]) {
  const firestore = ctx.db ?? defaultDb();
  const ref = firestore.collection("users").doc(ctx.uid).collection("attempts").doc(utcDay(at));
  const attempt: AttemptRecord = { id: `quiz-${randomBytes(6).toString("hex")}`, kind: "quiz", refId: "mcp.quiz", at, score, detail: { grammarPointIds: [...new Set(grammarPointIds)] } };
  await firestore.runTransaction(async (tx) => {
    const items = ((await tx.get(ref)).data()?.items ?? []) as AttemptRecord[];
    if (items.length >= 500) return;
    tx.set(ref, { items: [...items, attempt], updatedAt: at });
  });
}

/**
 * Attempts newest first across day documents. The cursor is `<day>:<index>`:
 * the next page starts at that position.
 */
async function historyPage(ctx: ToolContext, input: { from?: string; to?: string; kind?: string; limit: number; cursor?: string }) {
  const firestore = ctx.db ?? defaultDb();
  const nowMs = ctx.now ? ctx.now() : Date.now();
  const to = input.to ?? utcDay(nowMs);
  const from = input.from ?? utcDay(nowMs - 6 * 86_400_000);
  const [cursorDay, cursorIndexText] = (input.cursor ?? "").split(":");
  const cursorIndex = Number(cursorIndexText) || 0;
  const snapshot = await firestore
    .collection("users")
    .doc(ctx.uid)
    .collection("attempts")
    .where("__name__", ">=", firestore.collection("users").doc(ctx.uid).collection("attempts").doc(from))
    .where("__name__", "<=", firestore.collection("users").doc(ctx.uid).collection("attempts").doc(`${to}-9`))
    .get();
  const items = snapshot.docs
    .flatMap((doc) => ((doc.data().items ?? []) as AttemptRecord[]).map((a) => a))
    .filter((a) => !input.kind || a.kind === input.kind)
    .sort((a, b) => b.at - a.at);
  const start = cursorDay ? Math.max(0, cursorIndex) : 0;
  const page = items.slice(start, start + input.limit);
  const nextCursor = start + input.limit < items.length ? `${to}:${start + input.limit}` : null;
  return { items: page, nextCursor };
}
