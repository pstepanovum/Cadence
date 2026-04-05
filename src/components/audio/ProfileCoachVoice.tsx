// FILE: src/components/audio/ProfileCoachVoice.tsx
"use client";

import { CoachVoiceCard } from "@/components/audio/CoachVoiceCard";
import { useCoachVoice } from "@/hooks/useCoachVoice";

export function ProfileCoachVoice() {
  const { settings, instruct, updateSettings } = useCoachVoice();
  return (
    <CoachVoiceCard
      settings={settings}
      instruct={instruct}
      onUpdate={updateSettings}
    />
  );
}
