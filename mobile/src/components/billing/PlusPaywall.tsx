// Cadence Plus in the iOS app: the hero, three short benefits, the monthly and
// yearly packages of RevenueCat's default offering at the store's localized
// prices (yearly chosen first, its free trial named only when this Apple
// Account is eligible), Restore Purchases, the renewal terms and the Terms
// and Privacy links. "Not now" always continues free.
//
// Never shown in own-server mode (the caller checks). No urgency, no web
// prices, no other ways to pay. When the store cannot be reached it says so
// calmly and lets the person carry on.
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import { PaywallHero } from "@/components/billing/PaywallHero";
import { Banner, Body, Button, Card, LoadingBlock, TextLink } from "@/components/ui";
import { useAccount } from "@/context/account";
import { renewalLine, yearlySavingsPercent, type PlusPlan, type PlusPlanId } from "@/lib/billing/plans";
import { loadPlans, PurchaseError, purchasePlan, purchasesStubbed, restorePurchases, storeConfigured } from "@/lib/billing/purchases";
import { config } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, shadows, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const BENEFITS = [
  "Pronunciation scoring, the coach and transcription anywhere, not only at home",
  "Your full progress synced across your devices",
  "Every sound and grammar point tracked over time",
];

/** Apple's standard licence agreement serves as the Terms of Use. */
const TERMS_URL = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const planName = (id: PlusPlanId) => (id === "yearly" ? "Yearly" : "Monthly");
const period = (id: PlusPlanId) => (id === "yearly" ? "year" : "month");

function planDetail(plan: PlusPlan): string {
  return plan.trialDays > 0 ? `${plan.trialDays}-day free trial, then ${plan.priceString} a ${period(plan.id)}` : `${plan.priceString} a ${period(plan.id)}`;
}

export function PlusPaywall({ onDone, doneLabel = "Not now" }: { onDone: () => void; doneLabel?: string }) {
  const account = useAccount();
  const enabled = storeConfigured && account.signedIn;
  const plansQuery = useQuery({ queryKey: ["plus-plans", account.signedIn], queryFn: loadPlans, enabled, staleTime: 5 * 60_000, retry: 1 });
  const plans = plansQuery.data ?? [];
  const [selected, setSelected] = useState<PlusPlanId>("yearly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);

  const plan = plans.find((p) => p.id === selected) ?? plans[0];
  const savings = yearlySavingsPercent(plans.find((p) => p.id === "monthly")?.price, plans.find((p) => p.id === "yearly")?.price);

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
      const pending = error instanceof PurchaseError && error.pending;
      if (!pending) haptics.error();
      setMessage({ tone: pending ? "info" : "error", text: error instanceof Error ? error.message : "The purchase didn't go through. You weren't charged." });
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
  const unavailable = !storeConfigured
    ? "Purchases aren't available in this build. Everything else works as usual."
    : !account.signedIn
      ? "Sign in to your Cadence account to see Plus."
      : plansQuery.isError || (plansQuery.isSuccess && plans.length === 0)
        ? "Plans can't load right now. You can keep practising for free and look again later in Settings."
        : null;

  return (
    <View style={styles.root}>
      <PaywallHero
        title={account.plus ? "You have Plus" : "Practise with AI anywhere"}
        subtitle={account.plus ? (renewalLine(account.store.active ? account.store : (account.me?.plus ?? { expiresAt: null, willRenew: false })) ?? undefined) : "Lessons, quizzes, flashcards and the mouth map stay free for everyone."}
      />

      {account.plus ? null : (
        <Card>
          {BENEFITS.map((line) => (
            <View key={line} style={styles.benefit}>
              <Check color={colors.sage} size={18} strokeWidth={3} />
              <Body size={type.callout} style={styles.flex}>
                {line}
              </Body>
            </View>
          ))}
          <Body size={type.caption} tone="muted">
            Fair daily limits apply to cloud AI.
          </Body>
        </Card>
      )}

      {account.plus ? null : unavailable ? (
        <Banner tone="info" message={unavailable} actionLabel={plansQuery.isError ? "Try again" : undefined} onAction={plansQuery.isError ? () => void plansQuery.refetch() : undefined} />
      ) : plansQuery.isLoading ? (
        <LoadingBlock rows={2} label="Loading plans…" />
      ) : (
        <View style={styles.plans} accessibilityRole="radiogroup" accessibilityLabel="Plans">
          {purchasesStubbed ? (
            <Body size={type.caption} tone="muted">
              Test build: sample prices, nothing is charged.
            </Body>
          ) : null}
          {plans.map((item) => {
            const chosen = item.id === plan?.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: chosen, selected: chosen }}
                accessibilityLabel={`${planName(item.id)}, ${planDetail(item)}`}
                onPress={() => {
                  if (!chosen) haptics.select();
                  setSelected(item.id);
                }}
                style={[styles.plan, chosen && styles.planChosen]}>
                <View style={[styles.radio, chosen && styles.radioOn]}>{chosen ? <Check color={colors.snow} size={14} strokeWidth={3} /> : null}</View>
                <View style={styles.flex}>
                  <Text maxFontSizeMultiplier={maxScale.control} style={styles.planTitle}>
                    {planName(item.id)}
                  </Text>
                  <Text maxFontSizeMultiplier={maxScale.control} style={styles.planDetail}>
                    {planDetail(item)}
                  </Text>
                </View>
                {item.id === "yearly" && savings ? (
                  <View style={styles.save}>
                    <Text maxFontSizeMultiplier={maxScale.label} style={styles.saveText}>{`Save ${savings}%`}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {message ? <Banner tone={message.tone} message={message.text} /> : null}

      {account.plus ? (
        <Button label="Continue" onPress={onDone} />
      ) : (
        <>
          {plan && !unavailable ? (
            <Button label={plan.trialDays > 0 ? "Start free trial" : "Subscribe"} loading={busy === "buy"} disabled={busy !== null} onPress={() => void buy()} />
          ) : null}
          <Button label={doneLabel} variant="neutral" disabled={busy === "buy"} onPress={onDone} />
        </>
      )}

      <View style={styles.footer}>
        <TextLink label="Restore purchases" onPress={() => (busy === null ? void restore() : undefined)} />
        {plan && !unavailable && !account.plus ? (
          <Body size={type.caption} tone="muted" style={styles.center}>
            {plan.trialDays > 0
              ? `After the free trial, Plus renews at ${plan.priceString} a ${period(plan.id)} until you cancel. Cancel at least 24 hours before the trial ends and you won't be charged.`
              : `Plus renews at ${plan.priceString} a ${period(plan.id)} until you cancel.`}{" "}
            Payment is charged to your Apple Account. Manage or cancel in your Apple Account settings.
          </Body>
        ) : null}
        <View style={styles.links}>
          <TextLink label="Terms of Use" onPress={() => void Linking.openURL(TERMS_URL)} />
          <TextLink label="Privacy Policy" onPress={() => void Linking.openURL(`${site}/privacy`)} />
        </View>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { gap: spacing.lg },
    benefit: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    flex: { flex: 1 },
    center: { textAlign: "center" },
    plans: { gap: spacing.sm },
    plan: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: TAP_TARGET + 16,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.lg,
      boxShadow: shadows.card,
    },
    planChosen: { backgroundColor: colors.limeSoft },
    radio: { width: 24, height: 24, borderRadius: radii.pill, borderWidth: 2, borderColor: colors.paleSlate, alignItems: "center", justifyContent: "center" },
    radioOn: { backgroundColor: colors.hunter, borderColor: colors.hunter },
    planTitle: { fontFamily: fonts.bodyBold, fontSize: type.headline, color: colors.carbon },
    planDetail: { fontFamily: fonts.body, fontSize: type.footnote, color: colors.iron },
    save: { backgroundColor: colors.yellowGreen, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
    saveText: { fontFamily: fonts.bodyBold, fontSize: type.caption, color: colors.ink },
    footer: { alignItems: "center", gap: spacing.sm },
    links: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: spacing.lg },
  }),
);
