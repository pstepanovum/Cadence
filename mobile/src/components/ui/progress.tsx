import { useEffect, useState } from "react";
import { Animated, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, fonts, maxScale, overlays, radii, scoreColor, spacing, type, themed } from "@/theme/theme";

export function ProgressBar({
  value,
  onDark = false,
  style,
}: {
  value: number;
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const [trackWidth, setTrackWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(clamped));

  // Slide to the new value instead of jumping. The fill is translated rather
  // than resized, so the animation runs on the native thread.
  useEffect(() => {
    Animated.timing(progress, { toValue: clamped, duration: 450, useNativeDriver: true }).start();
  }, [clamped, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 100],
    outputRange: [-trackWidth, 0],
  });

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={[
        styles.progressTrack,
        { backgroundColor: onDark ? overlays.whiteOnGreenStrong : colors.alabaster },
        style,
      ]}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            backgroundColor: onDark ? colors.yellowGreen : colors.sage,
            opacity: trackWidth ? 1 : 0,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
}

/**
 * One segment per word or turn, so the learner can see how much of the round
 * is behind them at a glance.
 */
export function SegmentedProgress({
  total,
  currentIndex,
  onDark = false,
}: {
  total: number;
  /** Index of the item being worked on right now. */
  currentIndex: number;
  onDark?: boolean;
}) {
  return (
    <View
      style={styles.segments}
      accessibilityRole="progressbar"
      accessibilityLabel={`Item ${Math.min(currentIndex + 1, total)} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[
            styles.segment,
            {
              backgroundColor:
                index < currentIndex
                  ? colors.yellowGreen
                  : index === currentIndex
                    ? colors.hunter
                    : onDark
                      ? overlays.whiteOnGreenStrong
                      : colors.alabaster,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function ProgressRing({
  score,
  size = 72,
  strokeWidth = 6,
  label,
  onDark = false,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  onDark?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clamped / 100);
  const text = label ?? String(Math.round(clamped));
  const fontSize = size * (text.length >= 4 ? 0.2 : 0.26);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={onDark ? "rgba(255,255,255,0.18)" : colors.alabaster}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={scoreColor(clamped)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          fill="none"
        />
      </Svg>
      <Text
        // The ring cannot grow, so neither can the number inside it.
        allowFontScaling={false}
        style={[styles.ringText, { fontSize, color: onDark ? colors.snow : colors.hunter }]}>
        {text}
      </Text>
    </View>
  );
}

/** Label-over-value tile — the unit of a stats row. */
export function StatTile({
  label,
  value,
  tone = "cream",
  style,
}: {
  label: string;
  value: string;
  tone?: "cream" | "white" | "translucent";
  style?: StyleProp<ViewStyle>;
}) {
  const onDark = tone === "translucent";
  const background =
    tone === "white" ? colors.white : onDark ? overlays.whiteOnGreen : colors.cream;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.statTile, { backgroundColor: background }, style]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={maxScale.title}
        style={[styles.statValue, { color: onDark ? colors.snow : colors.hunter }]}>
        {value}
      </Text>
      <Text
        numberOfLines={2}
        maxFontSizeMultiplier={maxScale.label}
        style={[styles.statLabel, { color: onDark ? colors.onDarkMuted : colors.iron }]}>
        {label}
      </Text>
    </View>
  );
}

/** Two to four stat tiles across. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

const styles = themed(() =>
  StyleSheet.create({
    progressTrack: {
      height: 8,
      borderRadius: radii.pill,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      width: "100%",
      borderRadius: radii.pill,
    },
    segments: {
      flexDirection: "row",
      gap: spacing.xs,
    },
    segment: {
      flex: 1,
      height: 6,
      borderRadius: radii.pill,
    },
    ringText: {
      position: "absolute",
      fontFamily: fonts.bodyBold,
    },
    statRow: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    statTile: {
      flex: 1,
      borderRadius: radii.panel,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.xxs,
    },
    statValue: {
      fontFamily: fonts.bodyBold,
      fontSize: type.title2,
      lineHeight: 28,
    },
    statLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: type.caption,
      lineHeight: 16,
      textAlign: "center",
    },
  }),
);
