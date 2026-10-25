// FILE: mobile/src/components/auth/layout.tsx
//
// The frame for screens that must fit on one screen without scrolling: the
// auth screens and each onboarding step. Content is laid out on the neutral
// page (no card around it), moves up out of the keyboard's way, and scrolls
// only when it genuinely does not fit, which happens at the largest
// accessibility text sizes, never at the default size on an iPhone SE.
import { useEffect, useState, type ReactNode } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, spacing, themed } from "@/theme/theme";

/** True while the software keyboard is up (from the moment it starts to rise). */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hide = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subscriptions = [Keyboard.addListener(show, () => setVisible(true)), Keyboard.addListener(hide, () => setVisible(false))];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);
  return visible;
}

/**
 * Short phones (an iPhone SE is 667 pt tall) get the compact spacing and
 * slightly smaller headings, so every step fits there as well.
 */
export function useCompactHeight(): boolean {
  const { height } = useWindowDimensions();
  return height < 740;
}

/**
 * A scroll view that only scrolls when its content is taller than the room it
 * has. At default text sizes it is a plain column that can centre or spread
 * its children; at accessibility sizes, or above the keyboard, it scrolls.
 */
export function FitScrollView({
  children,
  contentStyle,
  style,
}: {
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  const [frame, setFrame] = useState(0);
  const [content, setContent] = useState(0);
  const overflows = frame > 0 && content > frame + 1;
  return (
    <ScrollView
      style={[styles.fill, style]}
      contentContainerStyle={[styles.grow, contentStyle]}
      scrollEnabled={overflows}
      showsVerticalScrollIndicator={overflows}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets={false}
      bounces={overflows}
      onLayout={(event) => setFrame(event.nativeEvent.layout.height)}
      onContentSizeChange={(_, height) => setContent(height)}>
      {children}
    </ScrollView>
  );
}

/**
 * The whole frame: safe areas, the keyboard, a fitting body and a footer
 * pinned to the bottom (the primary action on onboarding, the "switch
 * screen" line on sign-in).
 */
export function FitScreen({
  header,
  children,
  footer,
  bodyStyle,
  bodyKey,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  bodyStyle?: StyleProp<ViewStyle>;
  /** A new key starts the body afresh (at the top, re-measured), as each setup step does. */
  bodyKey?: string;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardVisible();
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.column}>
          {header ? <View style={styles.header}>{header}</View> : null}
          <FitScrollView key={bodyKey} contentStyle={[styles.body, bodyStyle]}>
            {children}
          </FitScrollView>
          {footer ? (
            <View style={[styles.footer, { paddingBottom: (keyboard ? 0 : insets.bottom) + spacing.lg }]}>{footer}</View>
          ) : (
            <View style={{ height: (keyboard ? 0 : insets.bottom) + spacing.sm }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.cream },
    fill: { flex: 1 },
    grow: { flexGrow: 1 },
    column: { flex: 1, width: "100%", maxWidth: 520, alignSelf: "center" },
    header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
    body: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
    footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.xs },
  }),
);
