// The mouth map: the side view and the front lip view of one sound, animated
// whenever the sound changes, with its active articulators highlighted and a
// legend that names them (tap one to show only that part).
import { useMemo, useState } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { Play } from "lucide-react-native";

import { Body, Chip, RoundIconButton } from "@/components/ui";
import { LAYER_LABELS, OVERLAY_HINTS } from "@/practice/sounds";
import type { ArticulationTarget, LayerId } from "@/platform/vocal-tract";
import { colors, spacing, type, themed } from "@/theme/theme";

import { FrontLipsView } from "./FrontLipsView";
import { DARK_MOUTH, LIGHT_MOUTH, type MouthPalette } from "./palette";
import { goalEnd, useArticulationMotion, type MotionGoal } from "./useArticulationMotion";
import { VocalTractView } from "./VocalTractView";

export function useMouthPalette(): MouthPalette {
  return useColorScheme() === "dark" ? DARK_MOUTH : LIGHT_MOUTH;
}

export function goalFor(target: ArticulationTarget): MotionGoal | null {
  if (target.trajectory && target.trajectory.length > 0) return { trajectory: target.trajectory };
  if (target.params) return { params: target.params };
  return null;
}

/** What a screen reader hears for the drawing. */
export function mouthLabel(target: ArticulationTarget, name: string): string {
  const parts = target.highlight.slice(0, 3).map((id) => LAYER_LABELS[id].toLowerCase());
  const hints = target.overlays.map((id) => OVERLAY_HINTS[id]).slice(0, 2);
  return [`Side view of the mouth for ${name}.`, parts.length ? `Active: ${parts.join(", ")}.` : "", target.voicing === "voiced" ? "Voiced." : "Voiceless.", ...hints]
    .filter(Boolean)
    .join(" ");
}

export function MouthMap({
  target,
  name,
  width,
  showFront = true,
  showLegend = true,
}: {
  target: ArticulationTarget;
  /** How the sound is named aloud, e.g. "TH as in think". */
  name: string;
  width: number;
  showFront?: boolean;
  showLegend?: boolean;
}) {
  const palette = useMouthPalette();
  const goal = useMemo(() => goalFor(target), [target]);
  const [playKey, setPlayKey] = useState(0);
  const params = useArticulationMotion(goal, playKey, target.trajectory ? 1400 : 600);
  const [focus, setFocus] = useState<LayerId | null>(null);
  const highlight = focus ? [focus] : target.highlight;
  const moving = Boolean(target.trajectory);
  const label = mouthLabel(target, name);

  const frontWidth = Math.min(150, width * 0.4);
  const endParams = goal ? goalEnd(goal) : params;

  return (
    <View style={styles.wrap}>
      <View style={[styles.stage, { backgroundColor: palette.background }]}>
        <VocalTractView
          params={params}
          width={width}
          palette={palette}
          highlight={highlight}
          overlays={target.overlays}
          anchor={target.anchor}
          airflow={target.airflow}
          voiced={target.voicing === "voiced"}
          accessibilityLabel={label}
        />
        <View style={styles.play}>
          <RoundIconButton accessibilityLabel={moving ? `Play the movement for ${name}` : `Replay the shape for ${name}`} onPress={() => setPlayKey((n) => n + 1)}>
            <Play color={colors.hunter} size={18} />
          </RoundIconButton>
        </View>
      </View>

      {showFront ? (
        <View style={styles.frontRow}>
          <View style={[styles.front, { backgroundColor: palette.background }]}>
            <FrontLipsView
              params={moving ? params : endParams}
              width={frontWidth}
              palette={palette}
              overlays={target.overlays}
              accessibilityLabel={`Front view of the lips for ${name}.`}
            />
          </View>
          <Body size={type.footnote} tone="muted" style={styles.frontCaption}>
            Lips from the front
          </Body>
        </View>
      ) : null}

      {showLegend ? (
        <View style={styles.legend}>
          {target.highlight.map((id) => (
            <Chip
              key={id}
              label={LAYER_LABELS[id]}
              selected={focus === id}
              accessibilityHint={focus === id ? "Shows every active part again." : "Shows only this part."}
              onPress={() => setFocus((current) => (current === id ? null : id))}
            />
          ))}
        </View>
      ) : null}
      {showLegend && target.overlays.length > 0 ? (
        <View style={styles.hints}>
          {target.overlays.map((id) => (
            <Body key={id} size={type.footnote}>
              {`• ${OVERLAY_HINTS[id]}`}
            </Body>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: {
      gap: spacing.md,
    },
    stage: {
      borderRadius: 20,
      overflow: "hidden",
      alignItems: "center",
    },
    frontRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    front: { borderRadius: 14, overflow: "hidden" },
    frontCaption: { flex: 1 },
    play: {
      position: "absolute",
      right: spacing.sm,
      top: spacing.sm,
    },
    legend: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    hints: {
      gap: spacing.xs,
    },
  }),
);
