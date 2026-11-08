// Cloud account routes: the account itself, the newsletter choice, export and
// deletion, the app version, and progress sync (docs/PLATFORM.md, sections
// 5.1, 10 and 11). Sync and newsletter calls carry App Check.
import { api, apiFetch, apiJson } from "@/api/client";
import type { Activity, ProgressSummary } from "@/platform/progress-model";

const appCheck = { appCheck: true };

export function getMe(): Promise<unknown> {
  return api<unknown>("/api/me", {}, appCheck);
}

export function setNewsletter(subscribed: boolean): Promise<unknown> {
  // The newsletter route spends its App Check token (replay protection).
  return apiJson<unknown>("/api/newsletter", "POST", { subscribed }, { appCheck: "limited-use" });
}

/** The JSON export of everything the account holds, as text. */
export async function exportAccount(): Promise<string> {
  const response = await apiFetch("/api/account/export", {}, appCheck);
  if (!response.ok) throw new Error("Your data couldn't be exported. Try again in a moment.");
  return response.text();
}

export async function deleteAccount(): Promise<void> {
  const response = await apiFetch("/api/account", { method: "DELETE" }, appCheck);
  if (!response.ok && response.status !== 404) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Your account couldn't be deleted. Try again in a moment.");
  }
}

const SITE = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/$/, "") || "https://cadence.pstepanov.dev";

/**
 * Version info from the hosted site. Needs no account, so it works in every
 * mode; it names versions only. A failure reads as "nothing to say".
 */
export async function getVersionInfo(): Promise<unknown> {
  // The server allows five minutes of caching, and expo/fetch ignores
  // `cache: "no-store"`: the shared URL cache kept answering with an old copy
  // across launches. A fresh query string always reaches the server.
  const response = await fetch(`${SITE}/api/version?t=${Date.now()}`).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

// --- Sync ---

/** Sends queued activities, or with none queued reads the account's summary (the route refuses an empty batch). */
export function syncSummary(activities: Activity[]): Promise<{ summary?: ProgressSummary }> {
  if (activities.length === 0) return api("/api/sync/summary", {}, appCheck);
  return apiJson("/api/sync/summary", "POST", { activities }, appCheck);
}

export interface InboxCard {
  id?: string;
  front: string;
  back: string;
  example?: string;
}

export async function getInbox(): Promise<InboxCard[]> {
  const body = await api<{ cards?: InboxCard[] }>("/api/sync/inbox", {}, appCheck);
  return Array.isArray(body.cards) ? body.cards : [];
}

export function ackInbox(ids: string[]): Promise<unknown> {
  return api("/api/sync/inbox", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }, appCheck);
}

export function syncPush(payload: Record<string, unknown>): Promise<unknown> {
  return apiJson("/api/sync/push", "POST", payload, appCheck);
}

export function syncPull(since: string | null): Promise<Record<string, unknown>> {
  const query = since ? `?since=${encodeURIComponent(since)}` : "";
  return api<Record<string, unknown>>(`/api/sync/pull${query}`, {}, appCheck);
}

export function syncImport(payload: Record<string, unknown>): Promise<unknown> {
  return apiJson("/api/sync/import", "POST", payload, appCheck);
}

// --- Push devices ---

export interface PushDevice {
  installId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  timeZone: string;
}

/** Remembers this device's push token on the account (free and Plus alike). */
export function registerPushDevice(device: PushDevice): Promise<unknown> {
  return apiJson("/api/devices", "PUT", device, appCheck);
}

/** Forgets this device's push token, before signing out. */
export function unregisterPushDevice(installId: string): Promise<unknown> {
  return api(`/api/devices?installId=${encodeURIComponent(installId)}`, { method: "DELETE" }, appCheck);
}
