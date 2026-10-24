import { router } from "expo-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Banner, Body, Button, Card, Screen, TextField, Title, TopBar } from "@/components/ui";
import { config } from "@/lib/config";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { authErrorCode, describeAuthError } from "@/copy/auth-errors";
import { haptics } from "@/lib/haptics";
import { requireFirebaseAuth } from "@/lib/firebase";
import { spacing, type } from "@/theme/theme";

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
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = email.trim();

  async function handleReset() {
    if (!trimmed || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // The reset form is Firebase's own page; once the new password is set it
      // links back to the web app's sign-in.
      await sendResetEmail(trimmed);
      setSent(true);
    } catch (cause) {
      // Firebase does not say whether an account exists, and neither should
      // this screen, so a missing account reads the same as a sent link.
      if (authErrorCode(cause) === "auth/user-not-found") {
        setSent(true);
        return;
      }
      haptics.error();
      setError(describeAuthError(cause, "Could not send the reset email. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.center}>
      <TopBar onBack={() => router.back()} backLabel="Back to sign in" />
      <View style={styles.logoWrap}>
        <SvgXml xml={LOGO_GREEN_DARK} width={160} height={40} />
      </View>
      <Card>
        <Title size={type.title2}>Reset your password</Title>
        {sent ? (
          <>
            <Banner
              tone="success"
              message={`If an account exists for ${trimmed}, a reset link is on its way. Set a new password, then sign in here.`}
            />
            <Button label="Back to sign in" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Body size={type.callout} tone="muted">
              Enter the email you signed up with and we will send you a link to set a new password.
            </Body>
            {error ? <Banner message={error} tone="error" /> : null}
            <TextField
              label="Email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              keyboardType="email-address"
              returnKeyType="go"
              onSubmitEditing={handleReset}
              value={email}
              onChangeText={setEmail}
              editable={!submitting}
            />
            <Button label="Send reset link" loading={submitting} disabled={!trimmed} onPress={handleReset} />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flexGrow: 1,
    justifyContent: "center",
  },
  logoWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
});
