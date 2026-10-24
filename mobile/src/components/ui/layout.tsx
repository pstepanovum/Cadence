import { ChevronLeft, X } from "lucide-react-native";
import { Children, useRef } from "react";
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { RoundIconButton } from "@/components/ui/buttons";
import { Eyebrow, Title } from "@/components/ui/text";
import { colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

/** Keeps content to a readable column on wide screens. */
const MAX_CONTENT_WIDTH = 640;

function refreshControl(refreshing?: boolean, onRefresh?: () => void) {
  if (!onRefresh) return undefined;
  return (
    <RefreshControl
      refreshing={refreshing ?? false}
      onRefresh={onRefresh}
      tintColor={colors.hunter}
      colors={[colors.hunter]}
    />
  );
}

/** The bottom padding a screen needs: the home indicator, unless a tab bar already clears it. */
function useBottomInset(tab: boolean) {
  const insets = useSafeAreaInsets();
  return tab ? 0 : insets.bottom;
}

/**
 * Every screen's frame: cream background, safe areas, a scroll view that
 * moves out of the keyboard's way, and optional pull-to-refresh.
 *
 * Pass `tab` on screens inside the tab bar, which already clears the home
 * indicator. Everything else gets the bottom inset so its last button is
 * never under it.
 */
export function Screen({
  children,
  scroll = true,
  tab = false,
  contentStyle,
  refreshing,
  onRefresh,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  tab?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pass both to enable pull-to-refresh. */
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const bottom = useBottomInset(tab);

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: bottom + spacing.xxl },
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl(refreshing, onRefresh)}>
          {children}
        </ScrollView>
      ) : (
        <View
          style={[styles.content, styles.fill, { paddingBottom: bottom + spacing.lg }, contentStyle]}>
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

/**
 * `Screen` for long lists: the same frame around a FlatList, so only the rows
 * on screen are rendered. Content that scrolls with the list goes in
 * `ListHeaderComponent`; `fixedHeader` stays put above it.
 */
export function ScreenList<T>({
  tab = false,
  refreshing,
  onRefresh,
  listRef,
  fixedHeader,
  ...props
}: Omit<FlatListProps<T>, "contentContainerStyle" | "refreshControl"> & {
  tab?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  listRef?: React.Ref<FlatList<T>>;
  fixedHeader?: React.ReactNode;
}) {
  const bottom = useBottomInset(tab);
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {fixedHeader ? <View style={[styles.content, styles.fixedHeader]}>{fixedHeader}</View> : null}
      <FlatList
        ref={listRef}
        contentContainerStyle={[styles.content, { paddingBottom: bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(refreshing, onRefresh)}
        {...props}
      />
    </SafeAreaView>
  );
}

/**
 * The top of a pushed screen (`onBack`) or a task the learner can leave
 * (`onClose`). The control is always on the left, the same size, in the same
 * place, so leaving anything works the same way.
 */
export function TopBar({
  eyebrow,
  title,
  onBack,
  onClose,
  backLabel = "Back",
  closeLabel = "Close",
  trailing,
}: {
  eyebrow?: string;
  title?: string;
  onBack?: () => void;
  onClose?: () => void;
  backLabel?: string;
  closeLabel?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.topBar}>
      {onBack ? (
        <RoundIconButton accessibilityLabel={backLabel} onPress={onBack}>
          <ChevronLeft color={colors.hunter} size={22} />
        </RoundIconButton>
      ) : onClose ? (
        <RoundIconButton accessibilityLabel={closeLabel} onPress={onClose}>
          <X color={colors.hunter} size={20} />
        </RoundIconButton>
      ) : null}
      {eyebrow || title ? (
        <View style={styles.topBarText}>
          {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          {title ? (
            <Title size={type.title3} numberOfLines={2}>
              {title}
            </Title>
          ) : null}
        </View>
      ) : (
        <View style={styles.fill} />
      )}
      {trailing}
    </View>
  );
}

export function Card({
  children,
  variant = "light",
  style,
}: {
  children: React.ReactNode;
  variant?: "light" | "dark" | "cream";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.card,
        variant === "dark" && styles.cardDark,
        variant === "cream" && styles.cardCream,
        style,
      ]}>
      {children}
    </View>
  );
}

/** A soft panel nested inside a card. */
export function InfoPanel({
  children,
  tone = "cream",
  style,
}: {
  children: React.ReactNode;
  tone?: "cream" | "white" | "translucent";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.infoPanel,
        tone === "white" && styles.infoPanelWhite,
        tone === "translucent" && styles.infoPanelTranslucent,
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * A sideways row of chips that runs to the edges of its container (pass the
 * container's horizontal padding as `bleed`) and keeps the selected chip in
 * view, so a choice made off-screen is never hidden.
 */
export function HorizontalPicker({
  children,
  selectedIndex,
  bleed = spacing.lg,
}: {
  children: React.ReactNode;
  selectedIndex: number;
  bleed?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const positions = useRef<Record<number, { x: number; width: number }>>({});
  const viewWidth = useRef(0);
  const revealed = useRef<number | null>(null);

  function reveal(index: number) {
    const item = positions.current[index];
    if (!item || !viewWidth.current || revealed.current === index) return;
    revealed.current = index;
    const x = Math.max(0, item.x + item.width / 2 - viewWidth.current / 2);
    scrollRef.current?.scrollTo({ x, animated: false });
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -bleed }}
      contentContainerStyle={[styles.picker, { paddingHorizontal: bleed }]}
      onLayout={(event) => {
        viewWidth.current = event.nativeEvent.layout.width;
        reveal(selectedIndex);
      }}>
      {Children.toArray(children).map((child, index) => (
        <View
          key={index}
          onLayout={(event) => {
            positions.current[index] = event.nativeEvent.layout;
            if (index === selectedIndex) reveal(index);
          }}>
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * The pressed look for a whole card wrapped in a Pressable: a slight shrink
 * and fade. Shared so every tappable list card in the app reacts the same way.
 */
export function pressedCard(pressed: boolean): StyleProp<ViewStyle> {
  return pressed ? styles.cardPressed : undefined;
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.cream,
    },
    content: {
      width: "100%",
      maxWidth: MAX_CONTENT_WIDTH,
      alignSelf: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      gap: spacing.lg,
    },
    fill: {
      flex: 1,
    },
    picker: {
      gap: spacing.sm,
      paddingVertical: spacing.xxs,
    },
    fixedHeader: {
      paddingBottom: spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 48,
    },
    topBarText: {
      flex: 1,
      gap: spacing.xxs,
    },
    card: {
      borderRadius: radii.card,
      backgroundColor: colors.snow,
      padding: spacing.xl,
      gap: spacing.md,
      boxShadow: shadows.card,
    },
    cardDark: {
      backgroundColor: colors.hunter,
    },
    cardCream: {
      backgroundColor: colors.cream,
      boxShadow: undefined,
      borderWidth: 1,
      borderColor: "rgba(56,102,65,0.10)",
    },
    cardPressed: {
      transform: [{ scale: 0.985 }],
      opacity: 0.92,
    },
    infoPanel: {
      borderRadius: radii.panel,
      backgroundColor: colors.cream,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      gap: spacing.xs,
    },
    infoPanelWhite: {
      backgroundColor: colors.white,
    },
    infoPanelTranslucent: {
      backgroundColor: "rgba(255,255,255,0.10)",
    },
  }),
);
