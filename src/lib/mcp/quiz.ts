// FILE: src/lib/mcp/quiz.ts
//
// Stateless quizzes for the MCP tools. start_quiz picks exercises from the
// packs and returns them without answers; the quizId is an HMAC-signed token
// of the exercise ids, the learner's uid and an expiry, so grade_quiz needs no
// stored state and cannot be pointed at another person's quiz or forged to
// grade a different set. QUIZ_TOKEN_SECRET signs it.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import type { CefrLevel, Exercise } from "../platform/content-model";

/** Kinds a connected client can present and grade in text: no audio, no self-grading. */
export const QUIZ_KINDS = new Set(["multiple_choice", "matching", "gap_fill", "sentence_building", "error_correction", "transformation"]);
export const QUIZ_TTL_MS = 2 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

function secret(env: Env): string {
  const value = env.QUIZ_TOKEN_SECRET?.trim();
  if (!value || value.length < 32) throw new Error("QUIZ_TOKEN_SECRET is not set.");
  return value;
}

export interface QuizClaims {
  uid: string;
  ids: string[];
  exp: number;
}

export function signQuiz(claims: QuizClaims, env: Env = process.env): string {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const mac = createHmac("sha256", secret(env)).update(payload).digest("base64url");
  return `q1.${payload}.${mac}`;
}

export function verifyQuiz(token: unknown, uid: string, now = Date.now(), env: Env = process.env): QuizClaims | null {
  if (typeof token !== "string" || token.length > 4000) return null;
  const [version, payload, mac, extra] = token.split(".");
  if (version !== "q1" || !payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(createHmac("sha256", secret(env)).update(payload).digest("base64url"));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as QuizClaims;
    if (claims.uid !== uid || typeof claims.exp !== "number" || claims.exp < now || !Array.isArray(claims.ids)) return null;
    return claims;
  } catch {
    return null;
  }
}

export interface QuizFilter {
  grammarPointId?: string;
  topic?: string;
  level?: CefrLevel;
  count: number;
}

/** Exercises that fit the filter, sampled without repeats. */
export function pickExercises(all: Iterable<Exercise>, filter: QuizFilter, grammarTopic: (gpId: string) => string | undefined, pick: (n: number) => number = randomInt): Exercise[] {
  const pool = [...all].filter((ex) => {
    if (!QUIZ_KINDS.has(ex.kind)) return false;
    if (filter.level && ex.level !== filter.level) return false;
    if (filter.grammarPointId && !ex.grammarPointIds.includes(filter.grammarPointId)) return false;
    if (filter.topic && !ex.grammarPointIds.some((gp) => grammarTopic(gp) === filter.topic)) return false;
    return true;
  });
  const chosen: Exercise[] = [];
  while (chosen.length < filter.count && pool.length > 0) chosen.push(pool.splice(pick(pool.length), 1)[0]);
  return chosen;
}

/** The question as the client sees it: everything needed to answer, nothing that gives the answer. */
export function presentExercise(exercise: Exercise, n: number) {
  const base = { n, kind: exercise.kind, prompt: exercise.prompt };
  switch (exercise.kind) {
    case "multiple_choice":
      return { ...base, question: exercise.question, options: exercise.options };
    case "matching": {
      // Right column in a fixed order that is not the answer order: sorted.
      const right = exercise.pairs.map((p) => p.right).sort((a, b) => a.localeCompare(b));
      return { ...base, left: exercise.pairs.map((p) => p.left), options: right };
    }
    case "gap_fill":
      return { ...base, text: exercise.text, ...(exercise.bank ? { options: exercise.bank } : {}) };
    case "sentence_building":
      return { ...base, tokens: [...exercise.answer, ...(exercise.distractors ?? [])].sort((a, b) => a.localeCompare(b)) };
    case "error_correction":
      return { ...base, text: exercise.sentence };
    case "transformation":
      return { ...base, text: exercise.source, question: exercise.instruction };
    default:
      return base;
  }
}

/** The expected answer, in words, for the results. */
export function expectedAnswer(exercise: Exercise): string {
  switch (exercise.kind) {
    case "multiple_choice":
      return exercise.options[exercise.answer] ?? "";
    case "matching":
      return exercise.pairs.map((p) => `${p.left} = ${p.right}`).join("; ");
    case "gap_fill":
      return exercise.answers.map((a) => a[0]).join(" / ");
    case "sentence_building":
      return exercise.answer.join(" ");
    case "error_correction":
    case "transformation":
      return exercise.answers[0] ?? "";
    default:
      return "";
  }
}

/**
 * The client answers matching by naming right-hand items; the grader wants
 * indexes into the original pairs. This maps the presented (sorted) right
 * column back.
 */
export function matchingMappingFromOptions(exercise: Extract<Exercise, { kind: "matching" }>, chosenRight: string[]): number[] {
  return chosenRight.map((text) => exercise.pairs.findIndex((p) => p.right === text));
}
