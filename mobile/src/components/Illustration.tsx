// One of the Cadence illustrations (public/illustration, generated into
// src/data/illustrations.generated.ts), drawn with react-native-svg in the
// current palette: in dark mode the brand colours swap for their dark tokens.
// Decorative, so screen readers skip it.
import { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";

import { ILLUSTRATIONS, type IllustrationName } from "@/data/illustrations.generated";
import { colors, currentScheme } from "@/theme/theme";

const LIGHT = { "#386641": "hunter", "#6A994E": "sage", "#A7C957": "yellowGreen", "#BC4749": "brick", "#CED4DA": "paleSlate" } as const;

function recolour(xml: string): string {
  if (currentScheme() === "light") return xml;
  let out = xml;
  for (const [hex, token] of Object.entries(LIGHT)) out = out.split(hex).join(colors[token]);
  return out;
}

export function Illustration({ name, size, style }: { name: IllustrationName; size: number; style?: StyleProp<ViewStyle> }) {
  const scheme = currentScheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const xml = useMemo(() => recolour(ILLUSTRATIONS[name]), [name, scheme]);
  return (
    <View style={style} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <SvgXml xml={xml} width={size} height={size} />
    </View>
  );
}
