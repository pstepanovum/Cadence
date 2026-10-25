// FILE: mobile/src/app/connect/index.tsx
//
// The fork in the road: Cadence Cloud first, the main path, or your own
// Cadence on your computer. The choice is explicit because the two behave
// differently in ways a person can feel — one needs an account, the other
// needs the computer awake and on the same Wi-Fi.
import { useRouter } from "expo-router";
import { Cloud, Laptop } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card, Eyebrow, Screen, SectionHeader, Title, TopBar } from "@/components/ui";
import { isCloudConfigured } from "@/lib/config";
import { useConnection } from "@/pairing/context";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

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
        title={isCloudConfigured ? "Where should Cadence run?" : "Connect to your computer"}
      />

      {isCloudConfigured ? (
        <Card>
          <View style={styles.optionHead}>
            <View style={styles.optionIcon}>
              <Cloud color={colors.carbon} size={22} />
            </View>
            <View style={styles.optionTitle}>
              <Eyebrow>Recommended</Eyebrow>
              <Title size={type.title3}>Cadence Cloud</Title>
            </View>
          </View>
          <Body size={type.callout}>
            Practise anywhere, synced to your account. Plus adds AI scoring, voices and the coach.
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

      <Card>
        <View style={styles.optionHead}>
          <View style={styles.optionIcon}>
            <Laptop color={colors.carbon} size={22} />
          </View>
          <View style={styles.optionTitle}>
            <Eyebrow>On your computer</Eyebrow>
            <Title size={type.title3}>Connect your own Cadence</Title>
          </View>
        </View>
        <Body size={type.callout}>
          For Cadence running on your own computer, over your home Wi-Fi. Keep it open, on the same
          Wi-Fi as this phone.
        </Body>
        <Button
          label="Scan the code"
          variant={isCloudConfigured ? "secondary" : "primary"}
          onPress={() => router.push("/connect/scan")}
        />
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    optionHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    optionIcon: {
      width: 48,
      height: 48,
      borderRadius: radii.panel,
      backgroundColor: colors.platinum,
      alignItems: "center",
      justifyContent: "center",
    },
    optionTitle: {
      flex: 1,
      gap: spacing.xxs,
    },
  }),
);
