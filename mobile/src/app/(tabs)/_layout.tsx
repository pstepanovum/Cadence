import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { BookOpen, Gamepad2, House, MessagesSquare, Sparkles } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import { haptics } from "@/lib/haptics";
import { colors, currentScheme, fonts } from "@/theme/theme";

/**
 * The bar's material: the system's own translucent chrome on iOS, so content
 * scrolls under it and shows through, as in the system apps. Android has no
 * live blur here, so it gets a solid bar.
 */
function TabBarBackground() {
  if (Platform.OS !== "ios") {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.snow }]} />;
  }
  return (
    <BlurView
      tint={currentScheme() === "dark" ? "systemChromeMaterialDark" : "systemChromeMaterialLight"}
      intensity={100}
      style={StyleSheet.absoluteFill}
    />
  );
}

// Five tabs, the iOS maximum. Profile and settings open from the Home header.
export default function TabsLayout() {
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptics.select() }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.cream },
        tabBarActiveTintColor: colors.hunter,
        tabBarInactiveTintColor: colors.slate,
        // Like the system tab bar: labels stay put, and long-pressing a tab
        // shows the large-content viewer for anyone using big text.
        tabBarAllowFontScaling: false,
        // Floats over the screen; `Screen tab` pads each page by its height.
        tabBarStyle: {
          position: "absolute",
          backgroundColor: "transparent",
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: currentScheme() === "dark" ? "rgba(255,255,255,0.10)" : "rgba(33,37,41,0.10)",
          elevation: 0,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarLabelStyle: {
          fontFamily: fonts.bodySemiBold,
          fontSize: 12,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <House color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "Learn",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="conversation"
        options={{
          title: "Talk",
          tabBarIcon: ({ color, size }) => <MessagesSquare color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="coach"
        options={{
          title: "Coach",
          tabBarIcon: ({ color, size }) => <Sparkles color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="play"
        options={{
          title: "Play",
          tabBarIcon: ({ color, size }) => <Gamepad2 color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
