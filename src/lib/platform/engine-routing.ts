// FILE: src/lib/platform/engine-routing.ts
//
// Where an AI request runs, and who may run it. One pure decision shared by
// web, desktop and mobile: a reachable paired Cadence first (free, for
// everyone), then the Cadence cloud for Plus, otherwise an offer to connect
// your own Cadence or get Plus. Also the entitlement rule (Plus from either
// billing source), the data tier that follows from it, the daily cloud quotas
// and the audio upload limits. docs/PLATFORM.md is the written spec.
//
// Twin: mobile/src/platform/engine-routing.ts, byte-identical below this
// header, checked by tests/platform/drift.test.ts.

/**
 * What an AI request asks for. Non-AI practice (lessons, quizzes, flashcards,
 * matching, the mouth map) never goes through routing.
 */
export const AI_CAPABILITIES = ["score", "tts", "transcribe", "coach", "grammar_feedback", "placement"] as const;
export type AiCapability = (typeof AI_CAPABILITIES)[number];

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

export type PlusSource = "stripe" | "app_store";

/**
 * What a verified webhook writes, per source, at users/{uid}.plusSources.<source>,
 * and the resolved copy at users/{uid}.plus. Times are epoch milliseconds.
 */
export interface PlusRecord {
  active: boolean;
  source: PlusSource;
  productId: string;
  /** End of the paid or trial period; null only for a record with no period. */
  expiresAt: number | null;
  willRenew: boolean;
  updatedAt: number;
}

/** Active means the source says so and the period has not ended. */
export function isRecordActive(record: PlusRecord | null | undefined, now: number): boolean {
  if (!record || !record.active) return false;
  return record.expiresAt === null || record.expiresAt > now;
}

/**
 * The record to store at users/{uid}.plus from every source's record: Plus if
 * either source is active. With several active, the one that lasts longest
 * wins; with none, the most recently updated (so the account page can say what
 * lapsed). Null when there is no record at all.
 */
export function resolvePlus(
  sources: Partial<Record<PlusSource, PlusRecord>>,
  now: number,
): PlusRecord | null {
  const records = Object.values(sources).filter((r): r is PlusRecord => Boolean(r));
  if (records.length === 0) return null;
  const active = records.filter((r) => isRecordActive(r, now));
  if (active.length > 0) {
    const end = (r: PlusRecord) => (r.expiresAt === null ? Number.POSITIVE_INFINITY : r.expiresAt);
    const best = active.reduce((a, b) => (end(b) > end(a) ? b : a));
    return { ...best, active: true };
  }
  const latest = records.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
  return { ...latest, active: false };
}

export function hasPlus(plus: PlusRecord | null | undefined, now: number): boolean {
  return isRecordActive(plus, now);
}

/**
 * What progress the cloud keeps: everything for Plus, one summary document for
 * a free account, nothing for someone who is not signed in.
 */
export type DataTier = "full" | "summary" | "none";

export function dataTier(signedIn: boolean, plus: boolean): DataTier {
  if (!signedIn) return "none";
  return plus ? "full" : "summary";
}

/** Detailed cloud data is kept this long after Plus lapses, then deleted. */
export const LAPSED_RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export interface LocalEngineStatus {
  /** A Cadence server is paired on this device (or this is the desktop app itself). */
  paired: boolean;
  /** The last health check reached it. */
  reachable: boolean;
  /** What its engines report as ready. */
  capabilities: readonly AiCapability[];
}

export interface CloudStatus {
  /** This build has a cloud API configured at all. */
  configured: boolean;
  /** The global daily circuit breaker has tripped. */
  paused: boolean;
  /** Units left today for this capability, or null when not known yet. */
  quotaLeft: number | null;
}

export interface RoutingInput {
  capability: AiCapability;
  local: LocalEngineStatus | null;
  signedIn: boolean;
  plus: boolean;
  cloud: CloudStatus;
}

export type BlockReason = "needs_sign_in" | "needs_plus" | "daily_limit" | "cloud_paused" | "cloud_unavailable";

/** What the app may offer instead. The copy is the app's; these are the choices. */
export type Offer = "connect_own_server" | "reconnect_own_server" | "sign_in" | "plus" | "retry_later";

export type LocalNote = "local_unreachable" | "local_missing_capability";

export type RouteDecision =
  | { route: "local" }
  | { route: "cloud"; note?: LocalNote }
  | { route: "blocked"; reason: BlockReason; offers: Offer[]; note?: LocalNote };

export function routeRequest(input: RoutingInput): RouteDecision {
  const { capability, local, signedIn, plus, cloud } = input;

  if (local?.paired && local.reachable && local.capabilities.includes(capability)) {
    return { route: "local" };
  }

  const note: LocalNote | undefined = local?.paired
    ? local.reachable
      ? "local_missing_capability"
      : "local_unreachable"
    : undefined;
  const ownServer: Offer = local?.paired ? "reconnect_own_server" : "connect_own_server";
  const blocked = (reason: BlockReason, offers: Offer[]): RouteDecision =>
    note ? { route: "blocked", reason, offers, note } : { route: "blocked", reason, offers };

  if (!cloud.configured) return blocked("cloud_unavailable", [ownServer]);
  if (!signedIn) return blocked("needs_sign_in", [ownServer, "sign_in"]);
  if (!plus) return blocked("needs_plus", [ownServer, "plus"]);
  if (cloud.paused) return blocked("cloud_paused", [ownServer, "retry_later"]);
  if (cloud.quotaLeft !== null && cloud.quotaLeft <= 0) return blocked("daily_limit", [ownServer]);

  return note ? { route: "cloud", note } : { route: "cloud" };
}

// ---------------------------------------------------------------------------
// Cloud cost guards
// ---------------------------------------------------------------------------

/** One day's cloud usage, stored at usage/{uid}/days/{YYYY-MM-DD}. */
export interface DailyUsage {
  /** Seconds of learner audio scored, transcribed or analysed. */
  audioSeconds: number;
  ttsCharacters: number;
  /** Coach turns, spoken-grammar checks and placement analyses. */
  coachTurns: number;
}

export const EMPTY_USAGE: DailyUsage = { audioSeconds: 0, ttsCharacters: 0, coachTurns: 0 };

/** Per-user daily ceilings for Plus. Free accounts get no cloud AI at all. */
export const PLUS_DAILY_LIMITS: DailyUsage = {
  audioSeconds: 30 * 60,
  ttsCharacters: 20_000,
  coachTurns: 120,
};

export interface UsageRequest {
  audioSeconds?: number;
  characters?: number;
}

/** What one request costs against the daily ceilings. */
export function usageCost(capability: AiCapability, request: UsageRequest = {}): DailyUsage {
  const seconds = Math.max(0, Math.ceil(request.audioSeconds ?? 0));
  switch (capability) {
    case "score":
    case "transcribe":
      return { audioSeconds: seconds, ttsCharacters: 0, coachTurns: 0 };
    case "coach":
    case "grammar_feedback":
    case "placement":
      return { audioSeconds: seconds, ttsCharacters: 0, coachTurns: 1 };
    case "tts":
      return { audioSeconds: 0, ttsCharacters: Math.max(0, Math.ceil(request.characters ?? 0)), coachTurns: 0 };
  }
}

export interface QuotaCheck {
  allowed: boolean;
  /** The ceilings this request would cross. */
  exceeded: (keyof DailyUsage)[];
  after: DailyUsage;
}

export function checkQuota(used: DailyUsage, cost: DailyUsage, limits: DailyUsage = PLUS_DAILY_LIMITS): QuotaCheck {
  const after: DailyUsage = {
    audioSeconds: used.audioSeconds + cost.audioSeconds,
    ttsCharacters: used.ttsCharacters + cost.ttsCharacters,
    coachTurns: used.coachTurns + cost.coachTurns,
  };
  const exceeded = (Object.keys(after) as (keyof DailyUsage)[]).filter(
    (key) => cost[key] > 0 && after[key] > limits[key],
  );
  return { allowed: exceeded.length === 0, exceeded, after };
}

/** Units left today for one capability, for the router's `quotaLeft`. */
export function quotaLeft(capability: AiCapability, used: DailyUsage, limits: DailyUsage = PLUS_DAILY_LIMITS): number {
  const unit: keyof DailyUsage =
    capability === "tts" ? "ttsCharacters" : capability === "score" || capability === "transcribe" ? "audioSeconds" : "coachTurns";
  return Math.max(0, limits[unit] - used[unit]);
}

// ---------------------------------------------------------------------------
// Audio uploads
// ---------------------------------------------------------------------------

export const AUDIO_MAX_SECONDS = 30;
export const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

export type AudioContainer = "wav" | "mp4" | "webm" | "ogg" | "mp3";

/**
 * The container a recording really is, from its first bytes, regardless of the
 * declared MIME type. Null for anything else, which the server refuses.
 */
export function sniffAudio(bytes: Uint8Array): AudioContainer | null {
  const ascii = (start: number, text: string) =>
    bytes.length >= start + text.length && [...text].every((c, i) => bytes[start + i] === c.charCodeAt(0));
  if (ascii(0, "RIFF") && ascii(8, "WAVE")) return "wav";
  if (ascii(4, "ftyp")) return "mp4";
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
  if (ascii(0, "OggS")) return "ogg";
  if (ascii(0, "ID3") || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return "mp3";
  return null;
}
