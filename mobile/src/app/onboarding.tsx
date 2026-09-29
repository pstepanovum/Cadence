import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  Banner,
  Body,
  Card,
  Eyebrow,
  OptionRow,
  PillButton,
  Screen,
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
import { ILLUSTRATION_PROGRESS } from "@/data/svg";
import { describeError } from "@/hooks/useServerStatus";
import { spacing } from "@/theme/theme";

/**
 * First run. Mirrors the web app's onboarding: a name, what to work on, and how
 * much time is realistic. The answers live in Supabase user metadata, which is
 * also where the web app reads them, so a learner who signs in on both sees one
 * profile rather than two.
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
      // The root navigator swaps to the tabs as soon as the flag lands.
    } catch (cause) {
      setError(describeError(cause, "Could not save your answers. Try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Card variant="dark">
        <Eyebrow onDark>Welcome to Cadence</Eyebrow>
        <Title size={26} onDark>
          Three quick questions, then you are practising.
        </Title>
        <Body size={13} onDark>
          They shape what Cadence puts in front of you first. You can change any of them later from
          your profile.
        </Body>
        <View style={styles.illustration}>
          <SvgXml xml={ILLUSTRATION_PROGRESS} width={180} height={180} />
        </View>
      </Card>

      {error ? <Banner message={error} tone="error" /> : null}

      <Card>
        <TextField
          label="What should we call you?"
          placeholder="Your name"
          autoCapitalize="words"
          autoComplete="name"
          value={name}
          onChangeText={setName}
          editable={!saving}
        />
      </Card>

      <Card>
        <OptionRow
          label="What do you want to focus on first?"
          options={PRACTICE_FOCUS_OPTIONS}
          value={focus}
          onChange={setFocus}
        />
      </Card>

      <Card>
        <OptionRow
          label="What kind of pace feels realistic?"
          options={PRACTICE_CADENCE_OPTIONS}
          value={cadence}
          onChange={setCadence}
        />
      </Card>

      <PillButton label="Open my dashboard" loading={saving} onPress={handleFinish} />
      <PillButton
        label="Sign out"
        variant="ghost"
        disabled={saving}
        onPress={() => {
          signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  illustration: {
    alignItems: "center",
    paddingTop: spacing.sm,
  },
});
