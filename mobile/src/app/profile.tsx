import Constants from "expo-constants";
import { router } from "expo-router";
import { Award, Settings as SettingsIcon } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Banner,
  Body,
  Button,
  Card,
  OptionRow,
  Screen,
  TextField,
  TopBar,
} from "@/components/ui";
import {
  PRACTICE_CADENCE_OPTIONS,
  PRACTICE_FOCUS_OPTIONS,
  useAuth,
  type PracticeCadence,
  type PracticeFocus,
} from "@/context/auth";
import { SettingsRow } from "@/components/settings";
import { earnedCount } from "@/engagement/badges";
import { useBadges, useToday } from "@/engagement/useEngagement";
import { useAccount } from "@/context/account";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { haptics } from "@/lib/haptics";
import { useConnection } from "@/pairing/context";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const { mode } = useConnection();
  const account = useAccount();
  const server = useServerStatus();
  const today = useToday();
  const badges = useBadges();
  const local = mode === "local";

  return (
    <Screen>
      <TopBar
        onBack={() => router.back()}
        eyebrow="Profile"
        title={local ? "This phone" : profile.displayName}
      />
      {!local && user?.email ? (
        <Body size={type.callout} tone="muted">
          {user.email}
        </Body>
      ) : null}

      {!local && !server.reachable && !server.checking ? (
        <Banner
          tone="error"
          message={server.message ?? "Cadence can't reach the server."}
          actionLabel={server.actionLabel ?? undefined}
          onAction={server.actionLabel ? server.action : undefined}
        />
      ) : null}

      {local ? null : <ProfileForm />}

      <View style={styles.group}>
        <SettingsRow
          icon={<Award color={colors.hunter} size={20} />}
          title="Streak and badges"
          detail={`${today.streak.current}-day streak · ${earnedCount(badges)} badges`}
          onPress={() => router.push("/badges")}
        />
        <SettingsRow
          icon={<SettingsIcon color={colors.hunter} size={20} />}
          title="Settings"
          detail="Reminders, sounds, your server, your account."
          onPress={() => router.push("/settings")}
        />
      </View>

      {local ? (
        <Body size={type.footnote} tone="muted">
          No account needed with your own server. Pronunciation progress is kept on your computer; lessons and flashcards on this phone.
        </Body>
      ) : (
        <Body size={type.footnote} tone="muted">
          {account.tier === "full" ? "Everything you practise is synced to your account." : "Your account keeps your progress summary. The detail stays on this phone."}
        </Body>
      )}

      <Body size={type.caption} tone="muted" style={styles.version}>
        Cadence {Constants.expoConfig?.version ?? "dev"}
      </Body>
    </Screen>
  );
}

/** Name, focus and pace. Cloud accounts only: local mode has no profile to save. */
function ProfileForm() {
  const { profile, updateProfile } = useAuth();

  const [base, setBase] = useState(profile);
  const [name, setName] = useState(profile.displayName);
  const [focus, setFocus] = useState<PracticeFocus>(profile.practiceFocus);
  const [cadence, setCadence] = useState<PracticeCadence>(profile.practiceCadence);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== profile.displayName ||
    focus !== profile.practiceFocus ||
    cadence !== profile.practiceCadence;

  // The profile can arrive after this screen opens (a cached copy first, the
  // server's a moment later). Follow it until the learner starts editing.
  if (base !== profile) {
    const untouched =
      name.trim() === base.displayName &&
      focus === base.practiceFocus &&
      cadence === base.practiceCadence;
    setBase(profile);
    if (untouched) {
      setName(profile.displayName);
      setFocus(profile.practiceFocus);
      setCadence(profile.practiceCadence);
    }
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile({
        displayName: name.trim() || profile.displayName,
        practiceFocus: focus,
        practiceCadence: cadence,
      });
      haptics.success();
      setSaved(true);
    } catch (cause) {
      haptics.error();
      setError(describeError(cause, "Could not save your changes."));
    } finally {
      setSaving(false);
    }
  }

  function edited() {
    setSaved(false);
    setError(null);
  }

  return (
    <Card style={styles.form}>
      <TextField
        label="Display name"
        placeholder="Your name"
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        value={name}
        onChangeText={(value) => {
          setName(value);
          edited();
        }}
      />
      <OptionRow
        label="Focus area"
        options={PRACTICE_FOCUS_OPTIONS}
        value={focus}
        onChange={(value) => {
          setFocus(value);
          edited();
        }}
      />
      <OptionRow
        label="Daily pace"
        options={PRACTICE_CADENCE_OPTIONS}
        value={cadence}
        onChange={(value) => {
          setCadence(value);
          edited();
        }}
      />
      {error ? <Banner message={error} tone="error" /> : null}
      {saved && !dirty ? <Banner tone="success" message="Saved." /> : null}
      <Button label="Save changes" loading={saving} disabled={!dirty} onPress={handleSave} />
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    form: {
      gap: spacing.xl,
    },
    group: {
      gap: spacing.sm,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      minHeight: 72,
      boxShadow: shadows.card,
    },
    rowIcon: {
      width: 44,
      height: 44,
      borderRadius: radii.panel,
      backgroundColor: colors.cream,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: {
      flex: 1,
      gap: spacing.xxs,
    },
    version: {
      textAlign: "center",
    },
  }),
);
