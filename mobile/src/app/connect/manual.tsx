// FILE: mobile/src/app/connect/manual.tsx
//
// The fallback for when the camera is refused, the screen is too glossy to
// scan, or the person simply prefers typing. The pairing screen on the computer
// shows both pieces this asks for.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { type TextInput } from "react-native";

import { Banner, Body, Button, Screen, SectionHeader, TextField, TopBar } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { parseAddress } from "@/pairing/address";
import { useEnterAppWhenPaired } from "@/hooks/useEnterAppWhenPaired";
import { useConnection } from "@/pairing/context";
import { describeFailure, type ConnectionFailure } from "@/pairing/errors";
import {
  PAIRING_PROTOCOL_VERSION,
  normalizePairingCode,
  type PairingPayload,
} from "@/pairing/protocol";
import { type } from "@/theme/theme";

export default function ManualConnectScreen() {
  const router = useRouter();
  const { pair } = useConnection();
  // `home=1`: pairing the learner's own server while staying signed in.
  const { home } = useLocalSearchParams<{ home?: string }>();
  const keepAccount = home === "1";
  const enterApp = useEnterAppWhenPaired();

  const [address, setAddress] = useState("");
  const [code, setCode] = useState("");
  const [failure, setFailure] = useState<ConnectionFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const codeRef = useRef<TextInput>(null);

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

    // A failure to save the pairing (the keychain refusing a write, say) must
    // not leave the button spinning.
    const result = await pair(payload, { keepAccount }).catch(() => ({ ok: false as const, failure: "unknown" as const }));
    setBusy(false);

    if (result.ok) {
      haptics.success();
      enterApp();
      return;
    }

    haptics.error();
    setFailure(result.failure);
  }

  const message = failure ? describeFailure(failure) : null;

  return (
    <Screen>
      {router.canGoBack() ? <TopBar onBack={() => router.back()} /> : null}
      <SectionHeader
        eyebrow="Connect to my computer"
        title="Type what your computer shows"
        size={type.title2}
        subtitle="The pairing screen on your computer shows an address and a 12-character code."
      />

      <TextField
        testID="pair-address"
        label="Computer address"
        placeholder="192.168.1.42:3000"
        value={address}
        onChangeText={setAddress}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        inputMode="url"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => codeRef.current?.focus()}
      />

      <TextField
        ref={codeRef}
        testID="pair-code"
        label="Code"
        placeholder="ABCD-EFGH-JKMN"
        value={code}
        onChangeText={setCode}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={20}
        returnKeyType="go"
        onSubmitEditing={() => void connect()}
      />

      {message ? <Banner tone="error" message={`${message.title}. ${message.body}`} /> : null}

      <Button label="Connect" loading={busy} onPress={() => void connect()} />
      <Button label="Scan the code instead" variant="tonal" onPress={() => router.replace({ pathname: "/connect/scan", params: keepAccount ? { home: "1" } : {} })} />
      <Body size={type.caption} tone="muted">
        Both devices need to be on the same Wi-Fi.
      </Body>
    </Screen>
  );
}
