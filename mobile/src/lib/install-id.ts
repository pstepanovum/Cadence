// A random id for this install, so the one-time upload on upgrade to Plus is
// idempotent per device (POST /api/sync/import) and devices can be told apart.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

const KEY = "cadence.installId";
let cached: string | null = null;

export async function getInstallId(): Promise<string> {
  if (cached) return cached;
  const stored = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (stored) {
    cached = stored;
    return stored;
  }
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, id).catch(() => {});
  cached = id;
  return id;
}
