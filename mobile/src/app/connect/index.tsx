// FILE: mobile/src/app/connect/index.tsx
//
// The fork in the road: your own computer, or the hosted service. The choice is
// explicit because the two behave differently in ways a person can feel — one
// needs the computer awake and on the same Wi-Fi, the other needs an account.
import { useRouter } from "expo-router";
import { Cloud, Laptop } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card, Eyebrow, Screen, SectionHeader, Title, TopBar } from "@/components/ui";
import { isCloudConfigured } from "@/lib/config";
import { useConnection } from "@/pairing/context";
import { colors, overlays, radii, spacing, type } from "@/theme/theme";

export default function ConnectIndexScreen() {
  const router = useRouter();
  const { chooseCloud } = useConnection();
  // Opened from Profile there is somewhere to go back to; on first launch there is not.
  const canGoBack = router.canGoBack();

  return (
    <Screen>
      {canGoBack ? <TopBar onBack={() => router.back()} /> : null}
      <SectionHeader
        eyebrow="Set up Cadence"
        title={isCloudConfigured ? "How should Cadence work?" : "Connect to your computer"}
      />

      <Card variant="dark">
        <View style={styles.optionHead}>
          <View style={[styles.optionIcon, styles.optionIconDark]}>
            <Laptop color={colors.lime} size={22} />
          </View>
          <View style={styles.optionTitle}>
            <Eyebrow onDark>{isCloudConfigured ? "Recommended" : "Over your Wi-Fi"}</Eyebrow>
            <Title size={type.title3} onDark>
              {isCloudConfigured ? "Connect to my computer" : "Pair this phone"}
            </Title>
          </View>
        </View>
        <Body size={type.callout} onDark>
          Cadence runs on your computer and your phone talks to it over your home Wi-Fi. Your voice
          never leaves your house.
        </Body>
        <Body size={type.footnote} onDark tone="muted">
          Keep Cadence open on your computer, on the same Wi-Fi as this phone.
        </Body>
        <Button label="Scan the code" variant="secondary" onPress={() => router.push("/connect/scan")} />
      </Card>

      {isCloudConfigured ? (
        <Card>
          <View style={styles.optionHead}>
            <View style={styles.optionIcon}>
              <Cloud color={colors.hunter} size={22} />
            </View>
            <View style={styles.optionTitle}>
              <Eyebrow>Hosted</Eyebrow>
              <Title size={type.title3}>Use Cadence Cloud</Title>
            </View>
          </View>
          <Body size={type.callout}>
            Sign in with a Cadence account. Works on any network, with your progress synced.
          </Body>
          <Button
            label="Sign in"
            onPress={async () => {
              await chooseCloud();
              router.replace("/login");
            }}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  optionHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.panel,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
  optionIconDark: {
    backgroundColor: overlays.whiteOnGreen,
  },
  optionTitle: {
    flex: 1,
    gap: spacing.xxs,
  },
});
