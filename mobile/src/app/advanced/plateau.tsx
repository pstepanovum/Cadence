// The plateau track (docs/PLATFORM.md section 18) on the phone: a short
// diagnostic, then twelve weeks on the errors that persist in your speech:
// today's drills one step at a time (hear, record, compare, rate), a re-test
// at the end of each week, progress per error, and your own corrected
// sentences. Pronunciation scores the phone has kept count as evidence.
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Body, Button, Card, EmptyState, Eyebrow, LoadingBlock, Screen, TextField, Title, TopBar } from "@/components/ui";
import { useAdvancedContent } from "@/learning/advanced-content";
import { gradeDrillStep, setTrack, updateTrack, useAdvancedState } from "@/learning/advanced-store";
import { RateRow, StepLine, Tag } from "@/learning/advanced-ui";
import { today, useLearning } from "@/learning/store";
import {
  addOwnSentence,
  dailyDrills,
  diagnose,
  diagnosticItems,
  DRILL_STEP_TITLES,
  errorProgress,
  evidenceFromPhonemes,
  gradeCorrection,
  PHASE_COPY,
  recordRetest,
  retestItems,
  startTrack,
  trackSummary,
  type DiagnosticItem,
  type Evidence,
  type FossilError,
  type Track,
} from "@/platform/fossilization";
import { gradeFromSelf } from "@/platform/phrase-bank";
import { RecordCompare } from "@/recordings/RecordCompare";
import { colors, radii, spacing, type, themed } from "@/theme/theme";

export default function PlateauScreen() {
  const content = useAdvancedContent();
  const { state, loaded } = useAdvancedState();
  const learning = useLearning();
  const [mode, setMode] = useState<"home" | "diagnostic" | "retest">("home");

  if (!content || !loaded) {
    return (
      <Screen>
        <TopBar eyebrow="Plateau track" onBack={() => router.back()} />
        <LoadingBlock rows={3} label="Opening the plateau track…" />
      </Screen>
    );
  }
  const catalog = content.errors;
  const track = state.track;

  const soundEvidence = (): Evidence[] => {
    // The phone's per-sound history: one data point per sound per day.
    return Object.entries(learning.state.sounds).flatMap(([soundId, record]) => (record.history ?? []).flatMap((h) => evidenceFromPhonemes([{ soundId, score: h.score }], catalog, h.day)));
  };

  if (mode === "diagnostic") {
    return (
      <Probe
        title="Diagnostic"
        items={diagnosticItems(catalog)}
        catalog={catalog}
        source="diagnostic"
        onDone={(evidence) => {
          setTrack(startTrack(diagnose([...evidence, ...soundEvidence()]), today(), { now: Date.now() }));
          setMode("home");
        }}
        onCancel={() => setMode("home")}
      />
    );
  }
  if (mode === "retest" && track) {
    const week = trackSummary(track, today()).retestDue ?? 1;
    return (
      <Probe
        title={`Week ${week} re-test`}
        items={retestItems(track, catalog, week)}
        catalog={catalog}
        source="retest"
        onDone={(evidence) => {
          const scores: Record<string, number> = {};
          for (const errorId of track.focus) {
            const mine = evidence.filter((e) => e.errorId === errorId);
            if (mine.length) scores[errorId] = Math.round((mine.filter((e) => e.ok).length / mine.length) * 100);
          }
          updateTrack((t) => recordRetest(t, week, today(), scores, Date.now()));
          setMode("home");
        }}
        onCancel={() => setMode("home")}
      />
    );
  }

  return (
    <Screen>
      <TopBar eyebrow="Plateau track" title={track ? undefined : "Break the plateau in twelve weeks"} onBack={() => router.back()} />
      {track ? <TrackHome track={track} catalog={catalog} onRetest={() => setMode("retest")} onRestart={() => setMode("diagnostic")} /> : <Intro onStart={() => setMode("diagnostic")} />}
    </Screen>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <>
      <Body tone="muted">At C1 and above, the errors that remain are the ones nobody corrects any more, so they set. This finds the ones that persist in your speech, works on two at a time with short daily drills, and re-tests them every week until they hold.</Body>
      <Button label="Take the diagnostic" onPress={onStart} />
      <Body size={type.caption} tone="muted">
        About forty short items, ten to fifteen minutes. You can stop and come back.
      </Body>
      {(["notice", "rebuild", "automate"] as const).map((phase, i) => (
        <Card key={phase} style={styles.card}>
          <Eyebrow>{i === 0 ? "Weeks 1 to 2" : i === 1 ? "Weeks 3 to 8" : "Weeks 9 to 12"}</Eyebrow>
          <Title size={type.headline}>{PHASE_COPY[phase].title}</Title>
          <Body size={type.footnote} tone="muted">
            {PHASE_COPY[phase].detail}
          </Body>
        </Card>
      ))}
    </>
  );
}

function TrackHome({ track, catalog, onRetest, onRestart }: { track: Track; catalog: FossilError[]; onRetest: () => void; onRestart: () => void }) {
  const day = today();
  const summary = trackSummary(track, day);
  const steps = dailyDrills(track, catalog, day, { minutes: 10 });
  const progress = errorProgress(track);
  const titleOf = (id: string | null) => catalog.find((e) => e.id === id)?.title ?? "Your own sentence";
  const [own, setOwn] = useState({ said: "", text: "" });
  const step = steps[0];

  return (
    <>
      <View style={styles.head}>
        <Eyebrow>{summary.phase === "done" ? "Finished" : `Week ${summary.week} of ${summary.weeks}`}</Eyebrow>
        <Title size={type.title1}>{PHASE_COPY[summary.phase].title}</Title>
        <Body tone="muted">{PHASE_COPY[summary.phase].detail}</Body>
      </View>
      {summary.retestDue ? <Button label={`Take the week ${summary.retestDue} re-test`} onPress={onRetest} /> : null}
      {summary.phase === "done" ? <Button label="Start a new round" onPress={onRestart} /> : null}
      {track.focus.length === 0 ? <EmptyState compact title="No persistent error showed up" message="Talk with the coach for a week and come back: spoken feedback is better evidence than any test." /> : null}

      {step ? (
        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <Eyebrow>{`Today · ${steps.length} step${steps.length === 1 ? "" : "s"} left`}</Eyebrow>
            <Tag label={DRILL_STEP_TITLES[step.kind]} />
          </View>
          <Body size={type.footnote} tone="muted">
            {titleOf(step.errorId)}
          </Body>
          {step.kind === "contrast" && step.alt ? <Text style={styles.struck}>{step.alt}</Text> : null}
          <Title size={type.title3}>{step.kind === "stress" && step.alt ? step.alt : step.text}</Title>
          {step.kind === "minimal_pair" && step.alt ? <Body tone="muted">{`Against "${step.alt}". Both slowly, then quickly.`}</Body> : null}
          {step.note ? (
            <Body size={type.footnote} tone="muted">
              {step.note}
            </Body>
          ) : null}
          <Body size={type.caption} tone="muted">{`Say it ${step.reps} times.`}</Body>
          <RecordCompare key={step.id} itemId={step.id} target={{ text: step.kind === "minimal_pair" && step.alt ? `${step.text}. ${step.alt}.` : step.text }} />
          <RateRow onRate={(r) => gradeDrillStep(step.id, gradeFromSelf(r))} />
        </Card>
      ) : summary.phase !== "done" && track.focus.length ? (
        <EmptyState compact title="Done for today" message="Steps you rated Again come back tomorrow." />
      ) : null}

      {progress.length ? (
        <Card style={styles.card}>
          <Title size={type.headline}>Progress per error</Title>
          {progress.map((p) => (
            <View key={p.errorId} style={styles.progress}>
              <View style={styles.rowBetween}>
                <Body weight="semibold" style={styles.flex}>
                  {titleOf(p.errorId)}
                </Body>
                <Tag label={p.status === "fixed" ? "Fixed" : p.status === "improving" ? "Improving" : "Persistent"} tone={p.status === "fixed" ? "green" : "muted"} />
              </View>
              <View style={styles.bars} accessibilityLabel={`Start ${p.baseline}, latest ${p.latest ?? "none yet"}`}>
                {[{ week: 0, score: p.baseline }, ...p.history].map((h) => (
                  <View key={h.week} style={styles.barCol}>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { height: `${Math.max(6, h.score)}%` }, h.week === 0 && styles.barStart]} />
                    </View>
                    <Text style={styles.barLabel}>{h.week === 0 ? "Start" : `W${h.week}`}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Title size={type.headline}>Add a sentence from your own speech</Title>
        <Body size={type.footnote} tone="muted">
          When feedback corrects something you said, keep the corrected version here. Your own sentences are the strongest drills.
        </Body>
        <TextField value={own.said} onChangeText={(said) => setOwn((o) => ({ ...o, said }))} placeholder="What you said (optional)" />
        <TextField value={own.text} onChangeText={(text) => setOwn((o) => ({ ...o, text }))} placeholder="The corrected sentence" />
        <Button
          label="Add"
          variant="secondary"
          disabled={!own.text.trim()}
          onPress={() => {
            updateTrack((t) => addOwnSentence(t, { text: own.text, said: own.said || undefined }, today(), Date.now()));
            setOwn({ said: "", text: "" });
          }}
        />
      </Card>
    </>
  );
}

function Probe({ title, items, catalog, source, onDone, onCancel }: { title: string; items: DiagnosticItem[]; catalog: FossilError[]; source: "diagnostic" | "retest"; onDone: (evidence: Evidence[]) => void; onCancel: () => void }) {
  const [index, setIndex] = useState(0);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState<boolean | null>(null);
  const item = items[index];
  const record = (ok: boolean) => {
    const next = [...evidence, { errorId: item.errorId, day: today(), source, ok }];
    setEvidence(next);
    setAnswer("");
    setChecked(null);
    if (index + 1 >= items.length) onDone(next);
    else setIndex(index + 1);
  };
  if (!item) {
    return (
      <Screen>
        <TopBar title={title} onClose={onCancel} />
        <EmptyState title="Nothing to test" message="There are no items for this yet." actionLabel="Back" onAction={onCancel} />
      </Screen>
    );
  }
  const error = catalog.find((e) => e.id === item.errorId);
  return (
    <Screen>
      <TopBar eyebrow={`${title} · ${index + 1} of ${items.length}`} title={item.kind === "correct" ? "Correct the sentence" : "Read it aloud"} onClose={onCancel} closeLabel="Stop and come back later" />
      <StepLine done={index} total={items.length} />
      <Card style={styles.card}>
        <Title size={type.title3}>{item.sentence}</Title>
        {item.kind === "correct" ? (
          <>
            <Body size={type.footnote} tone="muted">
              Change only what is wrong.
            </Body>
            <TextField value={answer} onChangeText={setAnswer} placeholder="The corrected sentence" multiline autoCorrect={false} />
            {checked !== null ? <Body tone={checked ? "strong" : "muted"}>{checked ? "Right." : `One correct version: ${item.answers[0]}${error ? ` (${error.title})` : ""}`}</Body> : null}
            <Button label={checked === null ? "Check" : "Next"} onPress={() => (checked !== null ? record(checked) : setChecked(gradeCorrection(item.answers, answer)))} />
            {checked === null ? <Button label="It's already right" variant="secondary" onPress={() => setChecked(gradeCorrection(item.answers, item.sentence))} /> : null}
          </>
        ) : (
          <>
            <Body size={type.footnote} tone="muted">
              Record it once, listen back against the target, and rate yourself strictly.
            </Body>
            <RecordCompare key={item.id} itemId={item.id} target={{ text: item.sentence }} />
            <RateRow onRate={(r) => record(r === "nailed")} />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    head: { gap: spacing.xs },
    card: { gap: spacing.md },
    rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
    flex: { flex: 1 },
    struck: { color: colors.slate, textDecorationLine: "line-through", fontSize: type.body },
    progress: { gap: spacing.sm },
    bars: { flexDirection: "row", gap: spacing.xs, alignItems: "flex-end" },
    barCol: { flex: 1, alignItems: "center", gap: 2 },
    barTrack: { height: 56, width: "100%", borderRadius: radii.tile / 2, backgroundColor: colors.platinum, justifyContent: "flex-end", overflow: "hidden" },
    barFill: { width: "100%", backgroundColor: colors.hunter, borderRadius: radii.tile / 2 },
    barStart: { backgroundColor: colors.paleSlate },
    barLabel: { fontSize: 10, color: colors.slate },
  }),
);
