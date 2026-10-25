// The account step: Apple, Google, or an email and password (the news box
// starts unticked), creating an account or signing in to one. Optional with
// your own server, where it keeps a summary of progress in sync (Skip is in
// the top bar); needed for the cloud.
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useKeyboardVisible } from "@/components/auth/layout";
import { SignInOptions, TestBuildNote, type AuthIntent } from "@/components/auth/SignInOptions";
import { Body } from "@/components/ui";
import { spacing, type } from "@/theme/theme";

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
  const [intent, setIntent] = useState<AuthIntent>("signup");
  const typing = useKeyboardVisible();

  if (signedInEmail) {
    return (
      <View style={styles.signedIn}>
        <Body size={type.callout} tone="muted">
          Signed in as
        </Body>
        <Body size={type.headline} weight="semibold">
          {signedInEmail}
        </Body>
        <Body size={type.footnote} tone="muted">
          Your progress follows this account.
        </Body>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SignInOptions
        intent={intent}
        onIntentChange={setIntent}
        testIDPrefix="account"
        // The news opt-in is sent when setup finishes, once the phone talks to the cloud.
        onSignedIn={({ newsletter }) => afterAccount({ newsletter })}
      />
      {optional && !typing ? (
        <Body size={type.caption} tone="muted" style={styles.center}>
          Optional. Without an account your progress stays on this phone and your own server.
        </Body>
      ) : null}
      <TestBuildNote />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  signedIn: { gap: spacing.xs },
  center: { textAlign: "center" },
});
