import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { FitScreen, useCompactHeight, useKeyboardVisible } from "@/components/auth/layout";
import { AuthField, TestBuildNote, Wordmark } from "@/components/auth/SignInOptions";
import { Banner, Body, Button, Title, TopBar } from "@/components/ui";
import { authErrorCode, describeAuthError } from "@/copy/auth-errors";
import { config } from "@/lib/config";
import { requireFirebaseAuth } from "@/lib/firebase";
import { haptics } from "@/lib/haptics";
import { spacing, type } from "@/theme/theme";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendResetEmail(email: string): Promise<void> {
  const auth = requireFirebaseAuth();
  if (!config.apiUrl) return sendPasswordResetEmail(auth, email);
  try {
    await sendPasswordResetEmail(auth, email, { url: `${config.apiUrl}/login` });
  } catch (cause) {
    // The continue link only works once its domain is authorised in the
    // Firebase project. Until it is, send the plain reset email instead.
    const code = authErrorCode(cause);
    if (code !== "auth/unauthorized-continue-uri" && code !== "auth/invalid-continue-uri") {
      throw cause;
    }
    await sendPasswordResetEmail(auth, email);
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
      // The reset form is Firebase's own page; once the new password is set it
      // links back to the web app's sign-in.
      await sendResetEmail(trimmed);
      haptics.success();
      setSent(true);
    } catch (cause) {
      // Firebase does not say whether an account exists, and neither should
      // this screen, so a missing account reads the same as a sent link.
      if (authErrorCode(cause) === "auth/user-not-found") {
        haptics.success();
        setSent(true);
        return;
      }
      haptics.error();
      setError(describeAuthError(cause, "Couldn't send the reset email. Try again.", { emulator: config.authEmulator }));
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
          <Title size={type.title1} style={styles.centerText}>Reset your password</Title>
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
