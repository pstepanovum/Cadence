// A reminder time: a few common times as chips, and 15-minute steps either
// way for anything else. Large, plain controls that work at any text size
// and with VoiceOver (the readout is an adjustable element).
import { Minus, Plus } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

import { Chip, HorizontalPicker, RoundIconButton } from "@/components/ui";
import { formatTime } from "@/notifications/plan";
import { colors, fonts, maxScale, radii, spacing, type, themed } from "@/theme/theme";

const PRESETS = [7 * 60, 8 * 60, 12 * 60 + 30, 18 * 60, 19 * 60, 20 * 60, 21 * 60];
const STEP = 15;

export function TimePicker({ value, onChange, label = "Reminder time" }: { value: number; onChange: (minute: number) => void; label?: string }) {
  const move = (delta: number) => onChange((((value + delta) % 1440) + 1440) % 1440);
  const shown = formatTime(value);
  return (
    <View style={styles.root}>
      <View style={styles.readoutRow}>
        <RoundIconButton accessibilityLabel="15 minutes earlier" onPress={() => move(-STEP)}>
          <Minus color={colors.hunter} size={20} />
        </RoundIconButton>
        <View
          style={styles.readout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ text: shown }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(event) => move(event.nativeEvent.actionName === "increment" ? STEP : -STEP)}>
          <Text maxFontSizeMultiplier={maxScale.title} style={styles.time}>
            {shown}
          </Text>
        </View>
        <RoundIconButton accessibilityLabel="15 minutes later" onPress={() => move(STEP)}>
          <Plus color={colors.hunter} size={20} />
        </RoundIconButton>
      </View>
      <HorizontalPicker selectedIndex={Math.max(0, PRESETS.indexOf(value))}>
        {PRESETS.map((minute) => (
          <Chip key={minute} label={formatTime(minute)} selected={minute === value} onPress={() => onChange(minute)} />
        ))}
      </HorizontalPicker>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { gap: spacing.md },
    readoutRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
    readout: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radii.panel, backgroundColor: colors.snow },
    time: { fontFamily: fonts.bodyBold, fontSize: type.display, color: colors.hunter, fontVariant: ["tabular-nums"] },
  }),
);
