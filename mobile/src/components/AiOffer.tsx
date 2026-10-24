// What to show instead of an AI action that cannot run here: why, in one
// line, and the choices that would make it work (your own Cadence server,
// signing in, or Plus). Never shown in own-server mode for Plus, because the
// router never offers it there.
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";

import { Body, Button, Card } from "@/components/ui";
import { blockMessage, offerLabel } from "@/copy/ai-offer";
import { useConnection } from "@/pairing/context";
import type { Offer, RouteDecision } from "@/platform/engine-routing";
import { spacing, type } from "@/theme/theme";

export function AiOffer({ decision, compact = false }: { decision: Extract<RouteDecision, { route: "blocked" }>; compact?: boolean }) {
  const { mode, reconnect } = useConnection();

  function act(offer: Offer) {
    switch (offer) {
      case "connect_own_server":
        router.push(mode === "cloud" ? { pathname: "/connect/scan", params: { home: "1" } } : "/connect");
        break;
      case "reconnect_own_server":
        reconnect();
        break;
      case "sign_in":
        router.push("/connect");
        break;
      case "plus":
        router.push("/plus");
        break;
      case "retry_later":
        break;
    }
  }

  const offers = decision.offers.filter((offer) => offer !== "retry_later");

  return (
    <Card style={compact ? styles.compact : undefined}>
      <Body size={type.callout}>{blockMessage(decision.reason, decision.note)}</Body>
      {offers.length > 0 ? (
        <View style={styles.actions}>
          {offers.map((offer, index) => (
            <Button key={offer} label={offerLabel(offer)} variant={index === 0 ? "primary" : "neutral"} onPress={() => act(offer)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  compact: { padding: spacing.lg },
  actions: { gap: spacing.sm },
});
