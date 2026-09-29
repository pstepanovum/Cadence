import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Banner, Body, Card, PillButton, Screen, TextField, Title } from "@/components/ui";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { describeError } from "@/hooks/useServerStatus";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/theme";

const MIN_PASSWORD = 8;

export default function SignupScreen() {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const passwordLongEnough = password.length >= MIN_PASSWORD;
  const canSubmit = emailLooksValid && passwordLongEnough;

  async function handleSignUp() {
    if (!canSubmit || submitting) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          data: {
            displayName: displayName.trim() || trimmedEmail.split("@")[0],
            // Left false on purpose: the first run walks through onboarding,
            // the same three questions the web app asks.
            onboardingCompleted: false,
          },
        },
      });
      if (signUpError) {
        setError(describeError(signUpError, "Could not create your account. Try again."));
        return;
      }
      if (!data.session) {
        setNotice(
          "Almost there — check your email for a confirmation link, then come back and sign in.",
        );
      }
    } catch (cause) {
      setError(describeError(cause, "Could not create your account. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const missing = MIN_PASSWORD - password.length;

  return (
    <Screen style={styles.center}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.column}>
        <View style={styles.logoWrap}>
          <SvgXml xml={LOGO_GREEN_DARK} width={180} height={44} />
        </View>
        <Card>
          <Title size={24}>Create your account</Title>
          <Body>Start training your pronunciation in minutes.</Body>
          {error ? <Banner message={error} tone="error" /> : null}
          {notice ? <Banner message={notice} tone="success" /> : null}
          <TextField
            placeholder="Display name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            value={displayName}
            onChangeText={setDisplayName}
            editable={!submitting}
          />
          <TextField
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />
          <TextField
            placeholder={`Password (${MIN_PASSWORD}+ characters)`}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
          />
          {password.length > 0 && !passwordLongEnough ? (
            <Body size={12} style={{ color: colors.brick }}>
              {missing} more {missing === 1 ? "character" : "characters"} to go.
            </Body>
          ) : null}
          {trimmedEmail.length > 0 && !emailLooksValid ? (
            <Body size={12} style={{ color: colors.brick }}>
              That does not look like an email address yet.
            </Body>
          ) : null}
          <PillButton
            label="Create account"
            loading={submitting}
            disabled={!canSubmit}
            onPress={handleSignUp}
          />
          <View style={styles.footerRow}>
            <Body size={13}>Already have an account?</Body>
            <Link href="/login">
              <Body size={13} weight="semibold" style={{ color: colors.sage }}>
                Sign in
              </Body>
            </Link>
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    justifyContent: "center",
  },
  column: {
    gap: spacing.xl,
  },
  logoWrap: {
    alignItems: "center",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
