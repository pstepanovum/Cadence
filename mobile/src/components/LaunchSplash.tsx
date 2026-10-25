// The launch animation. The native splash (app.json) shows the Cadence mark in
// grey on the page colour; this overlay takes over from it at the same size
// and place, so the hand-off is invisible, and fills the mark with green
// liquid while fonts, the stored sign-in and the paired computer load
// underneath. Once the app is ready it finishes the fill quickly and fades
// out: it never holds a ready app back by more than about 600 ms. With
// Reduce Motion on there is no liquid, only the fade.
//
// The liquid is a wavy strip that slides up and sideways (native transforms,
// so it runs on the UI thread while JavaScript is busy loading), seen through
// a stencil in the page colour that covers everything but the mark.
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { colors, currentScheme } from "@/theme/theme";

/** The Cadence mark, from assets/svg/icon-green-white.svg (viewBox 76 x 41). */
const MARK = "M1.49772 21.3175C4.09062 16.1752 9.68998 13.9038 14.9402 14.7805C14.0909 9.58989 16.3584 4.07387 21.5066 1.50223L22.2776 1.15052L22.3361 1.1269L22.3712 1.11429C22.384 1.10873 22.4017 1.09949 22.4413 1.08158C22.4751 1.06647 22.5331 1.04039 22.5933 1.01456C22.6333 0.997581 22.685 0.978201 22.7411 0.956394C28.5142 -1.39352 34.5599 0.904802 37.8653 5.41308C41.1174 0.878618 47.1698 -1.42746 52.9989 0.949747L53.0541 0.972076L53.5625 1.20865C59.2361 3.66009 61.8052 9.50095 60.925 14.9398C66.3908 14.0819 72.237 16.6519 74.6834 22.3314L74.7075 22.3898L74.7205 22.4248C74.7261 22.4377 74.7336 22.4569 74.7524 22.4979C74.7679 22.5314 74.7946 22.5892 74.8209 22.6493C74.8388 22.6899 74.8563 22.7422 74.8788 22.7994L74.8833 22.7978C74.8963 22.8287 74.9077 22.8604 74.9204 22.8912L74.9159 22.8928C78.3703 31.3412 71.8067 40.2797 62.8628 40.266L46.6271 40.2182L46.6092 40.2171C43.3424 40.1822 41.0858 37.6386 40.649 34.9206C39.7103 34.765 40.649 34.9206 38.1966 34.9752C34.7631 35.0517 36.2212 34.8942 35.2536 35.0408C34.8215 37.7516 32.6441 40.1627 29.375 40.1615L13.1395 40.114L12.5883 40.1112L12.5101 40.0749C3.85397 39.6407 -2.44405 30.838 0.92257 22.5614L0.944512 22.5064L1.49772 21.3175ZM45.7308 33.5591C45.2199 34.2594 45.6989 35.2642 46.6094 35.2874L63.3645 35.3195C68.761 34.9899 72.3341 29.5153 70.3044 24.6582L70.2854 24.613L70.2773 24.591C70.2716 24.5783 70.2625 24.5615 70.2438 24.5212C70.2283 24.4877 70.2032 24.4274 70.1767 24.3668C70.1618 24.3328 70.1455 24.2914 70.127 24.2457C68.0117 19.3353 61.2814 18.0848 57.2934 22.0367L45.8496 33.4221L45.7308 33.5591ZM51.0887 5.48727C46.045 3.47439 40.394 7.33619 40.4001 12.9618L40.4653 29.1662L40.4678 29.1852C40.4676 29.2096 40.463 29.2349 40.4627 29.2589C40.5752 30.145 41.6673 30.5577 42.3405 29.8936L53.7902 18.5035L53.7929 18.4977C57.647 14.6758 56.578 8.22451 52.015 5.91828L51.0887 5.48727ZM24.1899 5.71252C19.3678 7.77297 18.1475 14.3397 21.982 18.3433C22.0101 18.3709 22.0409 18.396 22.0689 18.4238L33.6329 29.8944C34.3151 30.5634 35.4044 30.1489 35.4951 29.2495C35.494 29.2045 35.4929 29.1594 35.4926 29.114L35.4953 29.1082L35.4236 12.5707L35.4227 12.4942C35.0528 7.12772 29.5207 3.5372 24.649 5.52006L24.6037 5.53871L24.5818 5.54667C24.5689 5.55219 24.5492 5.55971 24.5086 5.57797C24.475 5.59312 24.4169 5.61916 24.3567 5.64501C24.3119 5.66422 24.2545 5.68761 24.1899 5.71252ZM5.70171 24.0603L5.50622 24.4804C3.50558 29.4827 7.4291 35.1344 13.0917 35.1692L13.6398 35.1705L13.6729 35.1859L29.3425 35.2311C30.331 35.2313 30.822 34.0699 30.1139 33.3608L18.6277 21.9589L18.6201 21.9517C18.5906 21.9223 18.5634 21.8907 18.5342 21.861C14.5335 17.9193 7.78642 19.1371 5.71673 24.0201L5.70171 24.0603Z";

/** Same width as `imageWidth` in the expo-splash-screen config. */
const WIDTH = 140;
const HEIGHT = (WIDTH * 324) / 600;

/** Colours of the empty mark; they match assets/images/splash-mark*.png. */
const EMPTY = { light: "#ced4da", dark: "#3a4047" };

const FILL_MS = 1300;
/** How long the fill may take to catch up once the app is ready. */
const CATCH_UP_MS = 350;
const FADE_MS = 250;

/** Wave height and length, in points. Two crests span the mark. */
const AMPLITUDE = 3;
const WAVELENGTH = WIDTH / 2;
const STRIP_HEIGHT = HEIGHT + AMPLITUDE * 2;

/**
 * A strip of liquid twice the mark's width with a wavy top edge. It slides
 * sideways by one mark width per cycle, which loops seamlessly because that
 * width is a whole number of wavelengths.
 */
function liquidPath(): string {
  const width = WIDTH * 2;
  let d = `M 0 ${STRIP_HEIGHT} L 0 ${AMPLITUDE}`;
  for (let x = 0; x <= width; x += 2) {
    d += ` L ${x} ${(AMPLITUDE + AMPLITUDE * Math.sin((x / WAVELENGTH) * Math.PI * 2)).toFixed(2)}`;
  }
  return d + ` L ${width} ${STRIP_HEIGHT} Z`;
}
const LIQUID = liquidPath();

/** Everything in the mark's box except the mark itself (even-odd), to mask the liquid. */
const STENCIL = `M -1 -1 H 77 V 42 H -1 Z ${MARK}`;

/** Where the strip's top sits: below the mark when empty, above it when full. */
function rise(level: number, lag: number): number {
  "worklet";
  const from = HEIGHT + lag;
  const to = -AMPLITUDE * 2 - lag;
  return from + (to - from) * level;
}

/**
 * How long the liquid runs on its own before the app starts mounting under it.
 * Mounting the first screens keeps the main thread busy, which would freeze
 * the animation, so it gets a short head start; this is the only time the
 * splash adds, and it stays inside the ~600 ms budget.
 */
export const HEAD_START_MS = 450;

export function LaunchSplash({ ready, onStarted }: { ready: boolean; onStarted?: () => void }) {
  const reduceMotion = useReducedMotion();
  const dark = currentScheme() === "dark";
  const level = useSharedValue(0);
  const drift = useSharedValue(0);
  const opacity = useSharedValue(1);
  const startedAt = useRef(0);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    startedAt.current = Date.now();
    if (reduceMotion) return;
    level.set(withTiming(1, { duration: FILL_MS, easing: Easing.out(Easing.quad) }));
    drift.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.linear }), -1, false));
  }, [reduceMotion, level, drift]);

  useEffect(() => {
    if (!ready) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const fade = () => {
      opacity.set(withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) }));
      timers.push(setTimeout(() => setGone(true), FADE_MS + 50));
    };
    const remaining = reduceMotion ? 0 : FILL_MS - (Date.now() - startedAt.current);
    if (remaining > CATCH_UP_MS) {
      level.set(withTiming(1, { duration: CATCH_UP_MS, easing: Easing.out(Easing.cubic) }));
      timers.push(setTimeout(fade, CATCH_UP_MS));
    } else if (remaining > 0) {
      timers.push(setTimeout(fade, remaining));
    } else {
      fade();
    }
    return () => timers.forEach(clearTimeout);
  }, [ready, reduceMotion, level, opacity]);

  const front = useAnimatedStyle(() => ({
    transform: [{ translateY: rise(level.get(), 0) }, { translateX: -WIDTH * drift.get() }],
  }));
  const back = useAnimatedStyle(() => ({
    transform: [{ translateY: rise(level.get(), 4) - 3 }, { translateX: -WIDTH * (1 - drift.get()) }],
  }));
  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  if (gone) return null;

  return (
    <Animated.View
      pointerEvents={ready ? "none" : "auto"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.cream }, fadeStyle]}
      // The first frame matches the native splash, so it can go now.
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
        onStarted?.();
      }}>
      <View style={styles.mark}>
        <Svg width={WIDTH} height={HEIGHT} viewBox="0 0 76 41" style={StyleSheet.absoluteFill}>
          <Path d={MARK} fill={dark ? EMPTY.dark : EMPTY.light} />
        </Svg>
        {reduceMotion ? null : (
          <>
            <Animated.View style={[styles.liquid, back]}>
              <Svg width={WIDTH * 2} height={STRIP_HEIGHT}>
                <Path d={LIQUID} fill={colors.sage} opacity={0.6} />
              </Svg>
            </Animated.View>
            <Animated.View style={[styles.liquid, front]}>
              <Svg width={WIDTH * 2} height={STRIP_HEIGHT}>
                <Path d={LIQUID} fill={colors.hunter} />
              </Svg>
            </Animated.View>
            <Svg width={WIDTH} height={HEIGHT} viewBox="0 0 76 41" style={StyleSheet.absoluteFill}>
              <Path d={STENCIL} fill={colors.cream} fillRule="evenodd" />
            </Svg>
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  mark: {
    width: WIDTH,
    height: HEIGHT,
    overflow: "hidden",
  },
  liquid: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
