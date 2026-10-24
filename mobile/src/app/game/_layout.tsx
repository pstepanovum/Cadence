import { Stack } from "expo-router";
import { colors } from "@/theme/theme";

/**
 * Every game is a full-screen route outside the tab bar, like a lesson. Swipe
 * back works as it does everywhere else; a round in progress asks first
 * through `useExitGuard`, which also covers the gesture.
 */
export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    />
  );
}
