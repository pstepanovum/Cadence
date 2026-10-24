import { Check, ChevronDown } from "lucide-react-native";
import { useState, type Ref } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { haptics } from "@/lib/haptics";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

/** The visible label above a field or a group of options. */
function FieldLabel({ children }: { children: string }) {
  return (
    <Text maxFontSizeMultiplier={maxScale.label} style={styles.fieldLabel}>
      {children}
    </Text>
  );
}

export function TextField({
  label,
  ref,
  ...props
}: TextInputProps & { label?: string; ref?: Ref<TextInput> }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.slate}
        accessibilityLabel={label ?? props.placeholder}
        maxFontSizeMultiplier={maxScale.control}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[styles.input, focused && styles.inputFocused, props.style]}
      />
    </View>
  );
}

/** A set of mutually exclusive options that wraps onto as many lines as it needs. */
export function OptionRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label?: string;
}) {
  return (
    <View style={styles.field} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      <View style={styles.optionRow}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected, checked: selected }}
              onPress={() => {
                if (!selected) haptics.select();
                onChange(option.value);
              }}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}>
              {selected ? <Check color={colors.lime} size={16} strokeWidth={3} /> : null}
              <Text
                maxFontSizeMultiplier={maxScale.control}
                style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A show/hide section — the "Advanced breakdown" pattern from the web app. */
export function Collapsible({
  title,
  children,
  initiallyOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <View style={styles.collapsible}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.select();
          setOpen((value) => !value);
        }}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.optionPressed]}>
        <Text maxFontSizeMultiplier={maxScale.control} style={styles.collapsibleTitle}>
          {title}
        </Text>
        <View style={open ? styles.chevronOpen : undefined}>
          <ChevronDown color={colors.hunter} size={18} />
        </View>
      </Pressable>
      {open ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    field: {
      gap: spacing.sm,
    },
    fieldLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.callout,
      lineHeight: 20,
      color: colors.carbon,
    },
    input: {
      minHeight: 52,
      borderRadius: radii.control,
      backgroundColor: colors.white,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      fontFamily: fonts.body,
      fontSize: 16,
      color: colors.carbon,
      borderWidth: 1.5,
      borderColor: colors.alabaster,
    },
    inputFocused: {
      borderColor: colors.hunter,
    },
    optionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.xs,
      borderRadius: radii.tile,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.alabaster,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minHeight: TAP_TARGET,
    },
    optionSelected: {
      backgroundColor: colors.hunter,
      borderColor: colors.hunter,
    },
    optionPressed: {
      opacity: 0.75,
    },
    optionLabel: {
      fontFamily: fonts.bodySemiBold,
      fontSize: type.callout,
      color: colors.iron,
    },
    optionLabelSelected: {
      color: colors.snow,
    },
    collapsible: {
      borderRadius: radii.panel,
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.platinum,
      paddingHorizontal: spacing.lg,
    },
    collapsibleHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: spacing.sm,
      minHeight: 48,
    },
    collapsibleTitle: {
      flex: 1,
      fontFamily: fonts.bodySemiBold,
      fontSize: type.callout,
      color: colors.hunter,
    },
    chevronOpen: {
      transform: [{ rotate: "180deg" }],
    },
    collapsibleBody: {
      gap: spacing.sm,
      paddingBottom: spacing.lg,
    },
  }),
);
