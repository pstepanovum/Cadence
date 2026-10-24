import { Stack } from "expo-router";
import { colors } from "@/theme/theme";

/** Every game is a full-screen route outside the tab bar, like a lesson. */
export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
        // A swipe-back mid-round would skip the "leave the game?" question.
        gestureEnabled: false,
      }}
    />
  );
}
