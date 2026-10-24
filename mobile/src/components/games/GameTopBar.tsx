import { X } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Eyebrow, RoundIconButton, Title } from "@/components/ui";
import { colors, spacing } from "@/theme/theme";

/** Close button, kicker and title: the top of every game screen. */
export function GameTopBar({
  eyebrow,
  title,
  onClose,
  trailing,
}: {
  eyebrow: string;
  title: string;
  onClose: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.bar}>
      <RoundIconButton accessibilityLabel="Leave this game" onPress={onClose}>
        <X color={colors.hunter} size={20} />
      </RoundIconButton>
      <View style={styles.text}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <Title size={20} numberOfLines={1}>
          {title}
        </Title>
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
