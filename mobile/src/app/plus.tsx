// The Cadence Plus paywall as a screen (iOS, RevenueCat). Never shown in
// own-server mode: with your own Cadence everything runs there and there is
// nothing to buy.
import { router } from "expo-router";

import { PlusPaywall } from "@/components/billing/PlusPaywall";
import { Body, Screen, TopBar } from "@/components/ui";
import { useAccount } from "@/context/account";
import { useConnection } from "@/pairing/context";
import { type } from "@/theme/theme";

export default function PlusScreen() {
  const { mode } = useConnection();
  const account = useAccount();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  return (
    <Screen>
      <TopBar onClose={close} closeLabel="Close Plus" />
      {mode !== "cloud" || !account.cloudAvailable ? (
        <Body size={type.callout}>{"With your own Cadence server, everything runs there. There's nothing to buy."}</Body>
      ) : (
        <PlusPaywall onDone={close} doneLabel="Not now" />
      )}
    </Screen>
  );
}
