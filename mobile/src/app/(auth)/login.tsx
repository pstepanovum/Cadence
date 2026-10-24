import { signInWithEmailAndPassword } from "firebase/auth";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { SvgXml } from "react-native-svg";
import { Banner, Body, Button, Card, Screen, TextField, TextLink, Title } from "@/components/ui";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { describeAuthError } from "@/copy/auth-errors";
import { haptics } from "@/lib/haptics";
import { requireFirebaseAuth } from "@/lib/firebase";
import { spacing, type } from "@/theme/theme";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit = email.trim().length > 0 && password.length > 0;

  async function handleSignIn() {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // The auth context hears about the sign-in and the navigator moves on;
      // nothing to do here on success.
      await signInWithEmailAndPassword(requireFirebaseAuth(), email.trim(), password);
    } catch (cause) {
      haptics.error();
      setError(describeAuthError(cause, "Could not sign in. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.center}>
      <View style={styles.logoWrap}>
        <SvgXml xml={LOGO_GREEN_DARK} width={160} height={40} />
      </View>
      <Card>
        <Title size={type.title2}>Welcome back</Title>
        <Body size={type.callout} tone="muted">
          Sign in to keep training your pronunciation.
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
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={setEmail}
          editable={!submitting}
        />
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder="Your password"
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={handleSignIn}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />
        <Button label="Sign in" loading={submitting} disabled={!canSubmit} onPress={handleSignIn} />
        <TextLink label="Forgot your password?" href="/forgot-password" />
      </Card>
      <View style={styles.footerRow}>
        <Body size={type.callout} tone="muted">
          New to Cadence?
        </Body>
        <TextLink label="Create an account" href="/signup" />
      </View>
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
  footerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    columnGap: spacing.sm,
  },
});
