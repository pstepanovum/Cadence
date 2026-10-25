// Streak, the week and every badge, with progress towards the ones still to
// earn. The stats card at the top can be shared as an image: streak and
// totals only, nothing else about the learner.
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { Award, Flame, Lock, Share2, Snowflake } from "lucide-react-native";
import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

import { Banner, Body, Button, buttonIconColor, Card, EmptyState, Eyebrow, ProgressBar, Screen, Title, TopBar } from "@/components/ui";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { BADGE_GROUP_TITLES, earnedCount, type Badge, type BadgeGroup } from "@/engagement/badges";
import { daysToNextFreeze } from "@/engagement/streak";
import { useBadges, useToday } from "@/engagement/useEngagement";
import { ILLUSTRATIONS } from "@/data/illustrations.generated";
import { colors, fonts, maxScale, overlays, radii, shadows, spacing, type, themed } from "@/theme/theme";

const GROUPS: BadgeGroup[] = ["streak", "lessons", "levels", "flashcards", "practice", "grammar"];

export default function BadgesScreen() {
  const today = useToday();
  const badges = useBadges();
  const card = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earned = earnedCount(badges);
  const nextFreeze = daysToNextFreeze(today.streak);
  const maxMinutes = Math.max(today.goalMinutes, ...today.week.map((d) => d.minutes));

  async function share() {
    setSharing(true);
    setError(null);
    try {
      const uri = await captureRef(card, { format: "png", quality: 1, result: "tmpfile" });
      const file = new File(uri);
      const target = new File(Paths.cache, "cadence-progress.png");
      if (target.exists) target.delete();
      file.copy(target);
      await Sharing.shareAsync(target.uri, { mimeType: "image/png", dialogTitle: "Share your progress", UTI: "public.png" });
    } catch {
      setError("The image couldn't be made. Try again.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Progress" title="Streak and badges" />

      <View ref={card} collapsable={false} style={styles.shareCard}>
        <View style={styles.shareHead}>
          <SvgXml xml={LOGO_GREEN_DARK} width={112} height={28} accessibilityLabel="Cadence" />
          <Text maxFontSizeMultiplier={maxScale.label} style={styles.shareKicker}>
            My progress
          </Text>
        </View>
        <View style={styles.streakRow} accessible accessibilityLabel={`${today.streak.current}-day streak`}>
          <Flame color={colors.hunter} size={28} />
          <Text maxFontSizeMultiplier={maxScale.title} style={styles.streakNumber}>
            {today.streak.current}
          </Text>
          <Text maxFontSizeMultiplier={maxScale.label} style={styles.streakLabel}>
            day streak
          </Text>
        </View>
        <View style={styles.week} accessible accessibilityLabel={`${today.weekMinutes} minutes in the last seven days`}>
          {today.week.map((day) => (
            <View key={day.day} style={styles.weekDay}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${Math.max(day.minutes > 0 ? 8 : 0, (day.minutes / maxMinutes) * 100)}%` }]} />
              </View>
              <Text allowFontScaling={false} style={styles.weekLabel}>
                {new Date(`${day.day}T12:00:00`).toLocaleDateString(undefined, { weekday: "narrow" })}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.shareStats}>
          <ShareStat label="Best streak" value={today.streak.best} />
          <ShareStat label="This week" value={`${today.weekMinutes} min`} />
          <ShareStat label="Badges" value={earned} />
        </View>
      </View>

      {error ? <Banner tone="error" message={error} /> : null}
      <Button label="Share my progress" variant="tonal" loading={sharing} icon={<Share2 color={buttonIconColor("tonal")} size={18} />} onPress={() => void share()} />

      <Card>
        <View style={styles.freezeRow}>
          <Snowflake color={colors.hunter} size={20} />
          <Body size={type.callout} style={styles.flex}>
            {today.streak.freezes > 0
              ? `${today.streak.freezes} streak ${today.streak.freezes === 1 ? "freeze" : "freezes"} saved. A missed day uses one instead of ending your streak.`
              : "Practise 7 days in a row to earn a streak freeze. It covers a day you miss."}
          </Body>
        </View>
        {nextFreeze !== null && today.streak.current > 0 ? (
          <Body size={type.footnote} tone="muted">{`${nextFreeze} more ${nextFreeze === 1 ? "day" : "days"} to the next freeze.`}</Body>
        ) : null}
        <Body size={type.footnote} tone="muted">{`Today: ${today.minutesToday} of ${today.goalMinutes} minutes.`}</Body>
      </Card>

      {earned === 0 ? (
        <EmptyState
          illustration={ILLUSTRATIONS.badges}
          title="No badges yet"
          message="Finish your first lesson to earn one. Short and often is the way."
          actionLabel="Start a lesson"
          onAction={() => router.navigate("/(tabs)/learn")}
        />
      ) : null}

      {GROUPS.map((group) => {
        const items = badges.filter((b) => b.group === group);
        if (items.length === 0) return null;
        return (
          <View key={group} style={styles.group}>
            <Eyebrow>{BADGE_GROUP_TITLES[group]}</Eyebrow>
            <View style={styles.grid}>
              {items.map((badge) => (
                <BadgeTile key={badge.id} badge={badge} />
              ))}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

/** A number on the share card, in fixed brand colours so the image looks the same in light and dark. */
function ShareStat({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.shareStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text maxFontSizeMultiplier={maxScale.title} numberOfLines={1} adjustsFontSizeToFit style={styles.shareValue}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={maxScale.label} numberOfLines={2} style={styles.shareLabel}>
        {label}
      </Text>
    </View>
  );
}

function BadgeTile({ badge }: { badge: Badge }) {
  const progress = Math.round((badge.value / badge.target) * 100);
  return (
    <View
      style={[styles.tile, !badge.earned && styles.tileLocked]}
      accessible
      accessibilityLabel={`${badge.title}. ${badge.earned ? "Earned." : `${badge.detail} ${badge.value} of ${badge.target}.`}`}>
      <View style={[styles.medal, badge.earned ? styles.medalOn : styles.medalOff]}>
        {badge.earned ? <Award color={colors.snow} size={22} strokeWidth={2.5} /> : <Lock color={colors.slate} size={18} />}
      </View>
      <Title size={type.headline} numberOfLines={2}>
        {badge.title}
      </Title>
      <Body size={type.caption} tone="muted" numberOfLines={3}>
        {badge.earned ? (badge.earnedAt ? `Earned ${new Date(badge.earnedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : "Earned") : badge.detail}
      </Body>
      {!badge.earned && badge.target > 1 ? <ProgressBar value={progress} /> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    flex: { flex: 1 },
    shareCard: { borderRadius: radii.cardLarge, backgroundColor: "#386641", padding: spacing.xl, gap: spacing.lg, boxShadow: shadows.card },
    shareHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
    shareKicker: { fontFamily: fonts.kicker, fontSize: type.footnote, color: "#d4e7a6" },
    streakRow: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
    streakNumber: { fontFamily: fonts.bodyBold, fontSize: 48, color: "#f8f9fa", fontVariant: ["tabular-nums"] },
    streakLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.headline, color: "#f8f9fa" },
    week: { flexDirection: "row", gap: spacing.sm, height: 72 },
    weekDay: { flex: 1, alignItems: "center", gap: spacing.xs },
    barTrack: { flex: 1, width: "100%", maxWidth: 22, borderRadius: radii.tile / 2, backgroundColor: "rgba(255,255,255,0.12)", justifyContent: "flex-end", overflow: "hidden" },
    bar: { width: "100%", borderRadius: radii.tile / 2, backgroundColor: "#a7c957" },
    weekLabel: { fontFamily: fonts.bodyMedium, fontSize: type.caption, color: "rgba(248,249,250,0.82)" },
    shareStats: { flexDirection: "row", gap: spacing.sm },
    shareStat: { flex: 1, borderRadius: radii.panel, backgroundColor: "rgba(255,255,255,0.10)", padding: spacing.md, gap: spacing.xxs },
    shareValue: { fontFamily: fonts.bodyBold, fontSize: type.title2, color: "#f8f9fa", fontVariant: ["tabular-nums"] },
    shareLabel: { fontFamily: fonts.body, fontSize: type.caption, color: "rgba(248,249,250,0.82)" },
    freezeRow: { flexDirection: "row", gap: spacing.sm, alignItems: "flex-start" },
    group: { gap: spacing.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    tile: { flexBasis: "47%", flexGrow: 1, borderRadius: radii.card, backgroundColor: colors.snow, padding: spacing.lg, gap: spacing.xs, boxShadow: shadows.card },
    tileLocked: { backgroundColor: overlays.locked },
    medal: { width: 40, height: 40, borderRadius: radii.pill, alignItems: "center", justifyContent: "center" },
    medalOn: { backgroundColor: colors.hunter },
    medalOff: { backgroundColor: colors.platinum },
  }),
);
