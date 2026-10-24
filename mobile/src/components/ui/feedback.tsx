import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SvgXml } from "react-native-svg";
import { Button } from "@/components/ui/buttons";
import { Body, Title } from "@/components/ui/text";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

// Loading is communicated with placeholder shapes and plain copy, and
// "nothing here" is always a centred panel with a heading and a sentence, so no
// screen can end on a bare spinner or a blank scroll view.

export type BannerTone = "info" | "warning" | "error" | "success";

const bannerPalette: Record<
  BannerTone,
  { bg: string; fg: string; icon: string; Icon: typeof Info }
> = themed(() => ({
  info: { bg: colors.white, fg: colors.iron, icon: colors.hunter, Icon: Info },
  warning: { bg: colors.mixedSoft, fg: colors.ink, icon: colors.ink, Icon: AlertTriangle },
  error: { bg: colors.brickSoft, fg: colors.brickText, icon: colors.brick, Icon: XCircle },
  success: { bg: colors.limeSoft, fg: colors.ink, icon: colors.hunter, Icon: CheckCircle2 },
}));

export function Banner({
  message,
  tone = "info",
  actionLabel,
  onAction,
  style,
}: {
  message: string;
  tone?: BannerTone;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = bannerPalette[tone];
  const Icon = palette.Icon;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.banner, { backgroundColor: palette.bg }, style]}>
      <View style={styles.bannerRow}>
        <Icon color={palette.icon} size={18} />
        <Body size={type.footnote} weight="medium" style={[styles.bannerText, { color: palette.fg }]}>
          {message}
        </Body>
      </View>
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          variant={tone === "error" ? "danger" : "primary"}
          onPress={onAction}
          style={styles.bannerAction}
        />
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  illustration,
  actionLabel,
  onAction,
  compact = false,
  style,
}: {
  title: string;
  message: string;
  /** An inline SVG source from src/data/svg.ts. */
  illustration?: string;
  actionLabel?: string;
  onAction?: () => void;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const art = compact ? 96 : 140;
  return (
    <View style={[styles.empty, compact && styles.emptyCompact, style]}>
      {illustration ? <SvgXml xml={illustration} width={art} height={art} /> : null}
      <Title size={compact ? type.headline : type.title3} style={styles.centerText}>
        {title}
      </Title>
      <Body size={type.footnote} tone="muted" style={styles.centerText}>
        {message}
      </Body>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

/** Follows the system's Reduce Motion setting. */
function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

/**
 * Placeholder blocks that hold the shape of the content that is coming, so a
 * list does not jump when it arrives. They breathe gently unless the learner
 * has asked for less motion.
 */
export function LoadingBlock({ rows = 3, label }: { rows?: number; label?: string }) {
  const reduceMotion = useReduceMotion();
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduceMotion]);

  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      {Array.from({ length: rows }, (_, index) => (
        <Animated.View
          key={index}
          style={[styles.loadingRow, index === rows - 1 && styles.loadingRowShort, { opacity }]}
        />
      ))}
      {label ? (
        <Body size={type.footnote} tone="muted" style={styles.centerText}>
          {label}
        </Body>
      ) : null}
    </View>
  );
}

export interface ScreenStateProps {
  isLoading: boolean;
  isError: boolean;
  /**
   * The server cannot be reached and the screen's `ServerBanner` already says
   * so. Loading and error states then render nothing, so the outage is not
   * reported twice.
   */
  offline?: boolean;
  /** Already-humanised copy; pass `describeError(error)`. */
  errorMessage?: string;
  onRetry?: () => void;
  isEmpty?: boolean;
  empty?: {
    title: string;
    message: string;
    illustration?: string;
    actionLabel?: string;
    onAction?: () => void;
  };
  loadingRows?: number;
  loadingLabel?: string;
  children: React.ReactNode;
}

/**
 * The one place a screen decides between "still loading", "it broke",
 * "there is nothing yet" and the real content.
 */
export function ScreenState({
  isLoading,
  isError,
  offline = false,
  errorMessage,
  onRetry,
  isEmpty = false,
  empty,
  loadingRows,
  loadingLabel,
  children,
}: ScreenStateProps) {
  if (offline && (isLoading || isError)) {
    return null;
  }
  if (isLoading) {
    return <LoadingBlock rows={loadingRows} label={loadingLabel} />;
  }
  if (isError) {
    return (
      <Banner
        tone="error"
        message={errorMessage ?? "Something went wrong."}
        actionLabel={onRetry ? "Try again" : undefined}
        onAction={onRetry}
      />
    );
  }
  if (isEmpty && empty) {
    return <EmptyState {...empty} />;
  }
  return <>{children}</>;
}

const styles = themed(() =>
  StyleSheet.create({
    banner: {
      borderRadius: radii.panel,
      padding: spacing.lg,
      gap: spacing.md,
      borderWidth: 1,
      borderColor: "rgba(33,37,41,0.06)",
    },
    bannerRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
    },
    bannerText: {
      flex: 1,
    },
    bannerAction: {
      alignSelf: "flex-start",
      minHeight: 44,
      paddingVertical: spacing.sm,
    },
    empty: {
      borderRadius: radii.cardLarge,
      backgroundColor: colors.snow,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.xxl,
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.md,
    },
    emptyCompact: {
      paddingVertical: spacing.xl,
    },
    emptyAction: {
      marginTop: spacing.xs,
      alignSelf: "stretch",
    },
    centerText: {
      textAlign: "center",
    },
    loading: {
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    loadingRow: {
      height: 72,
      borderRadius: radii.card,
      backgroundColor: colors.snow,
    },
    loadingRowShort: {
      width: "65%",
    },
  }),
);
