// Runs while the app is open: records newly earned badges and celebrates
// them, writes the widgets' snapshot, re-plans the local reminders, opens the
// screen a tapped notification points to, and registers this device's push
// token with the account. Draws nothing but the badge moment.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import { registerPushDevice } from "@/api/account";
import { BadgeCelebration } from "@/components/BadgeCelebration";
import { useAccount } from "@/context/account";
import { useAuth } from "@/context/auth";
import { newlyEarned, type Badge } from "@/engagement/badges";
import { dueByDay } from "@/engagement/today";
import { useBadges, useToday } from "@/engagement/useEngagement";
import { earnBadges } from "@/learning/state";
import { updateLearning, useLearning } from "@/learning/store";
import { getInstallId } from "@/lib/install-id";
import { buildWidgetSnapshot } from "@/lib/widget/snapshot";
import { syncWidget } from "@/lib/widget/sync";
import { planNotifications } from "@/notifications/plan";
import { expoPushToken, linkFromResponse, notificationPermission, replacePlan } from "@/notifications/schedule";
import { useReminderSettings } from "@/notifications/settings";

const PUSH_KEY = "cadence.push.registered";
const PUSH_REFRESH_MS = 7 * 86_400_000;

export function EngagementWatcher() {
  const learning = useLearning();
  const today = useToday();
  const badges = useBadges();
  const reminders = useReminderSettings();
  const account = useAccount();
  const { user } = useAuth();
  const [celebrating, setCelebrating] = useState<Badge[]>([]);
  const [foreground, setForeground] = useState(0);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") setForeground((n) => n + 1);
    });
    return () => subscription.remove();
  }, []);

  // Badges: record what is newly earned, then celebrate it.
  const fresh = learning.loaded && learning.learner ? newlyEarned(badges) : [];
  const freshKey = fresh.map((b) => b.id).join(",");
  useEffect(() => {
    if (!freshKey) return;
    updateLearning((state) => earnBadges(state, freshKey.split(","), Date.now()));
    // Shown a beat later, once the screen that earned it has settled. Not
    // cancelled when the ids clear: recording them is what clears them.
    setTimeout(() => setCelebrating(fresh), 400);
    // Keyed on the ids; the badge objects change every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshKey]);

  // Widgets: the snapshot only changes when something it shows does.
  const { minutesToday, goalMinutes, goalMet } = today;
  const { current: streakDays, freezes, practisedToday } = today.streak;
  useEffect(() => {
    if (!learning.loaded) return;
    syncWidget(
      buildWidgetSnapshot({
        today: today.today,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        streak: streakDays,
        freezes,
        practisedToday,
        goalMinutes,
        minutesToday,
        updatedAt: Date.now(),
      }),
    );
  }, [learning.loaded, today.today, streakDays, freezes, practisedToday, goalMinutes, minutesToday]);

  // Reminders: re-planned shortly after anything they depend on changes.
  const due = learning.loaded ? dueByDay(learning.state) : {};
  const dueKey = JSON.stringify(due);
  useEffect(() => {
    if (!learning.loaded) return;
    const timer = setTimeout(() => {
      void (async () => {
        const permitted = (await notificationPermission()) === "granted";
        await replacePlan(
          planNotifications({
            now: new Date(),
            settings: reminders,
            permitted,
            goalMetToday: goalMet,
            streak: streakDays,
            practisedToday,
            freezes,
            dueByDay: JSON.parse(dueKey) as Record<string, number>,
          }),
        );
      })();
    }, 800);
    return () => clearTimeout(timer);
  }, [learning.loaded, reminders, goalMet, streakDays, practisedToday, freezes, dueKey, foreground]);

  // A tapped notification opens its screen, once per notification.
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const link = linkFromResponse(response);
    const id = response?.notification.request.identifier ?? null;
    if (!link || !id || handled.current === id) return;
    handled.current = id;
    void Notifications.clearLastNotificationResponseAsync().catch(() => {});
    if (link === "/") router.navigate("/(tabs)");
    else router.push(link as Href);
  }, [response]);

  // Remote push: the token goes to the account, free or Plus.
  const uid = account.signedIn ? (user?.uid ?? null) : null;
  useEffect(() => {
    if (!uid || Platform.OS === "web") return;
    let active = true;
    void (async () => {
      const token = await expoPushToken();
      if (!token || !active) return;
      const installId = await getInstallId();
      const mark = `${uid}:${installId}:${token}`;
      const saved = await AsyncStorage.getItem(PUSH_KEY).catch(() => null);
      const [savedMark, savedAt] = saved ? (saved.split("|") as [string, string]) : ["", "0"];
      if (savedMark === mark && Date.now() - Number(savedAt) < PUSH_REFRESH_MS) return;
      await registerPushDevice({
        installId,
        expoPushToken: token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
        .then(() => AsyncStorage.setItem(PUSH_KEY, `${mark}|${Date.now()}`))
        .catch(() => {});
    })();
    return () => {
      active = false;
    };
  }, [uid, foreground]);

  return <BadgeCelebration badges={celebrating} onDone={() => setCelebrating([])} />;
}

/** Forgets the push registration marker, so the next account registers afresh. */
export function forgetPushRegistration(): Promise<void> {
  return AsyncStorage.removeItem(PUSH_KEY).catch(() => {});
}
