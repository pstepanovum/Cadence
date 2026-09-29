// FILE: mobile/src/app/connect/scan.tsx
//
// The QR scanner. Everything that can go wrong here has a sentence attached:
// camera refused, wrong kind of code, expired code, already-used code, a
// computer running a different version. A spinner is never the answer.
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Body, Card, Eyebrow, PillButton, Screen, Title } from "@/components/ui";
import { describeFailure, failureFromParseFailure, type ConnectionFailure } from "@/pairing/errors";
import { useConnection } from "@/pairing/context";
import { isPayloadExpired, parsePairingUri } from "@/pairing/protocol";
import { colors, radii, spacing } from "@/theme/theme";

export default function ScanScreen() {
  const router = useRouter();
  const { pair } = useConnection();
  const [permission, requestPermission] = useCameraPermissions();
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);
  const [busy, setBusy] = useState(false);

  // The camera fires this many times a second while the code is in frame; one
  // successful scan has to win and the rest must be dropped, or the phone
  // burns the one-time code racing itself.
  const claimed = useRef(false);

  const onScanned = useCallback(
    async ({ data }: { data: string }) => {
      if (claimed.current || busy) {
        return;
      }

      const parsed = parsePairingUri(data);

      if (!parsed.ok) {
        setFailure(failureFromParseFailure(parsed.reason));
        return;
      }

      if (isPayloadExpired(parsed.payload)) {
        setFailure("code_expired");
        return;
      }

      claimed.current = true;
      setBusy(true);
      setFailure(null);

      const result = await pair(parsed.payload);

      if (result.ok) {
        router.replace("/");
        return;
      }

      claimed.current = false;
      setBusy(false);
      setFailure(result.failure);
    },
    [busy, pair, router],
  );

  if (!permission) {
    return (
      <Screen>
        <Body>Checking camera access…</Body>
      </Screen>
    );
  }

  if (!permission.granted) {
    const denied = !permission.canAskAgain;
    const message = describeFailure("camera_denied");

    return (
      <Screen>
        <View style={{ gap: spacing.lg }}>
          <Eyebrow>Connect to my computer</Eyebrow>
          <Title size={26}>{denied ? message.title : "Cadence needs the camera"}</Title>
          <Body>{message.body}</Body>
          <PillButton
            label={denied ? "Open Settings" : "Allow camera"}
            onPress={() => {
              if (denied) {
                void Linking.openSettings();
              } else {
                void requestPermission();
              }
            }}
          />
          <PillButton
            label="Type the code instead"
            variant="secondary"
            onPress={() => router.push("/connect/manual")}
          />
        </View>
      </Screen>
    );
  }

  const failureMessage = failure ? describeFailure(failure) : null;

  return (
    <Screen scroll={false}>
      <View style={{ gap: spacing.lg, flex: 1 }}>
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Connect to my computer</Eyebrow>
          <Title size={26}>Point at the code on your computer</Title>
          <Body>
            On your computer, open Cadence and choose Connect a Phone. A square
            code will appear.
          </Body>
        </View>

        <View style={styles.viewfinder}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={busy ? undefined : (event) => void onScanned(event)}
          />
        </View>

        {busy ? (
          <Card variant="cream">
            <Body>Connecting to your computer…</Body>
          </Card>
        ) : failureMessage ? (
          <Card variant="cream">
            <View style={{ gap: spacing.sm }}>
              <Title size={18}>{failureMessage.title}</Title>
              <Body>{failureMessage.body}</Body>
              {failureMessage.actionKind === "settings" ? (
                <PillButton
                  label="Open Settings"
                  variant="secondary"
                  onPress={() => void Linking.openSettings()}
                />
              ) : (
                <PillButton
                  label={failureMessage.action ?? "Try again"}
                  variant="secondary"
                  onPress={() => setFailure(null)}
                />
              )}
            </View>
          </Card>
        ) : null}

        <PillButton
          label="Type the code instead"
          variant="ghost"
          onPress={() => router.push("/connect/manual")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    flex: 1,
    minHeight: 260,
    borderRadius: radii.cardLarge,
    overflow: "hidden",
    backgroundColor: colors.carbon,
  },
});
