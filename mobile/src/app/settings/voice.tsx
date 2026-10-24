import { router } from "expo-router";
import { Square, Volume2 } from "lucide-react-native";
import { StyleSheet } from "react-native";
import {
  Banner,
  Body,
  Button,
  buttonIconColor,
  Card,
  Eyebrow,
  InfoPanel,
  OptionRow,
  Screen,
  TopBar,
} from "@/components/ui";
import {
  useCoachVoice,
  VOICE_ACCENTS,
  VOICE_AGES,
  VOICE_GENDERS,
  VOICE_PITCHES,
} from "@/hooks/useCoachVoice";
import { useSpeech } from "@/hooks/useSpeech";
import { spacing, type } from "@/theme/theme";

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
  const speech = useSpeech();
  const playing = speech.activeText === SAMPLE_LINE;

  function change(patch: Parameters<typeof voice.update>[0]) {
    speech.stop();
    voice.update(patch);
  }

  return (
    <Screen>
      <TopBar onBack={() => router.back()} backLabel="Back to profile" eyebrow="Settings" title="Coach voice" />
      <Body size={type.callout} tone="muted">
        This voice reads target words, coach lines and lesson narration.
      </Body>

      <Card>
        <InfoPanel>
          <Eyebrow>Current voice</Eyebrow>
          <Body size={type.footnote} weight="semibold">
            {voice.instruct}
          </Body>
        </InfoPanel>
        {speech.error ? <Banner message={speech.error} tone="error" /> : null}
        <Button
          label={playing ? "Stop sample" : "Hear this voice"}
          variant="secondary"
          loading={playing && speech.isLoading}
          icon={
            playing ? (
              <Square color={buttonIconColor("secondary")} size={14} fill={buttonIconColor("secondary")} />
            ) : (
              <Volume2 color={buttonIconColor("secondary")} size={16} />
            )
          }
          onPress={() => speech.toggle(SAMPLE_LINE)}
        />
      </Card>

      <Card style={styles.form}>
        <OptionRow
          label="Gender"
          options={options(VOICE_GENDERS)}
          value={voice.settings.gender}
          onChange={(gender) => change({ gender })}
        />
        <OptionRow
          label="Age"
          options={options(VOICE_AGES)}
          value={voice.settings.age}
          onChange={(age) => change({ age })}
        />
        <OptionRow
          label="Pitch"
          options={options(VOICE_PITCHES)}
          value={voice.settings.pitch}
          onChange={(pitch) => change({ pitch })}
        />
        <OptionRow
          label="Accent"
          options={options(VOICE_ACCENTS)}
          value={voice.settings.accent}
          onChange={(accent) => change({ accent })}
        />
      </Card>

      <Button
        label="Reset to default"
        variant="tonal"
        disabled={voice.isDefault}
        onPress={() => {
          speech.stop();
          voice.reset();
        }}
      />

      <Body size={type.caption} tone="muted" style={styles.note}>
        The first clip in a new voice takes a moment to generate.
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.xl,
  },
  note: {
    textAlign: "center",
  },
});
