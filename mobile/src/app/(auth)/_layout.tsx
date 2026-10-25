import { Stack } from "expo-router";
import { colors } from "@/theme/theme";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
        // Sign in and sign up replace each other; a fade reads as one screen changing.
        animation: "fade",
      }}
    />
  );
}
