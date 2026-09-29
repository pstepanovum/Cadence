import { router } from "expo-router";
import { ArrowLeft, Volume2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { getReferenceAudio } from "@/audio/reference-audio";
import {
  Banner,
  Body,
  Card,
  Eyebrow,
  InfoPanel,
  OptionRow,
  PillButton,
  RoundIconButton,
  Screen,
  SectionHeader,
} from "@/components/ui";
import {
  useCoachVoice,
  VOICE_ACCENTS,
  VOICE_AGES,
  VOICE_GENDERS,
  VOICE_PITCHES,
} from "@/hooks/useCoachVoice";
import { usePlayback } from "@/hooks/usePlayback";
import { colors, spacing } from "@/theme/theme";

const SAMPLE_LINE = "Let's work on the way you say this sentence, one sound at a time.";

function options<T extends string>(values: readonly T[]) {
  return values.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  }));
}

/**
 * The coach voice drives every piece of generated audio in the app: reference
 * words, coach lines and theory narration. Changing it clears the audio cache,
 * so the next clip is rendered in the new voice.
 */
export default function CoachVoiceScreen() {
  const voice = useCoachVoice();
  const playback = usePlayback();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function playSample() {
    if (playback.isPlaying || playback.isLoading) {
      playback.stop();
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const uri = await getReferenceAudio(SAMPLE_LINE, voice.instruct);
      await playback.play(uri);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not generate a sample in this voice right now.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <View style={styles.backRow}>
        <RoundIconButton accessibilityLabel="Back to profile" onPress={() => router.back()}>
          <ArrowLeft color={colors.hunter} size={18} />
        </RoundIconButton>
        <Body weight="semibold" style={{ color: colors.hunter }}>
          Profile
        </Body>
      </View>

      <SectionHeader
        eyebrow="Coach voice"
        title="Choose how Cadence sounds"
        subtitle="This voice reads target words, coach lines and lesson narration."
      />

      <Card>
        <InfoPanel>
          <Eyebrow>Current voice</Eyebrow>
          <Body size={13} weight="semibold">
            {voice.instruct}
          </Body>
        </InfoPanel>
        {error ? <Banner message={error} tone="error" /> : null}
        <PillButton
          label={playback.isPlaying ? "Stop sample" : "Hear this voice"}
          variant="secondary"
          loading={loading}
          icon={<Volume2 color={colors.hunter} size={16} />}
          onPress={playSample}
        />
      </Card>

      <Card>
        <OptionRow
          label="Gender"
          options={options(VOICE_GENDERS)}
          value={voice.settings.gender}
          onChange={(gender) => {
            playback.stop();
            voice.update({ gender });
          }}
        />
        <OptionRow
          label="Age"
          options={options(VOICE_AGES)}
          value={voice.settings.age}
          onChange={(age) => {
            playback.stop();
            voice.update({ age });
          }}
        />
        <OptionRow
          label="Pitch"
          options={options(VOICE_PITCHES)}
          value={voice.settings.pitch}
          onChange={(pitch) => {
            playback.stop();
            voice.update({ pitch });
          }}
        />
        <OptionRow
          label="Accent"
          options={options(VOICE_ACCENTS)}
          value={voice.settings.accent}
          onChange={(accent) => {
            playback.stop();
            voice.update({ accent });
          }}
        />
      </Card>

      <PillButton
        label="Reset to default"
        variant="ghost"
        disabled={voice.isDefault}
        onPress={() => {
          playback.stop();
          voice.reset();
        }}
      />

      <Body size={12} style={styles.note}>
        Changing the voice clears the cached audio on this device, so the first clip in a new voice
        takes a moment to generate.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  note: {
    textAlign: "center",
    color: colors.slate,
  },
});
