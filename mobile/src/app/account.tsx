// The cloud account: Plus status, restore and manage, what is kept where,
// product news (opt-in), data export and account deletion
// (docs/PLATFORM.md, sections 4 and 11).
import { router } from "expo-router";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";

import { deleteAccount, exportAccount } from "@/api/account";
import { Banner, Body, Button, Card, Eyebrow, Screen, TextField, Title, TopBar } from "@/components/ui";
import { useAccount } from "@/context/account";
import { useAuth } from "@/context/auth";
import { forgetLearner } from "@/learning/store";
import { renewalLine } from "@/lib/billing/plans";
import { manageSubscription, restorePurchases, storeConfigured } from "@/lib/billing/purchases";
import { config } from "@/lib/config";
import { getFirebaseAuth } from "@/lib/firebase";
import { haptics } from "@/lib/haptics";
import { spacing, type } from "@/theme/theme";

export default function AccountScreen() {
  const { user, signOut } = useAuth();
  const account = useAccount();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");

  const plusRecord = account.me?.plus ?? null;
  const fromWeb = plusRecord?.source === "stripe";
  const site = config.apiUrl ?? "https://cadence.pstepanov.dev";

  async function run(key: string, task: () => Promise<void>) {
    setBusy(key);
    setMessage(null);
    try {
      await task();
    } catch (error) {
      haptics.error();
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Something went wrong. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const restore = () =>
    run("restore", async () => {
      const status = await restorePurchases();
      account.noteStoreStatus(status);
      setMessage(status.active ? { tone: "success", text: "Plus restored." } : { tone: "info", text: "No Plus subscription found for this Apple Account." });
    });

  const download = () =>
    run("export", async () => {
      const json = await exportAccount();
      const file = new File(Paths.cache, "cadence-data-export.json");
      if (file.exists) file.delete();
      file.create();
      file.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Your Cadence data" });
      } else {
        setMessage({ tone: "success", text: "Your data is ready." });
      }
    });

  const confirmDelete = () =>
    run("delete", async () => {
      const auth = getFirebaseAuth();
      const current = auth?.currentUser;
      if (!current?.email) throw new Error("Sign in again, then try once more.");
      try {
        await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
      } catch {
        throw new Error("That password didn't work.");
      }
      await deleteAccount();
      await forgetLearner(current.uid);
      haptics.success();
      await signOut();
    });

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Account" title={user?.email ?? "Your account"} />
      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      <Card>
        <Eyebrow>Plan</Eyebrow>
        <Title size={type.title3}>{account.plus ? "Cadence Plus" : "Free"}</Title>
        <Body size={type.footnote} tone="muted">
          {account.plus
            ? (renewalLine(account.store.active ? account.store : (plusRecord ?? { expiresAt: null, willRenew: false })) ?? "Plus is active.")
            : "Lessons, practice and the mouth map are free. Plus adds cloud AI and full sync."}
        </Body>
        {account.plus ? (
          fromWeb ? (
            <Button label="Manage on the web" variant="tonal" onPress={() => void Linking.openURL(`${site}/account`)} />
          ) : (
            <Button label="Manage subscription" variant="tonal" disabled={!storeConfigured} onPress={() => void manageSubscription()} />
          )
        ) : (
          <Button label="See Cadence Plus" onPress={() => router.push("/plus")} />
        )}
        <Button label="Restore purchases" variant="outline" loading={busy === "restore"} disabled={!storeConfigured || busy !== null} onPress={() => void restore()} />
      </Card>

      <Card>
        <Eyebrow>Your progress</Eyebrow>
        <Body size={type.callout}>
          {account.tier === "full"
            ? "Everything you practise is saved to your account and synced across your devices."
            : "Your account keeps a short summary: streak, minutes, lessons and recent results. The detail stays on this phone."}
        </Body>
      </Card>

      <Card>
        <Eyebrow>Your data</Eyebrow>
        <Body size={type.callout}>Download everything your account holds as a JSON file.</Body>
        {!deleting ? <Button label="Download my data" variant="tonal" loading={busy === "export"} disabled={busy !== null} onPress={() => void download()} /> : null}
        {!deleting ? (
          <Button label="Delete account" variant="danger" disabled={busy !== null} onPress={() => setDeleting(true)} />
        ) : (
          <View style={styles.delete}>
            <Body size={type.callout}>
              This deletes your account and its progress for good. A subscription bought in the App Store keeps running until you cancel it in your Apple Account settings.
            </Body>
            <Button label="Download my data first" variant="tonal" loading={busy === "export"} disabled={busy !== null} onPress={() => void download()} />
            <TextField testID="delete-password" label="Your password" secureTextEntry autoComplete="current-password" returnKeyType="done" submitBehavior="blurAndSubmit" value={password} onChangeText={setPassword} />
            <Button
              label="Delete my account"
              variant="danger"
              loading={busy === "delete"}
              disabled={!password || busy !== null}
              onPress={() =>
                Alert.alert("Delete your account?", "This can't be undone.", [
                  { text: "Keep it", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => void confirmDelete() },
                ])
              }
            />
            <Button label="Cancel" variant="outline" onPress={() => setDeleting(false)} />
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  delete: { gap: spacing.md },
});
