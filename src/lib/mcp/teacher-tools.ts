// FILE: src/lib/mcp/teacher-tools.ts
//
// The connector's teacher tools (docs/PLATFORM.md section 20): what a
// learner's assistant needs to coach them through the phrase bank, slang and
// the plateau track, including hands-free spoken drills on a long drive.
//
//   free, read    search_phrases, search_slang, get_todays_drills,
//                 start_spoken_drill, next_drill_step
//   Plus, read    get_plateau_progress, list_recordings (metadata only)
//   free, write   assign_practice, log_drill_practice
//
// Static content is free for everyone. Review state, the track and recording
// metadata live in the cloud only for Plus (users/{uid}/advanced/state), so a
// free account's drill list is built from the practice list and the day's new
// phrases, and its logged results wait for a device. Audio of a recording is
// never read or returned: it stays on the learner's devices.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Firestore } from "firebase-admin/firestore";
import { z } from "zod";

import { errorProgress, trackSummary, PHASE_COPY } from "../platform/fossilization";
import { PHRASE_KINDS, PHRASE_LEVELS, PHRASE_SITUATIONS, searchPhrases, searchSlang, SLANG_FITS, SLANG_REGIONS, type Phrase, type SlangEntry } from "../platform/phrase-bank";
import { buildPracticeDay, spokenSteps, type PracticeDayItem } from "../platform/practice-day";
import type { Grade } from "../platform/srs";
import { getAccount } from "../server/entitlement";
import { db as defaultDb } from "../server/firebase";
import { applyConnectorReviews, assignPractice, isDrillStepId, isReviewItemId, queueReviews, readAdvanced, readPractice, unassignPractice, type ConnectorReview } from "../server/mcp-teacher-store";
import { getSummary, applyActivities } from "../server/sync";
import { advancedLibrary, stepText, type AdvancedLibrary } from "./advanced-content";
import type { ToolContext } from "./tools";

export const TEACHER_PLUS_REQUIRED = "This needs Cadence Plus: the plateau track and recordings are kept in the cloud only with Plus. Without it they stay on the learner's devices.";

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const ok = (summary: string, data: Record<string, unknown>): ToolResult => ({ content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(data)}` }], structuredContent: data });
const refuse = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const DRILL_TTL_MS = 6 * 60 * 60 * 1000;

// Drill sessions: stateless, signed like quizzes but with their own prefix, so
// one can never be passed where the other is expected.
function secret(env: Record<string, string | undefined> = process.env): string {
  const value = env.QUIZ_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("QUIZ_TOKEN_SECRET is not set.");
  return value;
}

export interface DrillClaims {
  uid: string;
  ids: string[];
  exp: number;
}

export function signDrill(claims: DrillClaims): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `d1.${payload}.${createHmac("sha256", secret()).update(`drill|${payload}`).digest("base64url")}`;
}

export function verifyDrill(token: unknown, uid: string, now: number): DrillClaims | null {
  if (typeof token !== "string" || token.length > 6000) return null;
  const [version, payload, mac, extra] = token.split(".");
  if (version !== "d1" || !payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(createHmac("sha256", secret()).update(`drill|${payload}`).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as DrillClaims;
    if (claims.uid !== uid || typeof claims.exp !== "number" || claims.exp < now || !Array.isArray(claims.ids)) return null;
    return claims;
  } catch {
    return null;
  }
}

function itemLinks(library: AdvancedLibrary, origin: string, itemId: string) {
  const audio = library.audio.get(itemId);
  const page = itemId.startsWith("phrase.") ? `/phrases/${encodeURIComponent(itemId)}` : itemId.startsWith("slang.") ? `/slang/${encodeURIComponent(itemId)}` : "/plateau";
  return { audioUrl: audio ? `${origin}${audio}` : null, pageUrl: `${origin}${page}` };
}

function phraseView(library: AdvancedLibrary, origin: string, p: Phrase) {
  return { id: p.id, text: p.text, kind: p.kind, level: p.level, situations: p.situations, meaning: p.meaning, example: p.example, note: p.note, ...itemLinks(library, origin, p.id) };
}

function slangView(library: AdvancedLibrary, origin: string, e: SlangEntry) {
  return {
    id: e.id,
    term: e.term,
    meaning: e.meaning,
    register: e.register,
    fits: e.fits,
    region: e.region,
    examples: e.examples,
    usageNote: e.usageNote,
    dated: e.dated,
    ...(e.datedNote ? { datedNote: e.datedNote } : {}),
    ...itemLinks(library, origin, e.id),
  };
}

const LEVEL_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Today's list: Plus from synced state, free from the practice list and the day's new phrases. */
async function todaysDrills(ctx: ToolContext, firestore: Firestore, now: number) {
  const [library, practice, account, summary] = await Promise.all([advancedLibrary(), readPractice(ctx.uid, firestore), getAccount(ctx.uid, firestore), getSummary(ctx.uid, firestore)]);
  const state = account.isPlus ? await readAdvanced(ctx.uid, firestore) : null;
  const base = summary.placementLevel && LEVEL_ORDER.indexOf(summary.placementLevel) >= 3 ? summary.placementLevel : "C1";
  const levels = [base, LEVEL_ORDER[Math.min(5, LEVEL_ORDER.indexOf(base) + 1)]];
  const day = buildPracticeDay({ day: utcDay(now), phrases: library.phrases, slang: library.slang, cards: state?.cards ?? {}, list: practice.list, track: state?.track ?? null, catalog: library.errors, levels });
  return { library, day, plus: account.isPlus, track: state?.track ?? null };
}

export function registerTeacherReadTools(server: McpServer, ctx: ToolContext) {
  const firestore = () => ctx.db ?? defaultDb();
  const now = () => (ctx.now ? ctx.now() : Date.now());

  server.registerTool(
    "search_phrases",
    {
      title: "Search the phrase bank",
      description: "Finds high-frequency chunks, collocations and sentence frames for B2 to C2 speakers by words, situation, level or kind, each with its meaning, a natural example, a usage note and links to hear it.",
      inputSchema: {
        query: z.string().max(100).optional(),
        situation: z.enum(PHRASE_SITUATIONS.map((s) => s.id) as [string, ...string[]]).optional(),
        level: z.enum(PHRASE_LEVELS).optional(),
        kind: z.enum(PHRASE_KINDS).optional(),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const library = await advancedLibrary();
      const matches = searchPhrases(library.phrases, input).map((p) => phraseView(library, ctx.origin, p));
      return ok(matches.length ? `${matches.length} phrase(s).` : "No phrase matched. Try fewer words, or a situation alone.", { matches, total: library.phrases.length });
    },
  );

  server.registerTool(
    "search_slang",
    {
      title: "Search modern slang",
      description: "Looks up current slang and informal expressions: meaning, register, where it fits (texting, friends, casual at work, not at work), region, examples, who says it and whether it now sounds dated.",
      inputSchema: {
        query: z.string().max(60).optional(),
        fit: z.enum(SLANG_FITS).optional(),
        region: z.enum(SLANG_REGIONS).optional(),
        includeDated: z.boolean().default(true),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const library = await advancedLibrary();
      const matches = searchSlang(library.slang, input).map((e) => slangView(library, ctx.origin, e));
      return ok(matches.length ? `${matches.length} entr${matches.length === 1 ? "y" : "ies"}.` : "Nothing matched that.", { matches, total: library.slang.length });
    },
  );

  server.registerTool(
    "get_todays_drills",
    {
      title: "Today's drills",
      description: "The learner's drill list for today (UTC): items you assigned, phrases and slang due for review, a few new phrases at their level, and plateau-track steps. Free accounts get the assigned items and new phrases; reviews and the plateau track need Cadence Plus.",
      inputSchema: { limit: z.number().int().min(1).max(40).default(20) },
      annotations: { readOnlyHint: true },
    },
    async ({ limit }) => {
      const { library, day, plus } = await todaysDrills(ctx, firestore(), now());
      const items = day.items.slice(0, limit).map((item) => ({ ...item, ...itemLinks(library, ctx.origin, item.itemId) }));
      const note = plus ? "Includes reviews and plateau steps synced from the learner's devices." : "Free plan: reviews due and the plateau track live on the learner's devices, so they are not listed here.";
      return ok(`${items.length} item(s) for ${day.day}.`, { day: day.day, items, counts: day.counts, note });
    },
  );

  server.registerTool(
    "start_spoken_drill",
    {
      title: "Start a spoken drill",
      description:
        "Starts a hands-free drill: returns the first sentence for the learner to say aloud, with what it means, a tip and a link to hear it, plus a sessionId. Read the sentence to them (or play audioUrl), have them repeat it the given number of times, give brief feedback, then call next_drill_step. Sources: today's list, the assigned practice list, given item ids, or a phrase search.",
      inputSchema: {
        source: z.enum(["today", "list", "items", "search"]).default("today"),
        itemIds: z.array(z.string().max(140)).max(30).optional(),
        query: z.string().max(100).optional(),
        situation: z.enum(PHRASE_SITUATIONS.map((s) => s.id) as [string, ...string[]]).optional(),
        level: z.enum(PHRASE_LEVELS).optional(),
        count: z.number().int().min(3).max(20).default(8),
      },
      annotations: { readOnlyHint: true },
    },
    async (input) => {
      const at = now();
      let items: PracticeDayItem[];
      let library: AdvancedLibrary;
      if (input.source === "today" || input.source === "list") {
        const result = await todaysDrills(ctx, firestore(), at);
        library = result.library;
        items = input.source === "list" ? result.day.items.filter((i) => i.reason === "assigned") : result.day.items;
      } else if (input.source === "items") {
        library = await advancedLibrary();
        items = (input.itemIds ?? [])
          .map((id) => ({ id, text: stepText(library, id) }))
          .filter((x): x is { id: string; text: NonNullable<ReturnType<typeof stepText>> } => Boolean(x.text))
          .map(({ id, text }) => ({ itemId: id, kind: id.startsWith("phrase.") ? "phrase" : id.startsWith("slang.") ? "slang" : "drill", reason: "assigned", ...text }) as PracticeDayItem);
      } else {
        library = await advancedLibrary();
        items = searchPhrases(library.phrases, { query: input.query, situation: input.situation, level: input.level, limit: input.count }).map((p) => ({ itemId: p.id, kind: "phrase", reason: "new", say: p.example, meaning: `${p.text}: ${p.meaning}`, tip: p.note }));
      }
      const steps = spokenSteps(items, input.count);
      if (steps.length === 0) return refuse(input.source === "list" ? "The practice list is empty. Add items with assign_practice, or use source today." : "Nothing to drill from that. Try source today, or another search.");
      const sessionId = signDrill({ uid: ctx.uid, ids: steps.map((s) => s.itemId), exp: at + DRILL_TTL_MS });
      return ok(`Spoken drill, ${steps.length} sentences. Step 1: "${steps[0].say}"`, { sessionId, step: { ...steps[0], ...itemLinks(library, ctx.origin, steps[0].itemId) } });
    },
  );

  server.registerTool(
    "next_drill_step",
    {
      title: "Next drill step",
      description: "The next sentence of a spoken drill from start_spoken_drill: pass the sessionId and the number of the step just finished. Returns done with the item ids once the last one is said; then log them with log_drill_practice.",
      inputSchema: { sessionId: z.string().max(6000), after: z.number().int().min(0).max(30) },
      annotations: { readOnlyHint: true },
    },
    async ({ sessionId, after }) => {
      const claims = verifyDrill(sessionId, ctx.uid, now());
      if (!claims) return refuse("That drill has expired or isn't valid. Start a new one with start_spoken_drill.");
      if (after >= claims.ids.length) return ok("That was the last one.", { done: true, itemIds: claims.ids, total: claims.ids.length });
      const library = await advancedLibrary();
      const id = claims.ids[after];
      let text = stepText(library, id);
      if (!text && id.startsWith("own.")) {
        // The learner's own corrected sentences live only in their synced track.
        const own = (await readAdvanced(ctx.uid, firestore())).track?.ownSentences.find((s) => `own.${s.id}` === id);
        if (own) text = { say: own.text, meaning: "A sentence from your own speech, corrected.", tip: own.said ? `You said: "${own.said}".` : "Say it three times, the same way each time." };
      }
      if (!text) text = { say: "", meaning: "This item is no longer available; skip it.", tip: "" };
      const step = { n: after + 1, total: claims.ids.length, itemId: id, ...text, reps: id.startsWith("fossil.") ? 3 : 2, ...itemLinks(library, ctx.origin, id) };
      return ok(`Step ${step.n} of ${step.total}: "${step.say}"`, { done: false, step });
    },
  );

  server.registerTool(
    "get_plateau_progress",
    {
      title: "Plateau track progress",
      description: "Cadence Plus: the learner's 10 to 12 week program for fossilized errors: week, phase, which errors are in focus, progress per error from the weekly re-tests (baseline, latest, trend, persistent, improving or fixed) and when the next re-test is.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => {
      if (!(await getAccount(ctx.uid, firestore())).isPlus) return refuse(TEACHER_PLUS_REQUIRED);
      const [state, library] = await Promise.all([readAdvanced(ctx.uid, firestore()), advancedLibrary()]);
      if (!state.track) return ok("The learner hasn't started the plateau track. It begins with a 10-minute diagnostic in the app.", { onTrack: false });
      const summary = trackSummary(state.track, utcDay(now()));
      const errors = errorProgress(state.track).map((p) => ({ ...p, title: library.errorById.get(p.errorId)?.title ?? p.errorId, area: library.errorById.get(p.errorId)?.area ?? null, active: summary.activeErrors.includes(p.errorId) }));
      return ok(`Week ${summary.week} of ${summary.weeks} (${PHASE_COPY[summary.phase].title}). ${summary.fixed} fixed, ${summary.improving} improving.`, {
        onTrack: true,
        week: summary.week,
        weeks: summary.weeks,
        phase: summary.phase,
        phaseDetail: PHASE_COPY[summary.phase].detail,
        daysLeft: summary.daysLeft,
        retestDue: summary.retestDue,
        nextRetestDay: summary.nextRetestDay,
        errors,
        ownSentences: state.track.ownSentences.length,
      });
    },
  );

  server.registerTool(
    "list_recordings",
    {
      title: "Recordings",
      description: "Cadence Plus: the learner's own recordings, newest first: which item, the sentence, when, how long, and the score if it was scored. Metadata only: the audio stays on the learner's devices and is never sent here.",
      inputSchema: { itemId: z.string().max(140).optional(), limit: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true },
    },
    async ({ itemId, limit }) => {
      if (!(await getAccount(ctx.uid, firestore())).isPlus) return refuse(TEACHER_PLUS_REQUIRED);
      const state = await readAdvanced(ctx.uid, firestore());
      const recordings = state.recordings
        .filter((r) => !itemId || r.itemId === itemId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(({ id, itemId: item, kind, text, createdAt, durationMs, score, device }) => ({ id, itemId: item, kind, text, at: new Date(createdAt).toISOString(), durationMs, score: score ?? null, device }));
      return ok(`${recordings.length} recording(s). The audio stays on the learner's devices.`, { recordings, note: "Audio is never uploaded; play it in the Cadence app on the device that made it." });
    },
  );
}

export function registerTeacherWriteTools(server: McpServer, ctx: ToolContext) {
  const firestore = () => ctx.db ?? defaultDb();
  const now = () => (ctx.now ? ctx.now() : Date.now());

  server.registerTool(
    "assign_practice",
    {
      title: "Assign practice",
      description: "Adds phrase-bank or slang items (ids from search_phrases or search_slang) to the learner's practice list, so they come first in today's drills on every device; or removes them. The list holds 200.",
      inputSchema: {
        itemIds: z.array(z.string().max(100)).min(1).max(50),
        note: z.string().max(200).optional(),
        remove: z.boolean().default(false),
      },
    },
    async ({ itemIds, note, remove }) => {
      const library = await advancedLibrary();
      const known = [...new Set(itemIds)].filter((id) => library.phraseById.has(id) || library.slangById.has(id));
      const unknown = itemIds.filter((id) => !known.includes(id));
      if (known.length === 0) return refuse("None of those ids is in the phrase bank or slang. Use the ids that search_phrases and search_slang return.");
      if (remove) {
        const removed = await unassignPractice(ctx.uid, known, firestore(), now());
        return ok(`Removed ${removed} item(s) from the practice list.`, { removed, unknown });
      }
      const result = await assignPractice(ctx.uid, known.map((itemId) => ({ itemId, note })), firestore(), now());
      return ok(`Added ${result.added} item(s); the list holds ${result.total}.`, { added: result.added, total: result.total, unknown });
    },
  );

  server.registerTool(
    "log_drill_practice",
    {
      title: "Log drill practice",
      description: "Records that the learner practised items (from a spoken drill or today's list) and how it went: again (couldn't), hard, good or easy. Updates their streak and minutes; with Cadence Plus it schedules each item's next review at once, otherwise the results reach their device the next time they open Cadence. Only log what the learner actually did.",
      inputSchema: {
        items: z.array(z.object({ itemId: z.string().max(140), result: z.enum(["again", "hard", "good", "easy"]) })).min(1).max(50),
        minutes: z.number().int().min(1).max(180),
      },
    },
    async ({ items, minutes }) => {
      const at = now();
      const day = utcDay(at);
      const reviews: ConnectorReview[] = items.filter((i) => isReviewItemId(i.itemId) || isDrillStepId(i.itemId)).map((i) => ({ itemId: i.itemId, grade: i.result as Grade, at }));
      if (reviews.length === 0) return refuse("None of those ids is a phrase, slang or plateau drill item.");
      const good = reviews.filter((r) => r.grade !== "again").length;
      const summary = await applyActivities(ctx.uid, [{ kind: "shadowing", refId: "mcp.drill", level: null, score: Math.round((good / reviews.length) * 100), minutes, day, at }], firestore());
      if ((await getAccount(ctx.uid, firestore())).isPlus) {
        const { applied } = await applyConnectorReviews(ctx.uid, reviews, day, firestore(), at);
        return ok(`Logged ${applied} item(s) and ${minutes} minutes. Streak: ${summary.streak.current} days.`, { logged: applied, streak: summary.streak.current, note: "Next reviews are scheduled on every device." });
      }
      const { queued, dropped } = await queueReviews(ctx.uid, reviews, firestore(), at);
      return ok(`Logged ${minutes} minutes. Streak: ${summary.streak.current} days.`, { logged: queued, streak: summary.streak.current, note: dropped ? `${dropped} result(s) didn't fit; the queue holds 200 until the app picks them up.` : "The results reach the learner's device the next time they open Cadence." });
    },
  );
}
