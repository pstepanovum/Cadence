// FILE: src/components/newsletter/newsletter-api.ts
//
// The web's side of POST /api/newsletter (Brevo double opt-in into list 5,
// "Cadence newsletter"). Brevo sends the confirmation email; the person is on
// the list only after clicking it, and every email carries Brevo's
// unsubscribe link.
"use client";

import { cloudFetch, readErrorCode } from "@/hooks/cloud-fetch";

export type NewsletterSource = "footer" | "page" | "signup" | "account";

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "invalid_email" | "rate_limited" | "unavailable"; retryAfterSeconds?: number };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function looksLikeEmail(value: string): boolean {
  return value.length <= 254 && EMAIL.test(value.trim());
}

export async function subscribeToNewsletter(email: string, source: NewsletterSource): Promise<SubscribeResult> {
  if (!looksLikeEmail(email)) return { ok: false, reason: "invalid_email" };
  try {
    const response = await cloudFetch("/api/newsletter", {
      method: "POST",
      appCheck: "limited",
      json: { email: email.trim(), source, consent: true, platform: navigator.userAgent.includes("CadenceDesktop") ? "desktop" : "web" },
    });
    if (response.ok) return { ok: true };
    const { code, retryAfterSeconds } = await readErrorCode(response);
    if (response.status === 429) return { ok: false, reason: "rate_limited", retryAfterSeconds: retryAfterSeconds ?? undefined };
    if (response.status === 400 && (code === "invalid_email" || code === null)) return { ok: false, reason: "invalid_email" };
    return { ok: false, reason: "unavailable" };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * DELETE /api/newsletter for the signed-in account. "link" means this server
 * has no such route; the unsubscribe link in every email still works.
 */
export async function unsubscribeFromNewsletter(): Promise<"done" | "link" | "failed"> {
  try {
    const response = await cloudFetch("/api/newsletter", { method: "DELETE" });
    if (response.ok) return "done";
    return response.status === 404 || response.status === 405 ? "link" : "failed";
  } catch {
    return "failed";
  }
}

export function describeSubscribeFailure(result: Extract<SubscribeResult, { ok: false }>): string {
  switch (result.reason) {
    case "invalid_email":
      return "Enter a valid email address.";
    case "rate_limited":
      return "Too many tries. Wait a few minutes and try again.";
    case "unavailable":
      return "Signing up is not available right now. Try again later.";
  }
}
