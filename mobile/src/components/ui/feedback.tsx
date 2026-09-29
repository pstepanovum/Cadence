import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { Body, PillButton, Title } from "@/components/ui/primitives";
import { colors, overlays, radii, spacing } from "@/theme/theme";

// The web app has no spinners and no skeleton shimmer: loading is communicated
// with plain copy and disabled controls, and "nothing here" is always a centred
// cream panel with a heading and a sentence. These mirror that, so no screen in
// the app can end on a bare ActivityIndicator or a blank scroll view.

export type BannerTone = "info" | "warning" | "error" | "success";

const bannerPalette: Record<BannerTone, { bg: string; fg: string }> = {
  info: { bg: colors.cream, fg: colors.iron },
  warning: { bg: colors.mixedChip, fg: colors.hunter },
  error: { bg: colors.brick, fg: colors.snow },
  success: { bg: colors.yellowGreen, fg: colors.hunter },
};

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
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }, style]}>
      <Body size={13} style={{ color: palette.fg }}>
        {message}
      </Body>
      {actionLabel && onAction ? (
        <PillButton
          label={actionLabel}
          variant={tone === "error" ? "ghost" : "primary"}
          onPress={onAction}
          style={styles.bannerAction}
        />
      ) : null}
    </View>
  );
}

/** Kept for the many call sites that only ever show an error. */
export function ErrorBanner({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return <Banner message={message} tone="error" actionLabel={actionLabel} onAction={onAction} />;
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
  return (
    <View style={[styles.empty, compact && styles.emptyCompact, style]}>
      {illustration ? (
        <SvgXml xml={illustration} width={compact ? 120 : 168} height={compact ? 120 : 168} />
      ) : null}
      <Title size={compact ? 17 : 20} style={styles.centerText}>
        {title}
      </Title>
      <Body size={13} style={styles.centerText}>
        {message}
      </Body>
      {actionLabel && onAction ? (
        <PillButton label={actionLabel} onPress={onAction} style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

/**
 * Placeholder blocks that hold the shape of the content that is coming, so a
 * list does not jump when it arrives. Deliberately static — the product has no
 * shimmer anywhere.
 */
export function LoadingBlock({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label ?? "Loading"}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.loadingRow, index === rows - 1 && styles.loadingRowShort]} />
      ))}
      {label ? (
        <Body size={13} style={styles.centerText}>
          {label}
        </Body>
      ) : null}
    </View>
  );
}

export interface ScreenStateProps {
  isLoading: boolean;
  isError: boolean;
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
 * "there is nothing yet" and the real content. Every branch is a dead end
 * without it, which is exactly what this exists to prevent.
 */
export function ScreenState({
  isLoading,
  isError,
  errorMessage,
  onRetry,
  isEmpty = false,
  empty,
  loadingRows,
  loadingLabel,
  children,
}: ScreenStateProps) {
  if (isLoading) {
    return <LoadingBlock rows={loadingRows} label={loadingLabel} />;
  }
  if (isError) {
    return (
      <ErrorBanner
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

const styles = StyleSheet.create({
  banner: {
    borderRadius: radii.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  bannerAction: {
    alignSelf: "flex-start",
  },
  empty: {
    borderRadius: radii.cardLarge,
    backgroundColor: overlays.creamSoft,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    minHeight: 280,
  },
  emptyCompact: {
    minHeight: 180,
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
    backgroundColor: overlays.creamSoft,
  },
  loadingRowShort: {
    width: "65%",
  },
});
