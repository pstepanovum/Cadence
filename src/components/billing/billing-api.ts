// FILE: src/components/billing/billing-api.ts
//
// The web's side of Stripe billing: POST /api/billing/checkout starts Checkout
// for a plan (the server finds the price by lookup key and decides the trial),
// POST /api/billing/portal opens the Customer Portal. Both answer {url}.
"use client";

import { cloudFetch, readErrorCode } from "@/hooks/cloud-fetch";

export type PlanInterval = "monthly" | "yearly";

export type BillingOutcome =
  | { ok: true; url: string }
  | { ok: false; reason: "sign_in" | "already_plus" | "no_customer" | "unavailable"; message: string };

async function post(path: string, json?: unknown): Promise<BillingOutcome> {
  try {
    const response = await cloudFetch(path, { method: "POST", json: json ?? {} });
    if (response.ok) {
      const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
      if (typeof body?.url === "string" && body.url.startsWith("https://")) return { ok: true, url: body.url };
      return { ok: false, reason: "unavailable", message: "Billing is not available right now." };
    }
    const { code, message } = await readErrorCode(response);
    if (response.status === 401) return { ok: false, reason: "sign_in", message: "Sign in to continue." };
    if (code === "already_plus") return { ok: false, reason: "already_plus", message: "You already have Cadence Plus." };
    if (code === "no_customer") return { ok: false, reason: "no_customer", message: "There is no web subscription on this account." };
    return { ok: false, reason: "unavailable", message: message ?? "Billing is not available right now. Try again later." };
  } catch {
    return { ok: false, reason: "unavailable", message: "Could not reach Cadence. Check your connection." };
  }
}

export const startCheckout = (interval: PlanInterval) => post("/api/billing/checkout", { interval });
export const openPortal = () => post("/api/billing/portal");
