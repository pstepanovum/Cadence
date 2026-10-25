// FILE: src/components/account/me.ts
//
// The web's read of GET /api/me: Plus, data tier, email preferences. The
// server is the only judge of Plus; this only displays what it says.
"use client";

import { cloudFetch } from "@/hooks/cloud-fetch";
import type { DataTier, PlusRecord } from "@/lib/platform/engine-routing.ts";

export interface Me {
  uid: string | null;
  email: string | null;
  plus: PlusRecord | null;
  isPlus: boolean;
  tier: DataTier;
  trial: boolean;
  newsletter: boolean | null;
}

function toMillis(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseMe(body: unknown): Me {
  const b = (body ?? {}) as Record<string, unknown>;
  const user = (b.user ?? b) as Record<string, unknown>;
  const rawPlus = (b.plus ?? user.plus) as Record<string, unknown> | null | undefined;
  const plus: PlusRecord | null =
    rawPlus && (rawPlus.source === "stripe" || rawPlus.source === "app_store" || rawPlus.source === "code")
      ? {
          active: rawPlus.active === true,
          source: rawPlus.source,
          productId: typeof rawPlus.productId === "string" ? rawPlus.productId : "",
          expiresAt: toMillis(rawPlus.expiresAt),
          willRenew: rawPlus.willRenew === true,
          updatedAt: toMillis(rawPlus.updatedAt) ?? 0,
        }
      : null;
  const prefs = (b.emailPrefs ?? user.emailPrefs) as Record<string, unknown> | undefined;
  const isPlus = typeof b.isPlus === "boolean" ? b.isPlus : Boolean(plus?.active && (plus.expiresAt === null || plus.expiresAt > Date.now()));
  const tier = b.tier === "full" || b.tier === "summary" || b.tier === "none" ? b.tier : isPlus ? "full" : "summary";
  return {
    uid: typeof user.uid === "string" ? user.uid : typeof b.uid === "string" ? b.uid : null,
    email: typeof user.email === "string" ? user.email : null,
    plus,
    isPlus,
    tier,
    trial: rawPlus?.trial === true,
    newsletter: typeof prefs?.newsletter === "boolean" ? prefs.newsletter : null,
  };
}

export async function readMe(): Promise<Me | null> {
  try {
    const response = await cloudFetch("/api/me");
    if (!response.ok) return null;
    return parseMe(await response.json());
  } catch {
    return null;
  }
}

export const PLAN_NAMES: Record<string, string> = {
  "dev.pstepanov.cadence.plus.monthly": "Monthly",
  "dev.pstepanov.cadence.plus.yearly": "Yearly",
  cadence_plus_monthly: "Monthly",
  cadence_plus_yearly: "Yearly",
};
