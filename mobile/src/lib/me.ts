// Reading GET /api/me (docs/PLATFORM.md, section 5.1): the account's Plus
// record, its data tier and today's cloud quota. Parsed defensively, so a
// field the server has not shipped yet reads as "not known" rather than
// crashing, and anything malformed counts as no Plus. Pure; tests/me.test.ts.
import {
  dataTier,
  EMPTY_USAGE,
  hasPlus,
  PLUS_DAILY_LIMITS,
  quotaLeft,
  type AiCapability,
  type DailyUsage,
  type DataTier,
  type PlusRecord,
} from "../platform/engine-routing.ts";

export interface Me {
  plus: PlusRecord | null;
  /** Whether that record was active when the answer arrived. */
  plusActive: boolean;
  tier: DataTier;
  /** Today's cloud usage, when the server reports it. */
  usage: DailyUsage | null;
  limits: DailyUsage;
  /** The global daily circuit breaker has tripped. */
  cloudPaused: boolean;
  /** Opted in to product news and offers. */
  newsletter: boolean;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

function parsePlus(value: unknown): PlusRecord | null {
  if (!isObject(value)) return null;
  const source = value.source === "stripe" || value.source === "app_store" ? value.source : "app_store";
  const expiresAt = typeof value.expiresAt === "number" ? value.expiresAt : typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) || null : null;
  return {
    active: value.active === true,
    source,
    productId: typeof value.productId === "string" ? value.productId : "",
    expiresAt,
    willRenew: value.willRenew === true,
    updatedAt: num(value.updatedAt, 0),
  };
}

function parseUsage(value: unknown): DailyUsage | null {
  if (!isObject(value)) return null;
  return {
    audioSeconds: num(value.audioSeconds, 0),
    ttsCharacters: num(value.ttsCharacters, 0),
    coachTurns: num(value.coachTurns, 0),
  };
}

export function parseMe(body: unknown, now: number): Me {
  const root = isObject(body) ? body : {};
  const plus = parsePlus(root.plus);
  const active = hasPlus(plus, now);
  const quota = isObject(root.quota) ? root.quota : {};
  const tier = root.tier === "full" || root.tier === "summary" ? root.tier : dataTier(true, active);
  const limits = parseUsage(quota.limits) ?? PLUS_DAILY_LIMITS;
  // The server may report what is used or what is left; both read as usage.
  let usage = parseUsage(quota.used ?? root.usage);
  const left = parseUsage(quota.left);
  if (!usage && left) {
    usage = {
      audioSeconds: Math.max(0, limits.audioSeconds - left.audioSeconds),
      ttsCharacters: Math.max(0, limits.ttsCharacters - left.ttsCharacters),
      coachTurns: Math.max(0, limits.coachTurns - left.coachTurns),
    };
  }
  return {
    plus,
    plusActive: active,
    tier,
    usage,
    limits,
    cloudPaused: root.cloudPaused === true || quota.paused === true,
    newsletter: root.newsletter === true || (isObject(root.profile) && root.profile.newsletter === true),
  };
}

/** Units left today for a capability, or null when the server has not said. */
export function quotaLeftFor(me: Me | null, capability: AiCapability): number | null {
  if (!me?.usage) return null;
  return quotaLeft(capability, me.usage ?? EMPTY_USAGE, me.limits);
}
