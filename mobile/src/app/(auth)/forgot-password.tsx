import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { FitScreen, useCompactHeight, useKeyboardVisible } from "@/components/auth/layout";
import { AuthField, TestBuildNote, Wordmark } from "@/components/auth/SignInOptions";
import { Banner, Body, Button, Title, TopBar } from "@/components/ui";
import { appCheckHeaders } from "@/lib/app-check";
import { config } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { colors, spacing, type } from "@/theme/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Cadence's own reset (POST /api/auth/password-reset on the hosted server),
 * the same route the website uses: never Firebase's reset email. The answer
 * is the same whether or not the address has an account.
 */
async function sendResetEmail(email: string): Promise<void> {
  if (!config.apiUrl) throw new ResetUnavailableError();
  const response = await fetch(`${config.apiUrl}/api/auth/password-reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await appCheckHeaders()) },
    body: JSON.stringify({ email }),
  });
  if (response.status === 429) throw new ResetUnavailableError("Too many tries. Wait a few minutes and try again.");
  if (!response.ok) throw new ResetUnavailableError();
}

class ResetUnavailableError extends Error {
  constructor(message = "Couldn't send the reset email. Try again.") {
    super(message);
  }
}

export default function ForgotPasswordScreen() {
  const typing = useKeyboardVisible();
  const compact = useCompactHeight();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = email.trim();

  async function handleReset() {
    if (submitting) return;
    if (!EMAIL.test(trimmed)) {
      haptics.error();
      setError("Enter the email you signed up with.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      // The link opens Cadence's reset page on the web; once the new password
      // is set, sign in here with it.
      await sendResetEmail(trimmed);
      haptics.success();
      setSent(true);
    } catch (cause) {
      haptics.error();
      setError(cause instanceof ResetUnavailableError ? cause.message : "Couldn't send the reset email. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FitScreen header={<TopBar onBack={() => router.back()} backLabel="Back to sign in" />}>
      <View style={[styles.stack, compact && styles.stackCompact]}>
        {typing ? null : (
          <View style={styles.logo}>
            <Wordmark />
          </View>
        )}
        <View style={styles.heading}>
          <Title size={type.title1} style={[styles.centerText, { color: colors.carbon }]}>Reset your password</Title>
          <Body tone="muted" style={styles.centerText}>{sent ? "Check your inbox." : "We'll email you a link to set a new one."}</Body>
        </View>
        {sent ? (
          <>
            <Banner tone="success" message={`If an account exists for ${trimmed}, a reset link is on its way. Set a new password, then sign in here.`} />
            <Button label="Back to sign in" onPress={() => router.back()} />
          </>
        ) : (
          <View style={styles.form}>
            {error ? <Banner message={error} tone="error" /> : null}
            <AuthField
              testID="reset-email"
              accessibilityLabel="Email"
              placeholder="Email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={() => void handleReset()}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <Button label="Send reset link" loading={submitting} onPress={() => void handleReset()} />
          </View>
        )}
        <TestBuildNote />
      </View>
    </FitScreen>
  );
}

const styles = StyleSheet.create({
  stack: { flexGrow: 1, justifyContent: "center", gap: spacing.xl },
  stackCompact: { gap: spacing.lg },
  heading: { gap: spacing.xs, alignItems: "center" },
  logo: { alignItems: "center" },
  centerText: { textAlign: "center" },
  form: { gap: spacing.md },
});
