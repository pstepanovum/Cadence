import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRef, useState } from "react";
import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View, type TextInput } from "react-native";
import { SvgXml } from "react-native-svg";
import { Banner, Body, Button, Card, Screen, TextField, TextLink, Title } from "@/components/ui";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { describeAuthError } from "@/copy/auth-errors";
import { haptics } from "@/lib/haptics";
import { requireFirebaseAuth } from "@/lib/firebase";
import { setNewsletter } from "@/api/account";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const MIN_PASSWORD = 8;

export default function SignupScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // The one place onboarding mentions news, and it starts unticked.
  const [news, setNews] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const trimmedEmail = email.trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
  const passwordLongEnough = password.length >= MIN_PASSWORD;
  const canSubmit = emailLooksValid && passwordLongEnough;

  async function handleSignUp() {
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // Firebase signs the new account in straight away, so the navigator
      // moves on to onboarding, the same three questions the web app asks.
      await createUserWithEmailAndPassword(requireFirebaseAuth(), trimmedEmail, password);
      if (news) setNewsletter(true).catch(() => {});
    } catch (cause) {
      haptics.error();
      setError(describeAuthError(cause, "Could not create your account. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  const missing = MIN_PASSWORD - password.length;

  return (
    <Screen contentStyle={styles.center}>
      <View style={styles.logoWrap}>
        <SvgXml xml={LOGO_GREEN_DARK} width={160} height={40} />
      </View>
      <Card>
        <Title size={type.title2}>Create your account</Title>
        <Body size={type.callout} tone="muted">
          Start training your pronunciation in minutes.
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
        {trimmedEmail.length > 0 && !emailLooksValid ? (
          <Body size={type.caption} tone="error">
            That does not look like an email address yet.
          </Body>
        ) : null}
        <TextField
          ref={passwordRef}
          label="Password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSignUp}
          value={password}
          onChangeText={setPassword}
          editable={!submitting}
        />
        {password.length > 0 && !passwordLongEnough ? (
          <Body size={type.caption} tone="error">
            {missing} more {missing === 1 ? "character" : "characters"} to go.
          </Body>
        ) : null}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: news }}
          accessibilityLabel="Send me product news and offers"
          onPress={() => setNews((value) => !value)}
          style={styles.checkRow}>
          <View style={[styles.box, news && styles.boxOn]}>{news ? <Check color={colors.snow} size={16} strokeWidth={3} /> : null}</View>
          <Text maxFontSizeMultiplier={maxScale.control} style={styles.checkLabel}>
            Send me product news and offers
          </Text>
        </Pressable>
        <Button label="Create account" loading={submitting} disabled={!canSubmit} onPress={handleSignUp} />
      </Card>
      <View style={styles.footerRow}>
        <Body size={type.callout} tone="muted">
          Already have an account?
        </Body>
        <TextLink label="Sign in" href="/login" />
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: TAP_TARGET },
    box: { width: 24, height: 24, borderRadius: radii.tile / 2, borderWidth: 2, borderColor: colors.paleSlate, alignItems: "center", justifyContent: "center" },
    boxOn: { backgroundColor: colors.hunter, borderColor: colors.hunter },
    checkLabel: { flex: 1, fontFamily: fonts.body, fontSize: type.callout, color: colors.iron },
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
  }),
);
