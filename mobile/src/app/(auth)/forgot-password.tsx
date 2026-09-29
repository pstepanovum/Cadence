import { router } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import {
  Banner,
  Body,
  Card,
  PillButton,
  RoundIconButton,
  Screen,
  TextField,
  Title,
} from "@/components/ui";
import { config } from "@/lib/config";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { describeError } from "@/hooks/useServerStatus";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/theme";

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
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        // The reset form is a web page; the email link opens it in a browser.
        redirectTo: `${config.apiUrl}/reset-password`,
      });
      if (resetError) {
        setError(describeError(resetError, "Could not send the reset email. Try again."));
        return;
      }
      setSent(true);
    } catch (cause) {
      setError(describeError(cause, "Could not send the reset email. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen style={styles.center}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.column}>
        <View style={styles.logoWrap}>
          <SvgXml xml={LOGO_GREEN_DARK} width={180} height={44} />
        </View>
        <Card>
          <View style={styles.headerRow}>
            <RoundIconButton
              accessibilityLabel="Back to sign in"
              tone="cream"
              onPress={() => router.back()}>
              <ArrowLeft color={colors.hunter} size={18} />
            </RoundIconButton>
            <Title size={22}>Reset your password</Title>
          </View>

          {sent ? (
            <>
              <Banner
                tone="success"
                message={`If an account exists for ${trimmed}, a reset link is on its way. Open it on this phone or on your computer, set a new password, then come back and sign in.`}
              />
              <PillButton label="Back to sign in" onPress={() => router.back()} />
            </>
          ) : (
            <>
              <Body>
                Enter the email you signed up with and we will send you a link to set a new
                password.
              </Body>
              {error ? <Banner message={error} tone="error" /> : null}
              <TextField
                placeholder="Email"
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
              <PillButton
                label="Send reset link"
                loading={submitting}
                disabled={!trimmed}
                onPress={handleReset}
              />
            </>
          )}
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
});
