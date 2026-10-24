// FILE: mobile/src/app/pair.tsx
//
// Opens when the pairing QR is scanned with the iPhone's own Camera, which
// hands the app the cadence://pair link instead of the in-app scanner. A link
// can come from anywhere, so nothing is claimed until the person confirms the
// computer it names.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";

import { Banner, Body, Button, Card, Screen, SectionHeader, TopBar } from "@/components/ui";
import { useEnterAppWhenPaired } from "@/hooks/useEnterAppWhenPaired";
import { haptics } from "@/lib/haptics";
import { onboardingInProgress } from "@/onboarding/store";
import { useConnection } from "@/pairing/context";
import { describeFailure, failureFromParseFailure, type ConnectionFailure } from "@/pairing/errors";
import { isPayloadExpired, parsePairingUri } from "@/pairing/protocol";
import { type } from "@/theme/theme";

export default function PairLinkScreen() {
  const router = useRouter();
  const { pair, mode } = useConnection();
  const enterApp = useEnterAppWhenPaired();
  const params = useLocalSearchParams<Record<string, string>>();
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (typeof value === "string") query.set(key, value);
  const parsed = parsePairingUri(`cadence://pair?${query.toString()}`);
  const linkFailure: ConnectionFailure | null = !parsed.ok
    ? failureFromParseFailure(parsed.reason)
    : isPayloadExpired(parsed.payload)
      ? "code_expired"
      : null;
  const shown = failure ?? linkFailure;
  const message = shown ? describeFailure(shown) : null;

  const close = () => (router.canGoBack() ? router.back() : router.replace(onboardingInProgress() ? "/onboarding" : "/(tabs)"));
  const scanAgain = () => router.replace({ pathname: "/connect/scan", params: mode === "cloud" ? { home: "1" } : {} });

  async function connect() {
    if (!parsed.ok || busy) return;
    setBusy(true);
    setFailure(null);
    // Signed in to the cloud: the computer joins as the learner's own server
    // and the account stays.
    const result = await pair(parsed.payload, { keepAccount: mode === "cloud" }).catch(() => ({ ok: false as const, failure: "unknown" as const }));
    if (result.ok) {
      haptics.success();
      enterApp();
      return;
    }
    haptics.error();
    setBusy(false);
    setFailure(result.failure);
  }

  return (
    <Screen>
      <TopBar onBack={close} />
      <SectionHeader eyebrow="Connect to my computer" title={parsed.ok ? `Connect to ${parsed.payload.serverName || "this computer"}?` : "This code can't be used"} size={type.title2} />
      {parsed.ok && !linkFailure ? (
        <Card>
          <Body size={type.callout}>
            Your phone will use Cadence on {parsed.payload.serverName || "this computer"} at {parsed.payload.host}:{parsed.payload.port} over your Wi-Fi. Only connect to a computer you know.
          </Body>
        </Card>
      ) : null}
      {message ? <Banner tone="error" message={`${message.title}. ${message.body}`} /> : null}
      {parsed.ok && !linkFailure ? (
        <Button label="Connect" loading={busy} onPress={() => void connect()} />
      ) : (
        <Button label="Scan the code" onPress={scanAgain} />
      )}
      <Button label="Cancel" variant="tonal" disabled={busy} onPress={close} />
    </Screen>
  );
}
