import Constants from "expo-constants";
import { router } from "expo-router";
import { Award, Settings as SettingsIcon } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  Banner,
  Body,
  Button,
  MultiOptionRow,
  OptionRow,
  Screen,
  TextField,
  TopBar,
} from "@/components/ui";
import {
  PRACTICE_CADENCE_OPTIONS,
  useAuth,
  type LearningGoal,
  type PracticeCadence,
} from "@/context/auth";
import { LEARNING_GOALS, focusForGoals, sameGoals, toggleGoal } from "@/platform/goals";

import { SettingsRow } from "@/components/settings";
import { earnedCount } from "@/engagement/badges";
import { useBadges, useToday } from "@/engagement/useEngagement";
import { useAccount } from "@/context/account";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { haptics } from "@/lib/haptics";
import { useConnection } from "@/pairing/context";
import { colors, spacing, type, themed } from "@/theme/theme";

const GOAL_OPTIONS = LEARNING_GOALS.map((goal) => ({ value: goal.value, label: goal.title }));

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
          icon={<Award color={colors.carbon} size={20} />}
          title="Streak and badges"
          detail={`${today.streak.current}-day streak · ${earnedCount(badges)} badges`}
          onPress={() => router.push("/badges")}
        />
        <SettingsRow
          icon={<SettingsIcon color={colors.carbon} size={20} />}
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

/** Name, goals and pace. Cloud accounts only: local mode has no profile to save. */
function ProfileForm() {
  const { profile, updateProfile } = useAuth();

  const [base, setBase] = useState(profile);
  const [name, setName] = useState(profile.displayName);
  const [goals, setGoals] = useState<LearningGoal[]>(profile.learningGoals);
  const [cadence, setCadence] = useState<PracticeCadence>(profile.practiceCadence);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== profile.displayName ||
    !sameGoals(goals, profile.learningGoals) ||
    cadence !== profile.practiceCadence;

  // The profile can arrive after this screen opens (a cached copy first, the
  // server's a moment later). Follow it until the learner starts editing.
  if (base !== profile) {
    const untouched =
      name.trim() === base.displayName &&
      sameGoals(goals, base.learningGoals) &&
      cadence === base.practiceCadence;
    setBase(profile);
    if (untouched) {
      setName(profile.displayName);
      setGoals(profile.learningGoals);
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
        ...(goals.length ? { learningGoals: goals, practiceFocus: focusForGoals(goals) } : {}),
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
    <View style={styles.form}>
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
      <MultiOptionRow
        label="Goals"
        options={GOAL_OPTIONS}
        values={goals}
        onToggle={(value) => {
          setGoals((current) => toggleGoal(current, value));
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
      <Button label="Save changes" loading={saving} disabled={!dirty || goals.length === 0} onPress={handleSave} />
    </View>
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
    version: {
      textAlign: "center",
    },
  }),
);
