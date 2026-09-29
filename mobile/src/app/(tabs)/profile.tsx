import { useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";
import { router } from "expo-router";
import { ChevronRight, Volume2, Wifi } from "lucide-react-native";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import { getStats } from "@/api/endpoints";
import {
  Banner,
  Body,
  Card,
  Eyebrow,
  OptionRow,
  PillButton,
  Screen,
  SectionHeader,
  StatTile,
  TextField,
  Title,
} from "@/components/ui";
import {
  PRACTICE_CADENCE_OPTIONS,
  PRACTICE_FOCUS_OPTIONS,
  useAuth,
  type PracticeCadence,
  type PracticeFocus,
} from "@/context/auth";
import { useCoachVoice } from "@/hooks/useCoachVoice";
import { useConnection } from "@/pairing/context";
import { describeFailure } from "@/pairing/errors";
import { describeError, useServerStatus } from "@/hooks/useServerStatus";
import { normalizeScore } from "@/practice/scoring";
import { colors, radii, spacing } from "@/theme/theme";

export default function ProfileScreen() {
  const { session, profile, updateProfile, signOut } = useAuth();
  const { mode, state: connectionState } = useConnection();
  const voice = useCoachVoice();
  const server = useServerStatus();
  const statsQuery = useQuery({ queryKey: ["stats"], queryFn: getStats });

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
      setSaved(true);
    } catch (cause) {
      setError(describeError(cause, "Could not save your changes."));
    } finally {
      setSaving(false);
    }
  }

  function confirmSignOut() {
    Alert.alert(
      "Sign out?",
      "Your progress stays in your account. Coach conversations saved on this device are kept but will not be visible until you sign back in.",
      [
        { text: "Stay signed in", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            signOut();
          },
        },
      ],
    );
  }

  const stats = statsQuery.data;
  const version = Constants.expoConfig?.version ?? "dev";

  return (
    <Screen refreshing={statsQuery.isFetching} onRefresh={() => statsQuery.refetch()}>
      <SectionHeader eyebrow="Profile" title={profile.displayName} subtitle={session?.user.email ?? undefined} />

      <Card variant="dark">
        <Eyebrow onDark>Your practice</Eyebrow>
        {statsQuery.isError ? (
          <Banner
            tone="warning"
            message={describeError(statsQuery.error, "Your stats could not be loaded.")}
            actionLabel="Retry"
            onAction={() => statsQuery.refetch()}
          />
        ) : (
          <View style={styles.statsRow}>
            <StatTile
              tone="translucent"
              label="Attempts"
              value={stats ? String(stats.total_attempts) : "—"}
            />
            <StatTile
              tone="translucent"
              label="Avg score"
              value={stats ? String(normalizeScore(stats.average_score)) : "—"}
            />
            <StatTile
              tone="translucent"
              label="Day streak"
              value={stats ? String(stats.current_streak_days) : "—"}
            />
          </View>
        )}
      </Card>

      <Card>
        <Eyebrow>Account</Eyebrow>
        {error ? <Banner message={error} tone="error" /> : null}
        {saved && !dirty ? <Banner tone="success" message="Saved." /> : null}
        <TextField
          label="Display name"
          placeholder="Your name"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setSaved(false);
          }}
        />
        <OptionRow
          label="Focus area"
          options={PRACTICE_FOCUS_OPTIONS}
          value={focus}
          onChange={(value) => {
            setFocus(value);
            setSaved(false);
          }}
        />
        <OptionRow
          label="Daily pace"
          options={PRACTICE_CADENCE_OPTIONS}
          value={cadence}
          onChange={(value) => {
            setCadence(value);
            setSaved(false);
          }}
        />
        <PillButton
          label={saving ? "Saving" : "Save changes"}
          variant="secondary"
          loading={saving}
          disabled={!dirty}
          onPress={handleSave}
        />
      </Card>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Coach voice settings"
        onPress={() => router.push("/settings/voice")}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
        <View style={styles.rowIcon}>
          <Volume2 color={colors.hunter} size={20} />
        </View>
        <View style={styles.rowBody}>
          <Title size={16}>Coach voice</Title>
          <Body size={12} numberOfLines={1}>
            {voice.instruct}
          </Body>
        </View>
        <ChevronRight color={colors.slate} size={20} />
      </Pressable>

      {!server.reachable ? (
        <Card>
          <View style={styles.rowHead}>
            <View style={styles.rowIcon}>
              <Wifi color={colors.brick} size={20} />
            </View>
            <Title size={16}>Not connected</Title>
          </View>
          <Body size={13}>{server.message ?? "Cadence can't reach the server."}</Body>
          <PillButton
            label={server.actionLabel ?? "Try again"}
            variant="secondary"
            onPress={server.refresh}
          />
        </Card>
      ) : null}

      {mode === "local" ? (
        <Card>
          <Eyebrow>Your computer</Eyebrow>
          <Body size={13}>
            {connectionState.status === "connected"
              ? `Connected to ${connectionState.serverName} over Wi-Fi.`
              : connectionState.status === "connecting"
                ? "Looking for your computer\u2026"
                : describeFailure(
                    connectionState.status === "offline" ? connectionState.failure : "unknown",
                  ).title}
          </Body>
          <PillButton
            label="Connection settings"
            variant="secondary"
            onPress={() => router.push("/connect")}
          />
        </Card>
      ) : (
        <Card>
          <Eyebrow>Your computer</Eyebrow>
          <Body size={13}>
            Cadence can run on your own computer instead, over your home Wi-Fi. Nothing to pay for,
            and your voice never leaves the house.
          </Body>
          <PillButton
            label="Connect to my computer"
            variant="secondary"
            onPress={() => router.push("/connect")}
          />
        </Card>
      )}

      <Card>
        <Eyebrow>Session</Eyebrow>
        <Body size={13}>
          Signing out clears this device. Your modules, exams and conversation progress live in your
          account.
        </Body>
        <PillButton label="Sign out" variant="danger" onPress={confirmSignOut} />
      </Card>

      <Body size={11} style={styles.version}>
        Cadence {version}
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.card,
    backgroundColor: colors.snow,
    padding: spacing.xl,
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  version: {
    textAlign: "center",
    color: colors.slate,
  },
});
