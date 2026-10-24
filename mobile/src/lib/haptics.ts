import * as Haptics from "expo-haptics";

import { prefs } from "@/lib/prefs";

// One place for every buzz in the app, so the vocabulary stays small: a tap
// for ordinary presses, a tick for picking something, and the two notification
// patterns for a result. Every call is fire-and-forget and swallows failures,
// because a phone with haptics switched off must never surface an error.

function quietly(buzz: () => Promise<void>) {
  // Settings > Haptics turns every buzz off.
  if (!prefs.get().haptics) return;
  buzz().catch(() => {});
}

export const haptics = {
  /** A plain button press. */
  tap: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Choosing an option, a chip, a tile. */
  select: () => quietly(() => Haptics.selectionAsync()),
  /** A firmer thud for the mic and for placing the last tile. */
  thud: () => quietly(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  warning: () => quietly(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
