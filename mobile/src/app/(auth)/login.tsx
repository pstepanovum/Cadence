import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { FitScreen, useCompactHeight, useKeyboardVisible } from "@/components/auth/layout";
import { SignInOptions, TestBuildNote, Wordmark } from "@/components/auth/SignInOptions";
import { SwitchLine } from "@/components/auth/SwitchLine";
import { Body, Title } from "@/components/ui";
import { colors, spacing, type } from "@/theme/theme";

export default function LoginScreen() {
  const typing = useKeyboardVisible();
  const compact = useCompactHeight();
  return (
    <FitScreen footer={typing ? null : <SwitchLine prompt="New to Cadence?" label="Create an account" onPress={() => router.replace("/signup")} />}>
      <View style={[styles.stack, compact && styles.stackCompact]}>
        {typing ? null : (
          <View style={styles.logo}>
            <Wordmark />
          </View>
        )}
        <View style={styles.heading}>
          <Title size={type.title1} style={[styles.centerText, { color: colors.carbon }]}>Welcome back</Title>
          <Body tone="muted" style={styles.centerText}>Sign in to keep practising.</Body>
        </View>
        {/* The auth context hears about the sign-in and the navigator moves on. */}
        <SignInOptions intent="signin" forgotHref="/forgot-password" />
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
