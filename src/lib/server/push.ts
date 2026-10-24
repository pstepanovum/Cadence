// FILE: src/lib/server/push.ts
//
// Remote push devices in Firestore: users/{uid}/devices/{installId}.push
// holds each phone's Expo push token (docs/PLATFORM.md, section 5). Written
// for every signed-in account, so push works without Plus; the phone
// registers again on open, so a device document cleared after a Plus lapse
// comes back by itself. `sendCampaign` is the stub future campaigns call.
import type { Firestore } from "firebase-admin/firestore";

import { db as defaultDb } from "./firebase";
import { buildExpoMessages, EXPO_PUSH_URL, type PushCampaign, type PushDevice } from "./push-messages";

function deviceRef(firestore: Firestore, uid: string, installId: string) {
  return firestore.collection("users").doc(uid).collection("devices").doc(installId);
}

export async function savePushDevice(uid: string, device: PushDevice, firestore: Firestore = defaultDb(), now = Date.now()): Promise<void> {
  await deviceRef(firestore, uid, device.installId).set(
    { platform: device.platform, push: { token: device.expoPushToken, timeZone: device.timeZone, updatedAt: now } },
    { merge: true },
  );
}

export async function removePushDevice(uid: string, installId: string, firestore: Firestore = defaultDb()): Promise<void> {
  const ref = deviceRef(firestore, uid, installId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return;
  const { FieldValue } = await import("firebase-admin/firestore");
  await ref.update({ push: FieldValue.delete() });
}

export async function pushTokensFor(uids: readonly string[], firestore: Firestore = defaultDb()): Promise<string[]> {
  const tokens: string[] = [];
  for (const uid of uids) {
    const devices = await firestore.collection("users").doc(uid).collection("devices").get();
    for (const doc of devices.docs) {
      const token = (doc.data().push as { token?: unknown } | undefined)?.token;
      if (typeof token === "string") tokens.push(token);
    }
  }
  return tokens;
}

/**
 * Sends one campaign to the given accounts through the Expo push service.
 * A stub for future campaigns: nothing calls it on a schedule yet.
 */
export async function sendCampaign(uids: readonly string[], campaign: PushCampaign, options: { db?: Firestore; fetch?: typeof fetch } = {}): Promise<{ devices: number; batches: number; failed: number }> {
  const send = options.fetch ?? fetch;
  const batches = buildExpoMessages(await pushTokensFor(uids, options.db ?? defaultDb()), campaign);
  let failed = 0;
  for (const batch of batches) {
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    const token = process.env.EXPO_ACCESS_TOKEN?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await send(EXPO_PUSH_URL, { method: "POST", headers, body: JSON.stringify(batch) }).catch(() => null);
    if (!response?.ok) failed += batch.length;
  }
  return { devices: batches.reduce((n, b) => n + b.length, 0), batches: batches.length, failed };
}
