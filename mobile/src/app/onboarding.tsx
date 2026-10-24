import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Banner, Body, Button, Card, Eyebrow, OptionRow, Screen, TextField, TextLink, Title } from "@/components/ui";
import {
  PRACTICE_CADENCE_OPTIONS,
  PRACTICE_FOCUS_OPTIONS,
  useAuth,
  type PracticeCadence,
  type PracticeFocus,
} from "@/context/auth";
import { describeError } from "@/hooks/useServerStatus";
import { haptics } from "@/lib/haptics";
import { spacing, type } from "@/theme/theme";

/**
 * First run. Mirrors the web app's onboarding: a name, what to work on, and how
 * much time is realistic. The answers are saved to the cloud account's profile
 * on the server, which is also where the web app reads them, so a learner who
 * signs in on both sees one profile rather than two.
 */
export default function OnboardingScreen() {
  const { profile, updateProfile, signOut } = useAuth();

  const [name, setName] = useState(profile.displayName === "Learner" ? "" : profile.displayName);
  const [focus, setFocus] = useState<PracticeFocus>(profile.practiceFocus);
  const [cadence, setCadence] = useState<PracticeCadence>(profile.practiceCadence);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFinish() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        displayName: name.trim() || profile.displayName,
        practiceFocus: focus,
        practiceCadence: cadence,
        onboardingCompleted: true,
      });
      haptics.success();
      // The root navigator swaps to the tabs as soon as the flag lands.
    } catch (cause) {
      haptics.error();
      setError(describeError(cause, "Could not save your answers. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <View style={styles.intro}>
        <Eyebrow>Welcome to Cadence</Eyebrow>
        <Title size={type.title1}>Three quick questions</Title>
        <Body size={type.callout} tone="muted">
          They shape what you practise first. You can change them later in your profile.
        </Body>
      </View>

      <Card style={styles.form}>
        <TextField
          label="What should we call you?"
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          value={name}
          onChangeText={setName}
          editable={!saving}
        />
        <OptionRow
          label="What do you want to work on first?"
          options={PRACTICE_FOCUS_OPTIONS}
          value={focus}
          onChange={setFocus}
        />
        <OptionRow
          label="How much time feels realistic?"
          options={PRACTICE_CADENCE_OPTIONS}
          value={cadence}
          onChange={setCadence}
        />
      </Card>

      {error ? <Banner message={error} tone="error" /> : null}

      <Button label="Start practising" loading={saving} onPress={handleFinish} />

      <View style={styles.signOut}>
        <Body size={type.footnote} tone="muted">
          Wrong account?
        </Body>
        <TextLink label="Sign out" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  intro: {
    gap: spacing.xs,
    paddingTop: spacing.lg,
  },
  signOut: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    columnGap: spacing.sm,
    marginTop: spacing.xl,
  },
});
