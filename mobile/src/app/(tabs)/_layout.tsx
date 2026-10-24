import { Tabs } from "expo-router";
import { BookOpen, Gamepad2, House, MessagesSquare, Sparkles } from "lucide-react-native";
import { haptics } from "@/lib/haptics";
import { colors, fonts } from "@/theme/theme";

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
        tabBarStyle: {
          backgroundColor: colors.snow,
          borderTopColor: colors.alabaster,
        },
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
