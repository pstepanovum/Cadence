// Settings > Level > Retake placement: the adaptive placement test on its own.
// The result becomes the learner's level straight away (src/learning/levels.ts).
import { router } from "expo-router";
import { useState } from "react";

import { PlacementTest } from "@/components/placement/PlacementTest";
import { Body, Button, Screen, TopBar } from "@/components/ui";
import type { AdaptiveResult } from "@/platform/placement";
import { type } from "@/theme/theme";

export default function RetakePlacementScreen() {
  const [result, setResult] = useState<AdaptiveResult | null>(null);
  return (
    <Screen>
      <TopBar onBack={() => router.back()} eyebrow="Level" title="Placement test" />
      {result ? null : (
        <Body size={type.callout} tone="muted">
          {"Grammar, vocabulary and reading, harder or easier as you go. Pick your best guess, or say you don't know."}
        </Body>
      )}
      <PlacementTest result={null} refId="placement.retake" onDone={setResult} />
      {result ? <Button label="Done" onPress={() => router.back()} /> : null}
    </Screen>
  );
}
