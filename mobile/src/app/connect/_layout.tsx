import { Stack } from "expo-router";

import { colors } from "@/theme/theme";

export default function ConnectLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
      }}
    />
  );
}
