import { useNavigation } from "expo-router";
import { useEffect } from "react";
import { Alert } from "react-native";

/**
 * Asks before the screen is popped while `active`, the way the lessons do:
 * leaving a half-played round throws it away, and that deserves a question.
 */
export function useExitGuard(active: boolean, title: string, message: string) {
  const navigation = useNavigation();

  useEffect(() => {
    if (!active) return;
    const unsubscribe = navigation.addListener("beforeRemove", (event) => {
      event.preventDefault();
      Alert.alert(title, message, [
        { text: "Keep playing", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
      ]);
    });
    return unsubscribe;
  }, [navigation, active, title, message]);
}
