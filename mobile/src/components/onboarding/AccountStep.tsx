// The account step: create a Cadence account with an email and password (the
// news checkbox starts unticked), or sign in to one. Optional with your own
// server, where it keeps a summary of progress in sync; needed for the cloud.
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { Check } from "lucide-react-native";
import { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type TextInput } from "react-native";

import { Banner, Body, Button, Card, TextField, TextLink } from "@/components/ui";
import { describeAuthError } from "@/copy/auth-errors";
import { haptics } from "@/lib/haptics";
import { requireFirebaseAuth } from "@/lib/firebase";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const MIN_PASSWORD = 8;

export function AccountStep({
  signedInEmail,
  optional,
  afterAccount,
}: {
  signedInEmail: string | null;
  optional: boolean;
  /**
   * Runs once the account exists (switching the phone to the cloud while
   * keeping a paired server). After, so a failed sign-in changes nothing.
   */
  afterAccount: (choices: { newsletter: boolean }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"create" | "signin">("create");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [news, setNews] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  if (signedInEmail) {
    return (
      <Card>
        <Body size={type.callout}>Signed in as</Body>
        <Body size={type.headline} weight="semibold">
          {signedInEmail}
        </Body>
        <Body size={type.footnote} tone="muted">
          Your progress follows this account.
        </Body>
      </Card>
    );
  }

  const trimmed = email.trim();
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const canSubmit = emailOk && (mode === "signin" ? password.length > 0 : password.length >= MIN_PASSWORD);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") {
        await createUserWithEmailAndPassword(requireFirebaseAuth(), trimmed, password);
      } else {
        await signInWithEmailAndPassword(requireFirebaseAuth(), trimmed, password);
      }
      // The news opt-in is sent when setup finishes, once the phone talks to the cloud.
      await afterAccount({ newsletter: mode === "create" && news });
      haptics.success();
    } catch (cause) {
      haptics.error();
      setError(describeAuthError(cause, mode === "create" ? "Could not create your account. Try again." : "Could not sign in. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      {error ? <Banner tone="error" message={error} /> : null}
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
        editable={!busy}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        placeholder={mode === "create" ? `At least ${MIN_PASSWORD} characters` : "Your password"}
        secureTextEntry
        autoComplete={mode === "create" ? "new-password" : "current-password"}
        textContentType={mode === "create" ? "newPassword" : "password"}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        value={password}
        onChangeText={setPassword}
        editable={!busy}
      />
      {mode === "create" ? (
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
      ) : null}
      <Button label={mode === "create" ? "Create account" : "Sign in"} loading={busy} disabled={!canSubmit} onPress={() => void submit()} />
      <View style={styles.switchRow}>
        <Body size={type.footnote} tone="muted">
          {mode === "create" ? "Already have an account?" : "New to Cadence?"}
        </Body>
        <TextLink label={mode === "create" ? "Sign in" : "Create one"} onPress={() => setMode(mode === "create" ? "signin" : "create")} />
      </View>
      {optional ? (
        <Body size={type.caption} tone="muted">
          Optional. Without an account your progress stays on this phone and your own server.
        </Body>
      ) : null}
    </Card>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: TAP_TARGET },
    box: { width: 24, height: 24, borderRadius: radii.tile / 2, borderWidth: 2, borderColor: colors.paleSlate, alignItems: "center", justifyContent: "center" },
    boxOn: { backgroundColor: colors.hunter, borderColor: colors.hunter },
    checkLabel: { flex: 1, fontFamily: fonts.body, fontSize: type.callout, color: colors.iron },
    switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: spacing.sm },
  }),
);
