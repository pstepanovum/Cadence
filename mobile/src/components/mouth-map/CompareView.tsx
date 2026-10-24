// The compare view for a minimal pair: both shapes side by side, then both
// tongues in one drawing (the second dashed), and what to change in words.
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { Body, Eyebrow, InfoPanel } from "@/components/ui";
import { compareTargets } from "@/practice/sounds";
import type { ArticulationTarget } from "@/platform/vocal-tract";
import { spacing, type, themed } from "@/theme/theme";

import { FrontLipsView } from "./FrontLipsView";
import { goalFor, mouthLabel, useMouthPalette } from "./MouthMap";
import { goalEnd, useArticulationMotion } from "./useArticulationMotion";
import { VocalTractView } from "./VocalTractView";

function Side({ target, name, width }: { target: ArticulationTarget; name: string; width: number }) {
  const palette = useMouthPalette();
  const goal = useMemo(() => goalFor(target), [target]);
  const params = useArticulationMotion(goal, 0, 600);
  return (
    <View style={[styles.side, { width }]}>
      <View style={[styles.stage, { backgroundColor: palette.background }]}>
        <VocalTractView
          params={params}
          width={width}
          palette={palette}
          highlight={target.highlight.slice(0, 2)}
          overlays={target.overlays}
          anchor={target.anchor}
          voiced={target.voicing === "voiced"}
          accessibilityLabel={mouthLabel(target, name)}
        />
      </View>
      <FrontLipsView params={params} width={width} palette={palette} overlays={target.overlays} accessibilityLabel={`Front view of the lips for ${name}.`} />
      <Body size={type.callout} weight="semibold" style={styles.name}>
        {name}
      </Body>
    </View>
  );
}

export function CompareView({
  first,
  second,
  names,
  width,
}: {
  first: ArticulationTarget;
  second: ArticulationTarget;
  names: [string, string];
  width: number;
}) {
  const palette = useMouthPalette();
  const half = Math.floor((width - spacing.md) / 2);
  const firstGoal = useMemo(() => goalFor(first), [first]);
  const secondGoal = useMemo(() => goalFor(second), [second]);
  const lines = compareTargets(first, second, names);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Side target={first} name={names[0]} width={half} />
        <Side target={second} name={names[1]} width={half} />
      </View>
      <View style={[styles.stage, { backgroundColor: palette.background }]}>
        <VocalTractView
          params={firstGoal ? goalEnd(firstGoal) : first.params!}
          ghost={secondGoal ? goalEnd(secondGoal) : null}
          width={width}
          palette={palette}
          highlight={[]}
          accessibilityLabel={`Both shapes in one drawing: ${names[0]} solid, ${names[1]} dashed.`}
        />
      </View>
      <Body size={type.caption} tone="muted">
        {`${names[0]} solid, ${names[1]} dashed.`}
      </Body>
      {lines.length > 0 ? (
        <InfoPanel>
          <Eyebrow>What changes</Eyebrow>
          {lines.map((line) => (
            <Body key={line} size={type.footnote}>
              {line}
            </Body>
          ))}
        </InfoPanel>
      ) : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    row: { flexDirection: "row", gap: spacing.md },
    side: { gap: spacing.sm },
    stage: { borderRadius: 16, overflow: "hidden", alignItems: "center" },
    name: { textAlign: "center" },
  }),
);
