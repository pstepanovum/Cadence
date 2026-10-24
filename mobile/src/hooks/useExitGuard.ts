import { useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Alert } from "react-native";

/**
 * Asks before the screen is left while `active` — by the close button, the
 * swipe-back gesture or Android's back button alike. Leaving a half-played
 * round throws it away, and that deserves a question.
 */
export function useExitGuard(
  active: boolean,
  title: string,
  message: string,
  options: { stayLabel?: string; onLeave?: () => void } = {},
) {
  const navigation = useNavigation();
  const { stayLabel = "Keep going", onLeave } = options;

  usePreventRemove(active, ({ data }) => {
    Alert.alert(title, message, [
      { text: stayLabel, style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () => {
          onLeave?.();
          navigation.dispatch(data.action);
        },
      },
    ]);
  });
}
