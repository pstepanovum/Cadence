// The sounds library: every English sound with its mouth map, the learner's
// "sounds to fix" from their pronunciation scores, and minimal-pair compares.
// Free for everyone: it is static content.
import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Body, Chip, EmptyState, Eyebrow, HorizontalPicker, pressedCard, Screen, TopBar } from "@/components/ui";
import { ARTICULATION_SOURCE, ipaFor, soundById, soundsFor } from "@/content/articulation";
import { FEATURED_COMPARISONS } from "@/data/pair-sounds";
import { useAccent } from "@/hooks/useAccent";
import { today, useLearning } from "@/learning/store";
import { soundsToFix } from "@/practice/sound-coach";
import type { SoundInfo } from "@/platform/vocal-tract";
import { colors, fonts, maxScale, radii, shadows, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const GROUPS: { kind: SoundInfo["kind"]; title: string }[] = [
  { kind: "consonant", title: "Consonants" },
  { kind: "vowel", title: "Vowels" },
  { kind: "diphthong", title: "Diphthongs" },
];

export default function SoundsLibrary() {
  const [accent, setAccent] = useAccent();
  const { state } = useLearning();
  const sounds = soundsFor(accent);
  const toFix = useMemo(() => soundsToFix(state.sounds, today(), { limit: 6 }), [state.sounds]);

  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Sounds" title="Sounds and the mouth map" />

      <View style={styles.accentRow}>
        <Chip label="American" selected={accent === "GA"} onPress={() => setAccent("GA")} accessibilityHint="Shows General American sounds." />
        <Chip label="British" selected={accent === "RP"} onPress={() => setAccent("RP")} accessibilityHint="Shows Received Pronunciation sounds." />
      </View>

      <View style={styles.section}>
        <Eyebrow>Sounds to fix</Eyebrow>
        {toFix.length === 0 ? (
          <EmptyState compact title="Nothing to fix yet" message="Record a few words and the sounds you miss most show up here, most useful first." actionLabel="Practise a word" onAction={() => router.push("/(tabs)")} />
        ) : (
          <HorizontalPicker selectedIndex={0}>
            {toFix.map((item) => {
              const sound = soundById(item.soundId);
              if (!sound) return null;
              return (
                <Pressable
                  key={item.soundId}
                  accessibilityRole="button"
                  accessibilityLabel={`${ipaFor(sound, accent)} as in ${sound.example}. ${item.reason === "review" ? "Review due." : `Scoring ${Math.round(item.mastery.ema)}.`}`}
                  onPress={() => router.push({ pathname: "/sounds/[soundId]", params: { soundId: item.soundId } })}
                  style={({ pressed }) => [styles.fix, pressedCard(pressed)]}>
                  <Text maxFontSizeMultiplier={maxScale.title} style={styles.fixIpa}>{`/${ipaFor(sound, accent)}/`}</Text>
                  <Body size={type.caption} tone="muted">
                    {item.reason === "review" ? "Review" : `${Math.round(item.mastery.ema)}`}
                  </Body>
                </Pressable>
              );
            })}
          </HorizontalPicker>
        )}
      </View>

      <View style={styles.section}>
        <Eyebrow>Compare</Eyebrow>
        <View style={styles.pairs}>
          {FEATURED_COMPARISONS.map((pair) => (
            <Chip key={pair.words.join("-")} label={`${pair.words[0]} / ${pair.words[1]}`} onPress={() => router.push({ pathname: "/sounds/compare", params: { a: pair.soundIds[0], b: pair.soundIds[1], words: pair.words.join(",") } })} accessibilityHint="Shows both mouth shapes side by side." />
          ))}
        </View>
      </View>

      {GROUPS.map((group) => (
        <View key={group.kind} style={styles.section}>
          <Eyebrow>{group.title}</Eyebrow>
          <View style={styles.grid}>
            {sounds
              .filter((sound) => sound.kind === group.kind)
              .map((sound) => (
                <Pressable
                  key={sound.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${ipaFor(sound, accent)}, as in ${sound.example}`}
                  onPress={() => router.push({ pathname: "/sounds/[soundId]", params: { soundId: sound.id } })}
                  style={({ pressed }) => [styles.tile, pressedCard(pressed)]}>
                  <Text maxFontSizeMultiplier={maxScale.title} style={styles.ipa}>
                    {ipaFor(sound, accent)}
                  </Text>
                  <Text maxFontSizeMultiplier={maxScale.label} style={styles.example} numberOfLines={1}>
                    {sound.example}
                  </Text>
                </Pressable>
              ))}
          </View>
        </View>
      ))}

      {ARTICULATION_SOURCE === "fixture" ? (
        <Body size={type.caption} tone="muted">
          Mouth shapes are a first draft for some sounds and are being refined.
        </Body>
      ) : null}
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    accentRow: { flexDirection: "row", gap: spacing.sm },
    section: { gap: spacing.sm },
    pairs: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
    tile: {
      width: 76,
      minHeight: TAP_TARGET + 28,
      borderRadius: radii.tile,
      backgroundColor: colors.snow,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.sm,
      boxShadow: shadows.card,
    },
    ipa: { fontFamily: fonts.bodyBold, fontSize: type.title3, color: colors.hunter },
    example: { fontFamily: fonts.body, fontSize: type.caption, color: colors.slate },
    fix: { minWidth: 72, borderRadius: radii.tile, backgroundColor: colors.brickSoft, alignItems: "center", padding: spacing.md, gap: spacing.xxs },
    fixIpa: { fontFamily: fonts.bodyBold, fontSize: type.title3, color: colors.brickText },
  }),
);
