// Settings > Sign-in methods: the ways into this account (Apple, Google, email
// and password), adding one, removing one (never the last), and changing or
// adding the password.
import { router } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { SvgXml } from "react-native-svg";

import { Banner, Body, Button, Eyebrow, Screen, Title, TopBar } from "@/components/ui";
import { appleLogo, AuthField, GOOGLE_G, MIN_PASSWORD } from "@/components/auth/SignInOptions";
import { useAuth } from "@/context/auth";
import { describeAuthError, isCancelledSignIn } from "@/copy/auth-errors";
import { config } from "@/lib/config";
import { addPassword, changePassword, linkProvider, removeMethod, useProviderButtons, type ProviderMethod } from "@/lib/firebase-providers";
import { haptics } from "@/lib/haptics";
import { canRemoveMethod, methodLabel, type SignInMethod } from "@/platform/sign-in-methods";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

type Message = { tone: "error" | "success" | "info"; text: string };

function MethodIcon({ method }: { method: SignInMethod }) {
  if (method === "apple.com") return <SvgXml xml={appleLogo(colors.carbon)} width={18} height={18} />;
  if (method === "google.com") return <SvgXml xml={GOOGLE_G} width={18} height={18} />;
  return <KeyRound color={colors.carbon} size={20} />;
}

export default function SignInMethodsScreen() {
  const { user, refreshUser } = useAuth();
  const offeredProviders = useProviderButtons();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  const providers = user?.providers ?? [];
  const hasPassword = providers.includes("password");
  // Methods shown: the ones this phone can add, plus any already linked
  // (a Google account added on the web shows here even without a Google button).
  const shown: SignInMethod[] = (["apple.com", "google.com", "password"] as const).filter(
    (method) => method === "password" || providers.includes(method) || offeredProviders.includes(method as ProviderMethod),
  );

  async function run(key: string, task: () => Promise<string | null>) {
    if (busy) return;
    setBusy(key);
    setMessage(null);
    try {
      const done = await task();
      if (done) {
        haptics.success();
        setMessage({ tone: "success", text: done });
      }
      refreshUser();
    } catch (cause) {
      if (isCancelledSignIn(cause)) return;
      haptics.error();
      setMessage({ tone: "error", text: cause instanceof Error && !("code" in cause) ? cause.message : describeAuthError(cause, "That didn't work. Try again.", { emulator: config.authEmulator }) });
    } finally {
      setBusy(null);
    }
  }

  const add = (method: ProviderMethod) => run(method, async () => ((await linkProvider(method)) ? `${methodLabel(method)} added. You can sign in with it now.` : null));

  const remove = (method: SignInMethod) =>
    Alert.alert(`Remove ${methodLabel(method)}?`, "You won't be able to sign in this way any more. Your progress stays in your account.", [
      { text: "Keep", style: "cancel" },
      { text: `Remove ${methodLabel(method)}`, style: "destructive", onPress: () => void run(method, async () => (await removeMethod(method), `${methodLabel(method)} removed.`)) },
    ]);

  const savePassword = () =>
    run("password", async () => {
      if (next.length < MIN_PASSWORD) throw new Error(`Choose a password of at least ${MIN_PASSWORD} characters.`);
      if (hasPassword) {
        if (!current) throw new Error("Enter your current password.");
        await changePassword(current, next);
      } else {
        await addPassword(next);
      }
      setCurrent("");
      setNext("");
      return hasPassword ? "Password changed." : `Password added. Sign in with ${user?.email ?? "your email"} and it.`;
    });

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Account" title="Sign-in methods" />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <View style={styles.group}>
        <Body size={type.footnote} tone="muted">
          {user?.email ? `Ways to sign in to ${user.email}. Keep at least one.` : "Ways to sign in. Keep at least one."}
        </Body>
        {shown.map((method) => {
          const linked = providers.includes(method);
          const removable = linked && canRemoveMethod(providers, method);
          return (
            <View key={method} style={styles.row} testID={`method-${method}`}>
              <View style={styles.icon}>
                <MethodIcon method={method} />
              </View>
              <View style={styles.rowText}>
                <Title size={type.headline}>{methodLabel(method)}</Title>
                <Body size={type.footnote} tone="muted">
                  {linked ? (removable ? "Connected" : "Connected · your only way in") : "Not added"}
                </Body>
              </View>
              {linked ? (
                removable ? (
                  <Button label="Remove" variant="neutral" style={[styles.rowButton, styles.removeButton]} loading={busy === method} disabled={busy !== null} onPress={() => remove(method)} />
                ) : null
              ) : method !== "password" ? (
                <Button label="Add" style={styles.rowButton} loading={busy === method} disabled={busy !== null} onPress={() => void add(method as ProviderMethod)} />
              ) : null}
            </View>
          );
        })}
      </View>

      {user?.email ? (
        <View style={styles.group}>
          <Eyebrow>{hasPassword ? "Change password" : "Add a password"}</Eyebrow>
          {hasPassword ? (
            <AuthField testID="current-password" accessibilityLabel="Current password" placeholder="Current password" secureTextEntry autoComplete="current-password" textContentType="password" value={current} onChangeText={setCurrent} />
          ) : (
            <Body size={type.footnote} tone="muted">
              {`Sign in with ${user.email} and a password as well.`}
            </Body>
          )}
          <AuthField
            testID="new-password"
            accessibilityLabel="New password"
            placeholder={`New password, at least ${MIN_PASSWORD} characters`}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={() => void savePassword()}
            value={next}
            onChangeText={setNext}
          />
          <Button label={hasPassword ? "Change password" : "Add password"} loading={busy === "password"} disabled={busy !== null} onPress={() => void savePassword()} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    group: { gap: spacing.sm },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.platinum, padding: spacing.lg, minHeight: 72 },
    icon: { width: 40, height: 40, borderRadius: radii.control, backgroundColor: colors.alabaster, alignItems: "center", justifyContent: "center" },
    rowText: { flex: 1, gap: spacing.xxs },
    removeButton: { backgroundColor: colors.alabaster },
    rowButton: { minHeight: 40, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  }),
);
