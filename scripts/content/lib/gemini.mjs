// Gemini calls for the content pipeline. Deterministic prompts (temperature 0,
// fixed seed, JSON schema), and every response cached on disk by the hash of
// model, prompt and schema, so a rerun costs nothing and gives the same text.
// The key is read from GEMINI_API_KEY or ~/.config/pstepanov/gemini.env and is
// never printed or written anywhere.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "./text.mjs";
import { CACHE_DIR } from "./paths.mjs";

export const GENERATE_MODEL = process.env.CONTENT_GENERATE_MODEL ?? "gemini-2.5-flash";
export const CHECK_MODEL = process.env.CONTENT_CHECK_MODEL ?? "gemini-2.5-flash";

const GEMINI_CACHE = join(CACHE_DIR, "gemini");

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY.trim();
  const file = join(homedir(), ".config/pstepanov/gemini.env");
  if (existsSync(file)) {
    const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*["']?([^"'\n]+)["']?/m.exec(readFileSync(file, "utf8"));
    if (match) return match[1].trim();
  }
  throw new Error("GEMINI_API_KEY is not set and ~/.config/pstepanov/gemini.env has none.");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let calls = 0;
let cached = 0;
export const geminiStats = () => ({ calls, cached });

/**
 * One JSON-returning call. `schema` is an OpenAPI-style response schema.
 * Returns the parsed JSON.
 */
export async function generateJson({ model = GENERATE_MODEL, system, prompt, schema, offline = false }) {
  const key = sha256Hex(JSON.stringify({ model, system, prompt, schema, v: 1 }));
  const file = join(GEMINI_CACHE, `${key}.json`);
  if (existsSync(file)) {
    cached += 1;
    return JSON.parse(readFileSync(file, "utf8")).result;
  }
  if (offline) throw new Error("Not in the cache and running offline.");
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      seed: 7,
      responseMimeType: "application/json",
      responseSchema: schema,
      maxOutputTokens: 32768,
    },
  };
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey() },
        body: JSON.stringify(body),
      });
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Gemini ${response.status}`);
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      const json = await response.json();
      if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(json.error?.message ?? json).slice(0, 300)}`);
      const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      const finish = json.candidates?.[0]?.finishReason;
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        lastError = new Error(`Gemini returned text that is not JSON (finish ${finish}).`);
        await sleep(1000);
        continue;
      }
      calls += 1;
      mkdirSync(GEMINI_CACHE, { recursive: true });
      writeFileSync(file, JSON.stringify({ model, at: new Date().toISOString(), result }));
      return result;
    } catch (error) {
      lastError = error;
      if (String(error.message).startsWith("Gemini 4")) throw error;
      await sleep(2000 * 2 ** attempt);
    }
  }
  throw lastError;
}

/** Runs `worker` over `items` with at most `limit` in flight; results in input order. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}
