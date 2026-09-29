// FILE: mobile/src/app/connect/index.tsx
//
// The fork in the road: your own computer, or the hosted service. The choice is
// explicit because the two behave differently in ways a person can feel — one
// needs the computer awake and on the same Wi-Fi, the other needs an account.
import { useRouter } from "expo-router";
import { View } from "react-native";

import { Body, Card, Eyebrow, PillButton, Screen, Title } from "@/components/ui";
import { isCloudConfigured } from "@/lib/config";
import { useConnection } from "@/pairing/context";
import { colors, spacing } from "@/theme/theme";

export default function ConnectIndexScreen() {
  const router = useRouter();
  const { chooseCloud } = useConnection();

  return (
    <Screen>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Set up Cadence</Eyebrow>
          <Title size={28}>How should Cadence work?</Title>
        </View>

        <Card variant="dark">
          <View style={{ gap: spacing.md }}>
            <Eyebrow onDark>Recommended</Eyebrow>
            <Title size={22} onDark>
              Connect to my computer
            </Title>
            <Body onDark>
              Cadence runs on your computer and your phone talks to it over your
              home Wi-Fi. Your voice never leaves your house, and there is nothing
              to pay for.
            </Body>
            <Body onDark size={13} style={{ color: "rgba(248,249,250,0.66)" }}>
              You will need Cadence open on your computer, and both devices on the
              same Wi-Fi.
            </Body>
            <PillButton label="Scan the code" onPress={() => router.push("/connect/scan")} />
          </View>
        </Card>

        {isCloudConfigured ? (
          <Card>
            <View style={{ gap: spacing.md }}>
              <Eyebrow>Hosted</Eyebrow>
              <Title size={22}>Use Cadence Cloud</Title>
              <Body>
                Sign in with a Cadence account. Works anywhere, on any network,
                with your progress synced across devices.
              </Body>
              <PillButton
                label="Sign in"
                variant="secondary"
                onPress={async () => {
                  await chooseCloud();
                  router.replace("/login");
                }}
              />
            </View>
          </Card>
        ) : (
          <Card variant="cream">
            <Body size={13} style={{ color: colors.slate }}>
              This copy of Cadence has no hosted service configured, so connecting
              to your own computer is the only option.
            </Body>
          </Card>
        )}
      </View>
    </Screen>
  );
}
