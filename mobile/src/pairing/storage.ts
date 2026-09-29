// FILE: mobile/src/pairing/storage.ts
//
// The device token is the phone's credential for someone's computer, so it goes
// in the keychain (expo-secure-store), not AsyncStorage. The connection details
// around it are not secret — an address and a random server id — but they live
// beside the token so that clearing one clears the other and the phone can
// never end up holding a token for a server it no longer remembers.
import * as SecureStore from "expo-secure-store";

import type { StoredConnection } from "@/pairing/discovery";

const TOKEN_KEY = "cadence.pairing.deviceToken";
const CONNECTION_KEY = "cadence.pairing.connection";

/**
 * The keychain item is readable only when the device has been unlocked at least
 * once since boot, and never leaves this device: no iCloud keychain sync, so a
 * restored backup on a different phone does not silently inherit access to
 * someone's computer.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface StoredPairing {
  deviceToken: string;
  connection: StoredConnection;
}

export async function readPairing(): Promise<StoredPairing | null> {
  try {
    const [deviceToken, rawConnection] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY, OPTIONS),
      SecureStore.getItemAsync(CONNECTION_KEY, OPTIONS),
    ]);

    if (!deviceToken || !rawConnection) {
      return null;
    }

    const connection = JSON.parse(rawConnection) as StoredConnection;

    if (typeof connection?.serverId !== "string" || typeof connection?.host !== "string") {
      return null;
    }

    return { deviceToken, connection };
  } catch {
    // A corrupt or unreadable keychain entry is the same as not being paired.
    return null;
  }
}

export async function writePairing(pairing: StoredPairing): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(TOKEN_KEY, pairing.deviceToken, OPTIONS),
    SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(pairing.connection), OPTIONS),
  ]);
}

/** Update the remembered address without touching the token. */
export async function updateStoredConnection(connection: StoredConnection): Promise<void> {
  await SecureStore.setItemAsync(CONNECTION_KEY, JSON.stringify(connection), OPTIONS);
}

export async function clearPairing(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(TOKEN_KEY, OPTIONS),
    SecureStore.deleteItemAsync(CONNECTION_KEY, OPTIONS),
  ]);
}
