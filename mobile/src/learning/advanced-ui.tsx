// Pieces the advanced screens share (phrases, slang, the plateau track,
// recordings): list rows, tags, the self-rating row, quiz options and a
// segmented progress line. Greyscale frame; hunter green for what is
// selected or primary; yellow-green only for a correct answer; no outlines.
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body, pressedCard, Title } from "@/components/ui";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, spacing, type, themed } from "@/theme/theme";

export function Tag({ label, tone = "grey" }: { label: string; tone?: "grey" | "green" | "muted" }) {
  return (
    <View style={[styles.tag, tone === "green" && styles.tagGreen, tone === "muted" && styles.tagMuted]}>
      <Text maxFontSizeMultiplier={maxScale.label} style={[styles.tagLabel, tone === "green" && styles.tagLabelGreen]}>
        {label}
      </Text>
    </View>
  );
}

export function ItemRow({ title, detail, tags, onPress, accessibilityHint }: { title: string; detail?: string; tags?: React.ReactNode; onPress: () => void; accessibilityHint?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={accessibilityHint ?? detail} onPress={onPress} style={({ pressed }) => [styles.row, pressedCard(pressed)]}>
      <View style={styles.rowText}>
        <Title size={type.headline}>{title}</Title>
        {detail ? (
          <Body size={type.footnote} tone="muted" numberOfLines={2}>
            {detail}
          </Body>
        ) : null}
        {tags ? <View style={styles.tags}>{tags}</View> : null}
      </View>
      <ChevronRight color={colors.slate} size={20} />
    </Pressable>
  );
}

export type SelfRating = "again" | "close" | "nailed";

export function RateRow({ onRate, disabled }: { onRate: (rating: SelfRating) => void; disabled?: boolean }) {
  const options: { rating: SelfRating; label: string }[] = [
    { rating: "again", label: "Again" },
    { rating: "close", label: "Close" },
    { rating: "nailed", label: "Clean" },
  ];
  return (
    <View style={styles.rateRow} accessibilityRole="radiogroup" accessibilityLabel="How did it sound?">
      {options.map((o) => (
        <Pressable
          key={o.rating}
          accessibilityRole="button"
          accessibilityLabel={o.label}
          disabled={disabled}
          onPress={() => {
            haptics.select();
            onRate(o.rating);
          }}
          style={({ pressed }) => [styles.rate, o.rating === "nailed" && styles.ratePrimary, disabled && styles.disabled, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={maxScale.control} style={[styles.rateLabel, o.rating === "nailed" && styles.rateLabelPrimary]}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Quiz options: grey until answered; then the right one turns yellow-green and a wrong pick is struck through. */
export function QuizOptions({ options, answer, picked, onPick }: { options: string[]; answer: number; picked: number | null; onPick: (index: number) => void }) {
  return (
    <View style={styles.options}>
      {options.map((option, i) => {
        const right = picked !== null && i === answer;
        const wrong = picked !== null && i === picked && i !== answer;
        return (
          <Pressable
            key={`${i}-${option}`}
            accessibilityRole="button"
            accessibilityLabel={option}
            accessibilityState={{ selected: picked === i, disabled: picked !== null }}
            onPress={() => {
              if (picked !== null) return;
              if (i === answer) haptics.success();
              else haptics.warning();
              onPick(i);
            }}
            style={({ pressed }) => [styles.option, right && styles.optionRight, wrong && styles.optionWrong, pressed && picked === null && styles.pressed]}>
            <Text maxFontSizeMultiplier={maxScale.body} style={[styles.optionLabel, right && styles.optionLabelRight, wrong && styles.optionLabelWrong]}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Highlighted({ text, form, size = type.title3 }: { text: string; form: string; size?: number }) {
  const at = text.toLowerCase().indexOf(form.toLowerCase());
  const base = [styles.example, { fontSize: size, lineHeight: Math.round(size * 1.4) }];
  if (at < 0) return <Text style={base}>{text}</Text>;
  return (
    <Text style={base}>
      {text.slice(0, at)}
      <Text style={styles.form}>{text.slice(at, at + form.length)}</Text>
      {text.slice(at + form.length)}
    </Text>
  );
}

export function StepLine({ done, total }: { done: number; total: number }) {
  return (
    <View style={styles.line} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: done }}>
      <View style={[styles.lineFill, { width: `${total ? Math.min(100, (done / total) * 100) : 0}%` }]} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tag: { borderRadius: 8, backgroundColor: colors.platinum, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    tagGreen: { backgroundColor: colors.hunter },
    tagMuted: { backgroundColor: colors.alabaster },
    tagLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.caption, color: colors.iron },
    tagLabelGreen: { color: colors.snow },
    row: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radii.card, backgroundColor: colors.snow, padding: spacing.lg },
    rowText: { flex: 1, gap: spacing.xs },
    tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: 2 },
    rateRow: { flexDirection: "row", gap: spacing.sm },
    rate: { flex: 1, minHeight: 48, borderRadius: radii.control, backgroundColor: colors.platinum, alignItems: "center", justifyContent: "center" },
    ratePrimary: { backgroundColor: colors.hunter },
    rateLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.body, color: colors.carbon },
    rateLabelPrimary: { color: colors.snow },
    options: { gap: spacing.sm },
    option: { minHeight: 52, borderRadius: radii.control, backgroundColor: colors.platinum, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, justifyContent: "center" },
    optionRight: { backgroundColor: colors.yellowGreen },
    optionWrong: { backgroundColor: colors.alabaster },
    optionLabel: { fontFamily: fonts.body, fontSize: type.body, color: colors.carbon, lineHeight: 21 },
    optionLabelRight: { color: colors.ink, fontFamily: fonts.bodySemiBold },
    optionLabelWrong: { color: colors.slate, textDecorationLine: "line-through" },
    line: { height: 6, borderRadius: 3, backgroundColor: colors.platinum, overflow: "hidden" },
    lineFill: { height: 6, borderRadius: 3, backgroundColor: colors.hunter },
    example: { fontFamily: fonts.body, color: colors.carbon },
    form: { fontFamily: fonts.bodySemiBold, color: colors.hunter },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.8 },
  }),
);
