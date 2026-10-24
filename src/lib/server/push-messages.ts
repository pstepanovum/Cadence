// FILE: src/lib/server/push-messages.ts
//
// Remote push, the pure part: reading a device registration from the phone
// and turning a campaign into Expo push API messages. Push works for every
// signed-in account, free or Plus (the phone's local reminders do not need
// it at all). Tested in tests/server/push.test.ts.

export interface PushDevice {
  installId: string;
  expoPushToken: string;
  platform: "ios" | "android";
  timeZone: string;
}

export interface PushCampaign {
  title: string;
  body: string;
  /** In-app path the notification opens, e.g. "/badges". */
  url: string;
}

/** Expo accepts at most 100 messages per request. */
export const EXPO_BATCH = 100;
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const TOKEN = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;
const INSTALL_ID = /^[A-Za-z0-9-]{8,64}$/;

export function isExpoPushToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

/** The body of PUT /api/devices, or a reason it is refused. */
export function parsePushDevice(body: Record<string, unknown> | null): { ok: true; device: PushDevice } | { ok: false; message: string } {
  if (!body) return { ok: false, message: "Send a JSON object." };
  const { installId, expoPushToken, platform, timeZone } = body;
  if (typeof installId !== "string" || !INSTALL_ID.test(installId)) return { ok: false, message: "installId is missing or malformed." };
  if (!isExpoPushToken(expoPushToken)) return { ok: false, message: "expoPushToken is not an Expo push token." };
  if (platform !== "ios" && platform !== "android") return { ok: false, message: "platform must be ios or android." };
  const zone = typeof timeZone === "string" && timeZone.length <= 64 && /^[A-Za-z0-9_+\-/]+$/.test(timeZone) ? timeZone : "UTC";
  return { ok: true, device: { installId, expoPushToken, platform, timeZone: zone } };
}

export function isInstallId(value: unknown): value is string {
  return typeof value === "string" && INSTALL_ID.test(value);
}

/** A campaign as Expo push messages, one per token, in batches Expo accepts. */
export function buildExpoMessages(tokens: readonly string[], campaign: PushCampaign): { to: string; title: string; body: string; data: { url: string }; sound: null }[][] {
  const unique = [...new Set(tokens.filter(isExpoPushToken))];
  const url = campaign.url.startsWith("/") ? campaign.url : "/";
  const messages = unique.map((to) => ({ to, title: campaign.title.slice(0, 80), body: campaign.body.slice(0, 180), data: { url }, sound: null }));
  const batches = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH) batches.push(messages.slice(i, i + EXPO_BATCH));
  return batches;
}

export function parseCampaign(body: Record<string, unknown> | null): { ok: true; campaign: PushCampaign; uids: string[] } | { ok: false; message: string } {
  if (!body) return { ok: false, message: "Send a JSON object." };
  const { title, body: text, url, uids } = body;
  if (typeof title !== "string" || !title.trim()) return { ok: false, message: "title is required." };
  if (typeof text !== "string" || !text.trim()) return { ok: false, message: "body is required." };
  if (!Array.isArray(uids) || uids.length === 0 || uids.length > 500 || !uids.every((u) => typeof u === "string" && /^[A-Za-z0-9]{1,128}$/.test(u))) {
    return { ok: false, message: "uids must list 1 to 500 account ids." };
  }
  return { ok: true, uids, campaign: { title: title.trim(), body: text.trim(), url: typeof url === "string" ? url : "/" } };
}
