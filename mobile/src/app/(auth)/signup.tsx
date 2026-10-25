import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { setNewsletter } from "@/api/account";
import { FitScreen, useCompactHeight, useKeyboardVisible } from "@/components/auth/layout";
import { SignInOptions, TestBuildNote, Wordmark } from "@/components/auth/SignInOptions";
import { SwitchLine } from "@/components/auth/SwitchLine";
import { Body, Title } from "@/components/ui";
import { spacing, type } from "@/theme/theme";

export default function SignupScreen() {
  const typing = useKeyboardVisible();
  const compact = useCompactHeight();
  return (
    <FitScreen footer={typing ? null : <SwitchLine prompt="Already have an account?" label="Sign in" onPress={() => router.replace("/login")} />}>
      <View style={[styles.stack, compact && styles.stackCompact]}>
        {typing ? null : (
          <View style={styles.logo}>
            <Wordmark />
          </View>
        )}
        <View style={styles.heading}>
          <Title size={type.title1} style={styles.centerText}>Create your account</Title>
          <Body tone="muted" style={styles.centerText}>Free. Your streak follows you to every device.</Body>
        </View>
        <SignInOptions
          intent="signup"
          onSignedIn={({ newsletter }) => {
            // Firebase signs the new account in straight away and the navigator
            // moves on to setup; the opt-in is sent once, unticked by default.
            if (newsletter) setNewsletter(true).catch(() => {});
          }}
        />
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
});
