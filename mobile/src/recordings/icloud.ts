// The optional copy of the learner's recordings in their own iCloud Drive
// (docs/PLATFORM.md section 19). Off by default; turned on from the
// Recordings screen. Needs a build with the iCloud Documents entitlement
// (CADENCE_ICLOUD=1, plugins/with-icloud-recordings.js) and an iCloud
// account on the device; otherwise `available` says why not and nothing is
// copied. This is the learner's own iCloud, never the Cadence cloud.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface ICloudModule {
  isSignedIn(): boolean;
  containerPath(): Promise<string | null>;
  copyIn(source: string, name: string): Promise<boolean>;
  remove(name: string): Promise<boolean>;
  list(): Promise<string[]>;
}

const native = Platform.OS === "ios" ? requireOptionalNativeModule<ICloudModule>("CadenceICloud") : null;
const SETTING_KEY = "cadence.recordings.icloud.v1";

export type ICloudStatus = { available: true } | { available: false; reason: "not_ios" | "not_in_build" | "signed_out" };

let container: Promise<string | null> | null = null;

export async function icloudStatus(): Promise<ICloudStatus> {
  if (Platform.OS !== "ios") return { available: false, reason: "not_ios" };
  if (!native) return { available: false, reason: "not_in_build" };
  if (!native.isSignedIn()) return { available: false, reason: "signed_out" };
  container ??= native.containerPath().catch(() => null);
  const path = await container;
  if (!path) {
    container = null;
    return { available: false, reason: "not_in_build" };
  }
  return { available: true };
}

export const ICLOUD_REASON_COPY: Record<Exclude<ICloudStatus, { available: true }>["reason"], string> = {
  not_ios: "iCloud copies are only on iPhone.",
  not_in_build: "This version of Cadence can't reach iCloud Drive yet, so recordings stay on this phone.",
  signed_out: "Sign in to iCloud in the Settings app to keep a copy there.",
};

export async function icloudEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(SETTING_KEY).catch(() => null)) === "1";
}

export async function setICloudEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(SETTING_KEY, enabled ? "1" : "0").catch(() => {});
}

/** Copies one take to iCloud Drive; false when it could not (it then stays pending). */
export async function copyToICloud(uri: string, name: string): Promise<boolean> {
  if (!native || !(await icloudEnabled()) || !(await icloudStatus()).available) return false;
  return native.copyIn(uri, name).catch(() => false);
}

export async function removeFromICloud(name: string): Promise<void> {
  if (!native || !(await icloudStatus()).available) return;
  await native.remove(name).catch(() => false);
}
