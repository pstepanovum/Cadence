// Settings: reminders, practice (daily goal, sounds, haptics, voice, packs),
// the connected server, the account (news, plan, restore, sign out, delete),
// running setup again, and the app version.
import Constants from "expo-constants";
import { router } from "expo-router";
import { Download, GraduationCap, KeyRound, Laptop, RotateCcw, Sparkles, Volume2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Alert, AppState, Linking, StyleSheet, View } from "react-native";

import { unregisterPushDevice } from "@/api/account";
import { forgetPushRegistration } from "@/components/EngagementWatcher";
import { NewsletterToggle } from "@/components/NewsletterToggle";
import { SettingsRow, SwitchRow } from "@/components/settings";
import { TimePicker } from "@/components/TimePicker";
import { Banner, Body, Button, Chip, Eyebrow, HorizontalPicker, Screen, TopBar } from "@/components/ui";
import { useAccount } from "@/context/account";
import { useAuth } from "@/context/auth";
import { DAILY_GOAL_OPTIONS } from "@/engagement/today";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { useServerStatus } from "@/hooks/useServerStatus";
import { restorePurchases, storeConfigured } from "@/lib/billing/purchases";
import { getInstallId } from "@/lib/install-id";
import { setPref, usePrefs } from "@/lib/prefs";
import { formatTime, inQuietHours } from "@/notifications/plan";
import { askForNotifications, notificationPermission, type PermissionState } from "@/notifications/schedule";
import { updateReminders, useReminderSettings } from "@/notifications/settings";
import { haptics } from "@/lib/haptics";
import { levelSummary, useLevelPrefs } from "@/learning/level-store";
import { useConnection } from "@/pairing/context";
import { linkedMethods, methodLabel } from "@/platform/sign-in-methods";
import { colors, spacing, type } from "@/theme/theme";

export default function SettingsScreen() {
  const reminders = useReminderSettings();
  const prefs = usePrefs();
  const account = useAccount();
  const { user, signOut } = useAuth();
  const { mode, state: connectionState, paired, forgetServer } = useConnection();
  const server = useServerStatus();
  const voice = useCoachVoice();
  const levels = useLevelPrefs();
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const local = mode === "local";
  const cloud = mode === "cloud" && account.cloudAvailable;

  useEffect(() => {
    const check = () => void notificationPermission().then(setPermission);
    check();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => subscription.remove();
  }, []);

  /** Turning any reminder on asks iOS first, the moment it is wanted. */
  async function setReminder(patch: Parameters<typeof updateReminders>[0], turningOn: boolean) {
    if (turningOn && permission !== "granted") {
      const allowed = await askForNotifications();
      setPermission(allowed ? "granted" : await notificationPermission());
      if (!allowed) return;
    }
    updateReminders(patch);
  }

  const connectionLine = local
    ? connectionState.status === "connected"
      ? `Connected to ${connectionState.serverName} over Wi-Fi.`
      : server.checking
        ? "Looking for your computer…"
        : (server.message ?? "Not connected.")
    : paired
      ? connectionState.status === "connected"
        ? `Connected to ${connectionState.serverName}. Scoring and the coach run there when you're home.`
        : "Paired. Scoring and the coach run there whenever it's reachable."
      : "Run scoring and the coach on your own computer over your home Wi-Fi. Open source and free.";

  async function restore() {
    setRestoring(true);
    setMessage(null);
    try {
      const status = await restorePurchases();
      account.noteStoreStatus(status);
      if (status.active) haptics.success();
      setMessage(status.active ? { tone: "success", text: "Plus restored." } : { tone: "info", text: "No Plus subscription found for this Apple Account." });
    } catch (error) {
      haptics.error();
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Restore didn't work. Try again." });
    } finally {
      setRestoring(false);
    }
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", "Your progress stays in your account. Practice on this phone comes back when you sign in again.", [
      { text: "Stay signed in", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: () =>
          void (async () => {
            try {
              // This phone stops getting the account's push messages.
              const installId = await getInstallId();
              await Promise.race([unregisterPushDevice(installId).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]);
              await forgetPushRegistration();
            } catch {
              // Best effort: signing out must never depend on the push cleanup.
            } finally {
              await signOut();
            }
          })(),
      },
    ]);
  }

  const quiet = reminders.quiet;
  const dailyInQuiet = reminders.daily && inQuietHours(reminders.time, quiet);

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Settings" title="Settings" />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <View style={styles.group}>
        <Eyebrow>Reminders</Eyebrow>
        {permission === "denied" ? (
          <Banner tone="warning" message="Notifications are off for Cadence in iOS Settings." actionLabel="Open Settings" onAction={() => void Linking.openSettings()} />
        ) : null}
        <SwitchRow title="Daily reminder" detail="Skipped once you've met today's goal." value={reminders.daily} onChange={(on) => void setReminder({ daily: on }, on)}>
          <TimePicker value={reminders.time} onChange={(time) => updateReminders({ time })} />
          {dailyInQuiet ? <Body size={type.footnote} tone="muted">{"This time is inside your quiet hours, so the reminder won't arrive."}</Body> : null}
        </SwitchRow>
        <SwitchRow title="Streak check" detail="An evening note if your streak has no practice yet." value={reminders.streak} onChange={(on) => void setReminder({ streak: on }, on)} />
        <SwitchRow title="Flashcards due" detail="When cards are ready for review." value={reminders.flashcards} onChange={(on) => void setReminder({ flashcards: on }, on)} />
        <SwitchRow title="Weekly summary" detail="Sunday morning: your minutes, streak and badges." value={reminders.weekly} onChange={(on) => void setReminder({ weekly: on }, on)} />
        <SwitchRow
          title="Quiet hours"
          detail={quiet.enabled ? `Nothing between ${formatTime(quiet.start)} and ${formatTime(quiet.end)}.` : "Reminders can arrive at any time."}
          value={quiet.enabled}
          onChange={(enabled) => updateReminders({ quiet: { ...quiet, enabled } })}>
          <Body size={type.footnote} weight="semibold">
            From
          </Body>
          <TimePicker label="Quiet hours start" value={quiet.start} onChange={(start) => updateReminders({ quiet: { ...quiet, start } })} />
          <Body size={type.footnote} weight="semibold">
            Until
          </Body>
          <TimePicker label="Quiet hours end" value={quiet.end} onChange={(end) => updateReminders({ quiet: { ...quiet, end } })} />
        </SwitchRow>
      </View>

      <View style={styles.group}>
        <Eyebrow>Practice</Eyebrow>
        <View style={styles.goal}>
          <Body size={type.callout} weight="semibold">
            Daily goal
          </Body>
          <HorizontalPicker selectedIndex={Math.max(0, DAILY_GOAL_OPTIONS.indexOf(prefs.dailyGoal))}>
            {DAILY_GOAL_OPTIONS.map((minutes) => (
              <Chip key={minutes} label={`${minutes} min`} selected={prefs.dailyGoal === minutes} onPress={() => setPref("dailyGoal", minutes)} />
            ))}
          </HorizontalPicker>
        </View>
        <SwitchRow title="Sounds" detail="Short cues for answers and finished lessons." value={prefs.sounds} onChange={(on) => setPref("sounds", on)} />
        <SwitchRow title="Haptics" detail="Gentle taps when you press and pick." value={prefs.haptics} onChange={(on) => setPref("haptics", on)} />
        <SettingsRow icon={<GraduationCap color={colors.carbon} size={20} />} title="Level" detail={levelSummary(levels)} onPress={() => router.push("/settings/level")} />
        <SettingsRow icon={<Volume2 color={colors.carbon} size={20} />} title="Coach voice" detail={voice.instruct} onPress={() => router.push("/settings/voice")} />
        <SettingsRow icon={<Download color={colors.carbon} size={20} />} title="Offline content packs" detail="Lessons and sounds on this phone, and more to download." onPress={() => router.push("/settings/packs")} />
      </View>

      <View style={styles.group}>
        <Eyebrow>Connected server</Eyebrow>
        <SettingsRow
          icon={<Laptop color={local && !server.reachable && !server.checking ? colors.brick : colors.hunter} size={20} />}
          title={local ? "Your computer" : paired ? "Your own Cadence" : "Connect your own Cadence"}
          detail={connectionLine}
          onPress={() => {
            if (local) router.push("/connect");
            else if (!paired) router.push({ pathname: "/connect/scan", params: { home: "1" } });
            else
              Alert.alert("Your own Cadence", "Unpair it from this phone? Your account stays signed in.", [
                { text: "Keep", style: "cancel" },
                { text: "Unpair", style: "destructive", onPress: () => void forgetServer() },
              ]);
          }}
        />
      </View>

      {cloud && user ? (
        <View style={styles.group}>
          <Eyebrow>Account</Eyebrow>
          <Body size={type.footnote} tone="muted">
            {user.email ?? ""}
          </Body>
          <NewsletterToggle />
          <SettingsRow
            icon={<KeyRound color={colors.carbon} size={20} />}
            title="Sign-in methods"
            detail={linkedMethods(user.providers).map(methodLabel).join(", ") || "Apple, Google, or email and password."}
            onPress={() => router.push("/settings/sign-in")}
          />
          <SettingsRow
            icon={<Sparkles color={colors.carbon} size={20} />}
            title={account.plus ? "Plan: Cadence Plus" : "Plan: Free"}
            detail="Your plan, your data download, and deleting your account."
            onPress={() => router.push("/account")}
          />
          <Button label="Restore purchases" variant="tonal" loading={restoring} disabled={!storeConfigured || restoring} onPress={() => void restore()} />
          <Button label="Sign out" variant="neutral" onPress={confirmSignOut} />
          <Button label="Delete account" variant="danger" onPress={() => router.push("/account")} />
        </View>
      ) : null}

      <View style={styles.group}>
        <Eyebrow>Setup</Eyebrow>
        <SettingsRow icon={<RotateCcw color={colors.carbon} size={20} />} title="Run setup again" detail="Your goal, level, daily minutes and reminder time." onPress={() => router.push("/settings/onboarding")} />
      </View>

      <Body size={type.caption} tone="muted" style={styles.version}>
        {`Cadence ${Constants.expoConfig?.version ?? "dev"}${Constants.expoConfig?.ios?.buildNumber ? ` (${Constants.expoConfig.ios.buildNumber})` : ""}`}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  goal: { gap: spacing.sm },
  version: { textAlign: "center" },
});
