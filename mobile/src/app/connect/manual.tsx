// FILE: mobile/src/app/connect/manual.tsx
//
// The fallback for when the camera is refused, the screen is too glossy to
// scan, or the person simply prefers typing. The pairing screen on the computer
// shows both pieces this asks for.
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Body, Card, Eyebrow, PillButton, Screen, TextField, Title } from "@/components/ui";
import { parseAddress } from "@/pairing/address";
import { useConnection } from "@/pairing/context";
import { describeFailure, type ConnectionFailure } from "@/pairing/errors";
import {
  PAIRING_PROTOCOL_VERSION,
  normalizePairingCode,
  type PairingPayload,
} from "@/pairing/protocol";
import { spacing } from "@/theme/theme";

export default function ManualConnectScreen() {
  const router = useRouter();
  const { pair } = useConnection();

  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setFailure(null);

    const parsedAddress = parseAddress(address);
    if (!parsedAddress) {
      setFailure("code_malformed");
      return;
    }

    const normalized = normalizePairingCode(code);
    if (!normalized) {
      setFailure("code_malformed");
      return;
    }

    setBusy(true);

    const payload: PairingPayload = {
      version: PAIRING_PROTOCOL_VERSION,
      // Typed by hand, so we know neither of these yet. The claim response
      // carries the real values and is what gets stored.
      serverId: "",
      serverName: "",
      host: parsedAddress.host,
      port: parsedAddress.port,
      mdnsHost: parsedAddress.host.endsWith(".local") ? parsedAddress.host : null,
      scheme: "http",
      code: normalized,
      expiresAt: Date.now() + 60_000,
    };

    const result = await pair(payload);
    setBusy(false);

    if (result.ok) {
      router.replace("/");
      return;
    }

    setFailure(result.failure);
  }

  const message = failure ? describeFailure(failure) : null;

  return (
    <Screen>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Eyebrow>Connect to my computer</Eyebrow>
          <Title size={26}>Type what your computer shows</Title>
          <Body>
            The Cadence pairing screen on your computer shows an address and a
            12-character code. Copy both here.
          </Body>
        </View>

        <TextField
          label="Computer address"
          placeholder="192.168.1.42:3000"
          value={address}
          onChangeText={setAddress}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          inputMode="url"
        />

        <TextField
          label="Code"
          placeholder="ABCD-EFGH-JKMN"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={20}
        />

        {message ? (
          <Card variant="cream">
            <View style={{ gap: spacing.xs }}>
              <Title size={17}>{message.title}</Title>
              <Body>{message.body}</Body>
            </View>
          </Card>
        ) : null}

        <PillButton label="Connect" loading={busy} onPress={() => void connect()} />
        <PillButton
          label="Scan the code instead"
          variant="ghost"
          onPress={() => router.replace("/connect/scan")}
        />
      </View>
    </Screen>
  );
}
