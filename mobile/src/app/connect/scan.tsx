// FILE: mobile/src/app/connect/scan.tsx
//
// The QR scanner. Everything that can go wrong here has a sentence attached:
// camera refused, wrong kind of code, expired code, already-used code, a
// computer running a different version. A spinner is never the answer.
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Banner, Button, LoadingBlock, Screen, SectionHeader, TopBar } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { describeFailure, failureFromParseFailure, type ConnectionFailure } from "@/pairing/errors";
import { useEnterAppWhenPaired } from "@/hooks/useEnterAppWhenPaired";
import { useConnection } from "@/pairing/context";
import { isPayloadExpired, parsePairingUri } from "@/pairing/protocol";
import { colors, radii, type } from "@/theme/theme";

export default function ScanScreen() {
  const router = useRouter();
  const { pair } = useConnection();
  const enterApp = useEnterAppWhenPaired();
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
        haptics.warning();
        setFailure(failureFromParseFailure(parsed.reason));
        return;
      }

      if (isPayloadExpired(parsed.payload)) {
        haptics.warning();
        setFailure("code_expired");
        return;
      }

      claimed.current = true;
      setBusy(true);
      setFailure(null);

      const result = await pair(parsed.payload).catch(() => ({
        ok: false as const,
        failure: "unknown" as const,
      }));

      if (result.ok) {
        haptics.success();
        enterApp();
        return;
      }

      haptics.error();
      claimed.current = false;
      setBusy(false);
      setFailure(result.failure);
    },
    [busy, enterApp, pair],
  );

  const back = router.canGoBack() ? <TopBar onBack={() => router.back()} /> : null;

  if (!permission) {
    return (
      <Screen>
        {back}
        <LoadingBlock rows={1} label="Checking camera access…" />
      </Screen>
    );
  }

  if (!permission.granted) {
    const denied = !permission.canAskAgain;
    const message = describeFailure("camera_denied");

    return (
      <Screen>
        {back}
        <SectionHeader
          eyebrow="Connect to my computer"
          title={denied ? message.title : "Cadence needs the camera"}
          size={type.title2}
          subtitle={message.body}
        />
        <Button
          label={denied ? "Open Settings" : "Allow camera"}
          onPress={() => {
            if (denied) void Linking.openSettings();
            else void requestPermission();
          }}
        />
        <Button
          label="Type the code instead"
          variant="tonal"
          onPress={() => router.push("/connect/manual")}
        />
      </Screen>
    );
  }

  const failureMessage = failure ? describeFailure(failure) : null;

  return (
    <Screen scroll={false}>
      {back}
      <SectionHeader
        eyebrow="Connect to my computer"
        title="Point at the code on your computer"
        size={type.title2}
        subtitle="Open Cadence on your computer and choose Connect a Phone."
      />

      <View style={styles.viewfinder}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={busy ? undefined : (event) => void onScanned(event)}
        />
      </View>

      {busy ? (
        <Banner tone="info" message="Connecting to your computer…" />
      ) : failureMessage ? (
        <Banner
          tone="error"
          message={`${failureMessage.title}. ${failureMessage.body}`}
          actionLabel={failureMessage.actionKind === "settings" ? "Open Settings" : (failureMessage.action ?? "Try again")}
          onAction={() =>
            failureMessage.actionKind === "settings" ? void Linking.openSettings() : setFailure(null)
          }
        />
      ) : null}

      <Button
        label="Type the code instead"
        variant="tonal"
        onPress={() => router.push("/connect/manual")}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    flex: 1,
    minHeight: 220,
    borderRadius: radii.cardLarge,
    overflow: "hidden",
    backgroundColor: colors.carbon,
  },
});
