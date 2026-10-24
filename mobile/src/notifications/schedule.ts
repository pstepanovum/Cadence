// Hands the reminder plan (src/notifications/plan.ts) to iOS and asks for
// permission when the learner turns reminders on, never at launch. Remote
// push uses Expo push tokens, registered per device with the account
// (PUT /api/devices) so future campaigns can reach free and Plus accounts
// alike. Nothing here throws: a reminder is a nicety.
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { isPlanned, type PlannedNotification } from "@/notifications/plan";

const supported = Platform.OS === "ios" || Platform.OS === "android";

if (supported) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export type PermissionState = "granted" | "undetermined" | "denied";

export async function notificationPermission(): Promise<PermissionState> {
  if (!supported) return "denied";
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return "granted";
    return current.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "denied";
  }
}

/** Shows iOS's prompt if it still can; true when notifications are allowed. */
export async function askForNotifications(): Promise<boolean> {
  if (!supported) return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    const requested = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return requested.granted;
  } catch {
    return false;
  }
}

let queue: Promise<void> = Promise.resolve();
let lastPlan: string | null = null;

/** Replaces Cadence's scheduled reminders with a new plan (one at a time, so two re-plans never interleave). */
export function replacePlan(plan: readonly PlannedNotification[]): Promise<void> {
  if (!supported) return Promise.resolve();
  const key = JSON.stringify(plan);
  const run = async () => {
    if (key === lastPlan) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled.filter((entry) => isPlanned(entry.identifier)).map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier).catch(() => undefined)),
    );
    for (const entry of plan) {
      await Notifications.scheduleNotificationAsync({
        identifier: entry.id,
        content: { title: entry.title, body: entry.body, data: { url: entry.url, kind: entry.kind } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: entry.fireAt },
      });
    }
    lastPlan = key;
  };
  const next = queue.then(run, run).catch(() => undefined);
  queue = next;
  return next;
}

/** Clears every Cadence reminder (sign-out, reminders switched off). */
export function clearPlan(): Promise<void> {
  lastPlan = null;
  return replacePlan([]);
}

/** The in-app path a tapped notification asks for, if it is one of ours. */
export function linkFromResponse(response: Notifications.NotificationResponse | null | undefined): string | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  const url = response.notification.request.content.data?.url;
  return typeof url === "string" && url.startsWith("/") ? url : null;
}

const projectId = (): string | null => {
  const fromEnv = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const extra = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  return fromEnv || extra || null;
};

/**
 * This device's Expo push token, or null when push cannot work here (no
 * permission, no EAS project id in this build, or offline).
 */
export async function expoPushToken(): Promise<string | null> {
  if (!supported) return null;
  const id = projectId();
  if (!id) return null;
  if ((await notificationPermission()) !== "granted") return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
  } catch {
    return null;
  }
}
