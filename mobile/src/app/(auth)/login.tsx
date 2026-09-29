import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Banner, Body, Card, PillButton, Screen, TextField, Title } from "@/components/ui";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { describeError } from "@/hooks/useServerStatus";
import { supabase } from "@/lib/supabase";
import { colors, spacing } from "@/theme/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSignIn() {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        // Supabase says "Invalid login credentials", which reads as an
        // accusation; say what to do about it instead.
        setError(
          /invalid login credentials/i.test(signInError.message)
            ? "That email and password don't match an account. Check them and try again."
            : describeError(signInError, "Could not sign in. Try again."),
        );
      }
    } catch (cause) {
      setError(describeError(cause, "Could not sign in. Try again."));
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
          <Title size={24}>Welcome back</Title>
          <Body>Sign in to keep training your pronunciation.</Body>
          {error ? <Banner message={error} tone="error" /> : null}
          <TextField
            placeholder="Email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardType="email-address"
            returnKeyType="next"
            value={email}
            onChangeText={setEmail}
            editable={!submitting}
          />
          <TextField
            placeholder="Password"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleSignIn}
            value={password}
            onChangeText={setPassword}
            editable={!submitting}
          />
          <PillButton
            label="Sign in"
            loading={submitting}
            disabled={!canSubmit}
            onPress={handleSignIn}
          />
          <Link href="/forgot-password" style={styles.forgot}>
            <Body size={13} weight="semibold" style={{ color: colors.sage }}>
              Forgot your password?
            </Body>
          </Link>
          <View style={styles.footerRow}>
            <Body size={13}>New to Cadence?</Body>
            <Link href="/signup">
              <Body size={13} weight="semibold" style={{ color: colors.sage }}>
                Create an account
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
  forgot: {
    alignSelf: "center",
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
});
