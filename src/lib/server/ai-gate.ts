// FILE: src/lib/server/ai-gate.ts
//
// Who may run an AI request on this server. The apps decide where to send a
// request with routeRequest (engine-routing.ts); the server enforces the same
// rules again and never trusts the client's decision.
//
//   own Cadence (desktop, docker, dev)   never gated: the engines are the learner's own
//   hosted cloud                         App Check, a signed-in account, Plus, the
//                                        global breaker, then the daily quota
//
// Refusals carry the routing reason and the offers the app shows ("Connect your
// own Cadence", Plus, sign in), so a refusal never reads as a crash.
import type { Firestore } from "firebase-admin/firestore";

import { routeRequest, type AiCapability, type BlockReason, type DailyUsage, type Offer, type UsageRequest } from "../platform/engine-routing";
import { requireAppCheck } from "./app-check";
import { getAccount } from "./entitlement";
import { isHostedCloud } from "./env";
import { errorResponse } from "./http";
import { identify } from "./identity";
import { chargeUsage, isBreakerTripped, recordSpend, refundUsage } from "./quota";

export const DAILY_LIMIT_MESSAGE = "Daily limit reached. Connect your own Cadence for unlimited practice.";

const MESSAGES: Record<BlockReason, string> = {
  needs_sign_in: "Sign in to use Cadence's cloud AI, or connect your own Cadence server.",
  needs_plus: "Cloud AI practice is part of Cadence Plus. You can also connect your own Cadence server for free.",
  daily_limit: DAILY_LIMIT_MESSAGE,
  cloud_paused: "Cloud AI is paused for today. Connect your own Cadence, or try again tomorrow.",
  cloud_unavailable: "Cloud AI isn't available here. Connect your own Cadence server.",
};

const STATUS: Record<BlockReason, number> = { needs_sign_in: 401, needs_plus: 402, daily_limit: 429, cloud_paused: 503, cloud_unavailable: 503 };

export function blockedResponse(reason: BlockReason, offers: Offer[]): Response {
  return errorResponse(STATUS[reason], reason, MESSAGES[reason], { offers });
}

export type AiAccess =
  | { ok: true; mode: "own" }
  | { ok: true; mode: "cloud"; uid: string; email: string | null }
  | { ok: false; response: Response };

/** Step one, before reading any upload: who is asking and may they use cloud AI at all. */
export async function authorizeAi(request: Request, capability: AiCapability, options: { db?: Firestore } = {}): Promise<AiAccess> {
  if (!isHostedCloud()) return { ok: true, mode: "own" };

  const appCheck = await requireAppCheck(request);
  if (!appCheck.ok) return appCheck;

  const who = await identify(request);
  const signedIn = who.kind === "cloud";
  const plus = signedIn ? (await getAccount(who.identity.uid, options.db)).isPlus : false;
  const paused = signedIn && plus ? await isBreakerTripped({ db: options.db }) : false;
  const decision = routeRequest({ capability, local: null, signedIn, plus, cloud: { configured: true, paused, quotaLeft: null } });

  if (decision.route === "blocked") return { ok: false, response: blockedResponse(decision.reason, decision.offers) };
  if (who.kind !== "cloud") return { ok: false, response: blockedResponse("needs_sign_in", ["connect_own_server", "sign_in"]) };
  return { ok: true, mode: "cloud", uid: who.identity.uid, email: who.identity.email };
}

export interface Charge {
  /** Gives the charge back when the provider failed. */
  refund(): Promise<void>;
  /** Adds the spend to the day's budget after a success. */
  settle(): Promise<void>;
}

const FREE: Charge = { refund: async () => undefined, settle: async () => undefined };

/** Step two, once the cost is known (seconds of audio, characters of text). */
export async function chargeAi(
  access: Extract<AiAccess, { ok: true }>,
  capability: AiCapability,
  usage: UsageRequest,
  options: { db?: Firestore } = {},
): Promise<{ ok: true; charge: Charge } | { ok: false; response: Response }> {
  if (access.mode === "own") return { ok: true, charge: FREE };
  const result = await chargeUsage(access.uid, capability, usage, { db: options.db });
  if (!result.allowed) return { ok: false, response: blockedResponse("daily_limit", ["connect_own_server"]) };
  const cost: DailyUsage = result.cost;
  return {
    ok: true,
    charge: {
      refund: () => refundUsage(access.uid, cost, { db: options.db }),
      settle: () => recordSpend(capability, cost, { db: options.db }),
    },
  };
}
