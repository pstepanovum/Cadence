// The Cadence Plus paywall (iOS, RevenueCat). Never shown in own-server mode:
// with your own Cadence everything runs there and there is nothing to buy.
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { Banner, Body, Button, Card, Eyebrow, LoadingBlock, Screen, TextLink, Title, TopBar } from "@/components/ui";
import { useAccount } from "@/context/account";
import { haptics } from "@/lib/haptics";
import { FALLBACK_PLANS, renewalLine, yearlySavingsPercent, type PlusPlan, type PlusPlanId } from "@/lib/billing/plans";
import { loadPlans, PurchaseError, purchasePlan, restorePurchases, storeConfigured } from "@/lib/billing/purchases";
import { config } from "@/lib/config";
import { useConnection } from "@/pairing/context";
import { colors, fonts, maxScale, radii, shadows, spacing, type, themed } from "@/theme/theme";

const INCLUDED = [
  "Pronunciation scoring, the coach and transcription in the cloud, anywhere",
  "Your full progress synced across your devices",
  "Every sound and grammar point tracked over time",
];

export default function PlusScreen() {
  const { mode } = useConnection();
  const account = useAccount();
  const plansQuery = useQuery({ queryKey: ["plus-plans"], queryFn: loadPlans, enabled: storeConfigured && account.signedIn, staleTime: 5 * 60_000 });
  const plans: PlusPlan[] = plansQuery.data?.length ? plansQuery.data : FALLBACK_PLANS;
  const [selected, setSelected] = useState<PlusPlanId>("yearly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  if (mode !== "cloud" || !account.cloudAvailable) {
    return (
      <Screen>
        <TopBar onClose={() => router.back()} />
        <Body size={type.callout}>{"With your own Cadence server, everything runs there. There's nothing to buy."}</Body>
      </Screen>
    );
  }

  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const monthly = plans.find((p) => p.id === "monthly");
  const yearly = plans.find((p) => p.id === "yearly");
  const savings = yearlySavingsPercent(monthly?.price, yearly?.price);
  const canBuy = storeConfigured && account.signedIn && (plansQuery.data?.length ?? 0) > 0;

  async function buy() {
    if (!plan) return;
    setBusy("buy");
    setMessage(null);
    try {
      const status = await purchasePlan(plan.id);
      if (status?.active) {
        haptics.success();
        account.noteStoreStatus(status);
        setMessage({ tone: "success", text: "Welcome to Plus." });
      }
    } catch (error) {
      haptics.error();
      setMessage({ tone: error instanceof PurchaseError && error.pending ? "info" : "error", text: error instanceof Error ? error.message : "The purchase didn't go through." });
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    setBusy("restore");
    setMessage(null);
    try {
      const status = await restorePurchases();
      account.noteStoreStatus(status);
      setMessage(status.active ? { tone: "success", text: "Plus restored." } : { tone: "info", text: "No Plus subscription found for this Apple Account." });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Restore didn't work. Try again." });
    } finally {
      setBusy(null);
    }
  }

  const site = config.apiUrl ?? "https://cadence.pstepanov.dev";

  return (
    <Screen>
      <TopBar onClose={() => router.back()} closeLabel="Close Plus" />
      <View style={styles.head}>
        <Eyebrow>Cadence Plus</Eyebrow>
        <Title size={type.title1}>{account.plus ? "You have Plus" : "Practise with AI anywhere"}</Title>
      </View>

      <Card>
        {INCLUDED.map((line) => (
          <View key={line} style={styles.included}>
            <Check color={colors.sage} size={18} strokeWidth={3} />
            <Body size={type.callout} style={styles.flex}>
              {line}
            </Body>
          </View>
        ))}
        <Body size={type.caption} tone="muted">
          Daily limits apply in the cloud. Lessons, quizzes, flashcards and the mouth map stay free for everyone.
        </Body>
      </Card>

      {account.plus ? (
        <Card>
          <Body size={type.callout}>{renewalLine(account.store.active ? account.store : (account.me?.plus ?? { expiresAt: null, willRenew: false })) ?? "Plus is active."}</Body>
          <Button label="Manage your account" variant="tonal" onPress={() => router.replace("/account")} />
        </Card>
      ) : (
        <>
          {plansQuery.isLoading ? (
            <LoadingBlock rows={2} label="Loading plans…" />
          ) : (
            <View style={styles.plans} accessibilityRole="radiogroup">
              {plans.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: item.id === selected }}
                  accessibilityLabel={`${item.id === "yearly" ? "Yearly" : "Monthly"}, ${item.priceString} a ${item.id === "yearly" ? "year" : "month"}${item.trialDays ? `, ${item.trialDays}-day free trial` : ""}`}
                  onPress={() => setSelected(item.id)}
                  style={[styles.plan, item.id === selected && styles.planSelected]}>
                  <View style={styles.flex}>
                    <Text maxFontSizeMultiplier={maxScale.control} style={styles.planTitle}>
                      {item.id === "yearly" ? "Yearly" : "Monthly"}
                    </Text>
                    <Text maxFontSizeMultiplier={maxScale.control} style={styles.planDetail}>
                      {item.id === "yearly" && item.trialDays ? `${item.trialDays}-day free trial, then ${item.priceString} a year` : `${item.priceString} a ${item.id === "yearly" ? "year" : "month"}`}
                    </Text>
                  </View>
                  {item.id === "yearly" && savings ? (
                    <View style={styles.save}>
                      <Text style={styles.saveText}>{`Save ${savings}%`}</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </View>
          )}

          {!storeConfigured ? <Banner tone="info" message="Purchases aren't available in this build." /> : null}
          {message ? <Banner tone={message.tone} message={message.text} /> : null}

          <Button
            label={plan?.trialDays ? "Start free trial" : "Subscribe"}
            loading={busy === "buy"}
            disabled={!canBuy || busy !== null}
            onPress={() => void buy()}
          />
        </>
      )}

      <Button label="Restore purchases" variant="outline" loading={busy === "restore"} disabled={!storeConfigured || busy !== null} onPress={() => void restore()} />

      <Body size={type.caption} tone="muted">
        Plus renews automatically until you cancel in your Apple Account settings, at least 24 hours before the period ends. Payment is charged to your Apple Account.
      </Body>
      <View style={styles.links}>
        <TextLink label="Terms" onPress={() => void Linking.openURL(`${site}/terms`)} />
        <TextLink label="Privacy" onPress={() => void Linking.openURL(`${site}/privacy`)} />
      </View>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { gap: spacing.xs },
    included: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    flex: { flex: 1 },
    plans: { gap: spacing.sm },
    plan: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      borderWidth: 2,
      borderColor: "transparent",
      boxShadow: shadows.card,
    },
    planSelected: { borderColor: colors.hunter, backgroundColor: colors.limeSoft },
    planTitle: { fontFamily: fonts.bodyBold, fontSize: type.headline, color: colors.hunter },
    planDetail: { fontFamily: fonts.body, fontSize: type.footnote, color: colors.iron },
    save: { backgroundColor: colors.yellowGreen, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
    saveText: { fontFamily: fonts.bodyBold, fontSize: type.caption, color: colors.ink },
    links: { flexDirection: "row", gap: spacing.lg },
  }),
);
