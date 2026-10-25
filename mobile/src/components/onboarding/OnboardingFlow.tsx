// First-run setup, one question a screen: three welcome slides, the goal, the
// level (with an optional two-minute quiz), the daily goal, a reminder time
// (iOS's permission is asked here, when reminders are turned on), where to
// practise, an optional account, and Plus at the end on the cloud path with a
// clear "Not now". Each move is saved, so closing the app halfway resumes
// where it stopped; finishing marks it done for good.
//
// A replay (Settings > Run setup again) walks the learning questions only and
// saves the answers at the end; it never offers Plus or changes the
// connection.
import { router } from "expo-router";
import { Cloud, Laptop } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from "react-native-reanimated";

import { setNewsletter } from "@/api/account";
import { PlusPaywall } from "@/components/billing/PlusPaywall";
import { Illustration } from "@/components/Illustration";
import { FitScreen, useCompactHeight, useKeyboardVisible } from "@/components/auth/layout";
import { AccountStep } from "@/components/onboarding/AccountStep";
import { ChoiceCard } from "@/components/onboarding/ChoiceCard";
import { OnboardingTopBar } from "@/components/onboarding/OnboardingTopBar";
import { PlacementTest } from "@/components/placement/PlacementTest";
import { StepHeading } from "@/components/onboarding/StepHeading";
import { TimePicker } from "@/components/TimePicker";
import { Banner, Body, Button, Title } from "@/components/ui";
import { rememberLearnLevel } from "@/content/useContent";
import { useAccount } from "@/context/account";
import { useAuth } from "@/context/auth";
import type { IllustrationName } from "@/data/illustrations.generated";
import { DAILY_GOAL_OPTIONS, type DailyGoal } from "@/engagement/today";
import { isCloudConfigured } from "@/lib/config";
import { haptics } from "@/lib/haptics";
import { prefs, setPref } from "@/lib/prefs";
import { askForNotifications } from "@/notifications/schedule";
import { reminderSettings, updateReminders } from "@/notifications/settings";
import {
  accountOptional,
  afterWelcome,
  cadenceForMinutes,
  DEFAULT_ANSWERS,
  focusForGoal,
  INTRO_SLIDES,
  LEARNING_GOALS,
  nextPosition,
  onboardingSteps,
  previousPosition,
  progressIndex,
  resumePosition,
  SELF_CHECK_LEVELS,
  SKIPPABLE,
  startingLevel,
  type OnboardingAnswers,
  type OnboardingPosition,
} from "@/onboarding/flow";
import { completeOnboarding, getOnboarding, saveOnboardingProgress } from "@/onboarding/store";
import { useConnection } from "@/pairing/context";
import { colors, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

const SLIDES: { art: IllustrationName; title: string; body: string }[] = [
  { art: "welcome", title: "Speak English with confidence", body: "Pronunciation, grammar and conversation, a few minutes a day." },
  { art: "talk", title: "Practise out loud", body: "Score your sounds, see where your tongue goes, and talk with a coach." },
  { art: "progress", title: "Little and often", body: "A daily goal, a streak and gentle reminders keep you going." },
];
if (SLIDES.length !== INTRO_SLIDES) throw new Error("Onboarding slides and INTRO_SLIDES differ.");

const MINUTES_DETAIL: Record<DailyGoal, string> = {
  5: "A quick daily habit",
  10: "Steady progress",
  15: "Faster progress",
  20: "Serious practice",
};

export function OnboardingFlow({ replay = false }: { replay?: boolean }) {
  const { user, profile, updateProfile } = useAuth();
  const account = useAccount();
  const connection = useConnection();
  const compact = useCompactHeight();
  const typing = useKeyboardVisible();

  const stored = getOnboarding();
  const saved = replay ? null : stored;
  // A replay opens on the current choices; a first run on what it saved so far.
  const [answers, setAnswers] = useState<OnboardingAnswers>(() =>
    replay
      ? { ...(stored?.answers ?? DEFAULT_ANSWERS), minutes: prefs.get().dailyGoal, reminderTime: reminderSettings.get().time, remindersOn: reminderSettings.get().daily }
      : (saved?.answers ?? DEFAULT_ANSWERS),
  );
  const [wantsPlacement, setWantsPlacement] = useState(() => saved?.position?.step === "placement" || answers.placementLevel !== null);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [notice, setNotice] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [wantsNews, setWantsNews] = useState(false);

  const signedIn = connection.mode === "cloud" && !!user;
  const steps = useMemo(
    () => onboardingSteps({ replay, cloudAvailable: isCloudConfigured, wantsPlacement, place: answers.place, signedIn, plus: account.plus }),
    [replay, wantsPlacement, answers.place, signedIn, account.plus],
  );
  const [position, setPosition] = useState<OnboardingPosition>(() => resumePosition(saved?.position ?? null, steps));
  const { step, slide } = position;

  // Saved as it goes, so a closed app resumes here.
  useEffect(() => {
    if (!replay) saveOnboardingProgress(position, answers);
  }, [replay, position, answers]);

  const update = (patch: Partial<OnboardingAnswers>) => setAnswers((current) => ({ ...current, ...patch }));

  const moveTo = (next: OnboardingPosition, way: 1 | -1) => {
    setNotice(null);
    setDirection(way);
    setPosition(next);
  };

  const back = previousPosition(position, steps);
  const goBack = () => {
    if (back) moveTo(back, -1);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (back) moveTo(back, -1);
      return true;
    });
    return () => subscription.remove();
  });

  const leave = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    setPref("dailyGoal", answers.minutes);
    updateReminders({ daily: answers.remindersOn, time: answers.reminderTime });
    await rememberLearnLevel(startingLevel(answers));
    if (signedIn) {
      const patch = { practiceFocus: focusForGoal(answers.goal), practiceCadence: cadenceForMinutes(answers.minutes), ...(replay ? {} : { onboardingCompleted: true }) };
      if (!replay || patch.practiceFocus !== profile.practiceFocus || patch.practiceCadence !== profile.practiceCadence) await updateProfile(patch).catch(() => {});
      if (wantsNews) setNewsletter(true).catch(() => {});
    }
    haptics.success();
    // Keeps the first run's date; on a first run the navigator then swaps
    // onboarding for the app.
    completeOnboarding(answers);
    if (replay) leave();
  }

  const advance = async () => {
    const next = nextPosition(position, steps);
    if (next) moveTo(next, 1);
    else await finish();
  };

  const skip = () => {
    if (step === "welcome") {
      const next = afterWelcome(steps);
      if (next) moveTo(next, 1);
      return;
    }
    if (step === "placement") setWantsPlacement(false);
    void advance();
  };

  async function turnOnReminders() {
    const allowed = await askForNotifications();
    update({ remindersOn: allowed });
    if (!allowed) {
      haptics.warning();
      setNotice("Notifications are off for Cadence. You can turn them on later in Settings.");
      return;
    }
    await advance();
  }

  // An account made on the account step moves straight on to Plus when Plus
  // comes next (worked out as the steps will be once signed in). As the last
  // step it stays on "You're signed in", whose button finishes setup once the
  // new account is in place.
  function afterSigningIn() {
    const next = nextPosition(position, onboardingSteps({ replay, cloudAvailable: isCloudConfigured, wantsPlacement, place: answers.place, signedIn: true, plus: account.plus }));
    if (next) moveTo(next, 1);
  }

  async function continueFromPlace() {
    if (answers.place === "cloud" && connection.mode !== "cloud") await connection.chooseCloud();
    await advance();
  }

  const placeReady = answers.place === "cloud" || (answers.place === "own" && connection.mode === "local" && connection.paired);

  let body: ReactNode = null;
  let primary: { label: string; onPress: () => void; disabled?: boolean } | null = { label: "Continue", onPress: () => void advance() };
  let secondary: { label: string; onPress: () => void } | null = null;

  switch (step) {
    case "welcome":
      body = <IntroSlide index={slide} />;
      primary = { label: slide === 0 ? (replay ? "Start" : "Get started") : "Continue", onPress: () => void advance() };
      break;
    case "goal":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading compact={compact} title="What brings you to Cadence?" detail="We'll start your practice there." />
          <View accessibilityRole="radiogroup" style={[styles.choices, compact && styles.choicesCompact]}>
            {LEARNING_GOALS.map((goal) => (
              <ChoiceCard key={goal.value} compact={compact} title={goal.title} detail={goal.detail} selected={answers.goal === goal.value} onPress={() => update({ goal: goal.value })} />
            ))}
          </View>
        </View>
      );
      primary = { label: "Continue", onPress: () => void advance(), disabled: answers.goal === null };
      break;
    case "level":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading compact={compact} title="How is your English now?" detail="A rough guess is fine." />
          <View accessibilityRole="radiogroup" style={[styles.choices, compact && styles.choicesCompact]}>
            {SELF_CHECK_LEVELS.map((level) => (
              <ChoiceCard key={level.value} compact={compact} title={level.title} detail={level.detail} selected={answers.level === level.value} onPress={() => update({ level: level.value })} />
            ))}
          </View>
        </View>
      );
      primary = { label: "Continue", onPress: () => void advance(), disabled: answers.level === null && answers.placementLevel === null };
      secondary = {
        label: "Not sure? Take the placement test",
        onPress: () => {
          setWantsPlacement(true);
          moveTo({ step: "placement", slide: 0 }, 1);
        },
      };
      break;
    case "placement":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading compact={compact} title="Placement test" detail="Adaptive: 12 to 24 questions, about five minutes." />
          <PlacementTest result={answers.placementLevel} onDone={(outcome) => update({ placementLevel: outcome.level })} />
        </View>
      );
      primary = answers.placementLevel ? { label: "Continue", onPress: () => void advance() } : null;
      break;
    case "minutes":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading compact={compact} title="Your daily goal" detail="Minutes of practice a day. Change it any time." />
          <View accessibilityRole="radiogroup" style={[styles.choices, compact && styles.choicesCompact]}>
            {DAILY_GOAL_OPTIONS.map((minutes) => (
              <ChoiceCard key={minutes} compact={compact} title={`${minutes} minutes`} detail={MINUTES_DETAIL[minutes]} selected={answers.minutes === minutes} onPress={() => update({ minutes })} />
            ))}
          </View>
        </View>
      );
      break;
    case "reminders":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <ArtHeader art="reminders" />
          <StepHeading compact={compact} title="When should we remind you?" detail="One short reminder a day, skipped once your goal is met." />
          <TimePicker value={answers.reminderTime} onChange={(reminderTime) => update({ reminderTime })} />
        </View>
      );
      primary = { label: replay && answers.remindersOn ? "Keep reminders on" : "Turn on reminders", onPress: () => void turnOnReminders() };
      secondary = {
        label: replay && answers.remindersOn ? "Turn reminders off" : "Not now",
        onPress: () => {
          update({ remindersOn: false });
          void advance();
        },
      };
      break;
    case "where":
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading compact={compact} title="Where should Cadence run?" detail="Lessons, quizzes and flashcards work on this phone either way." />
          <View accessibilityRole="radiogroup" style={[styles.choices, compact && styles.choicesCompact]}>
            {isCloudConfigured ? (
              <ChoiceCard
                compact={compact}
                icon={(selected) => <Cloud color={selected ? colors.snow : colors.hunter} size={22} />}
                title="Cadence cloud"
                detail="Works on any network with a free account. Cloud AI practice comes with Cadence Plus."
                selected={answers.place === "cloud"}
                onPress={() => update({ place: "cloud" })}
              />
            ) : null}
            <ChoiceCard
              compact={compact}
              icon={(selected) => <Laptop color={selected ? colors.snow : colors.hunter} size={22} />}
              title="Connect your own Cadence server"
              detail="Cadence on your computer scores your voice and runs the coach over your home Wi-Fi. Free and open source."
              selected={answers.place === "own"}
              onPress={() => update({ place: "own" })}
            />
          </View>
          {answers.place === "own" ? (
            <View style={styles.ownServer}>
              {connection.mode === "local" && connection.paired ? (
                <Body size={type.callout}>
                  {connection.state.status === "connected" ? `Connected to ${connection.state.serverName}.` : "Paired. Cadence finds your computer whenever it is on the same Wi-Fi."}
                </Body>
              ) : (
                <>
                  <Body size={type.callout}>On your computer, open Cadence, choose Connect a Phone, and scan the code it shows. Always free.</Body>
                  <Button label="Scan the code" variant="neutral" onPress={() => router.push("/connect/scan")} />
                </>
              )}
            </View>
          ) : null}
        </View>
      );
      primary = { label: "Continue", onPress: () => void continueFromPlace(), disabled: !placeReady };
      break;
    case "account": {
      const optional = accountOptional(answers.place);
      body = (
        <View style={[styles.section, compact && styles.sectionCompact]}>
          <StepHeading
            compact={compact}
            title={signedIn ? "You're signed in" : optional ? "Keep your progress in sync" : "Create your free account"}
            detail={signedIn || (typing && compact) ? undefined : optional ? "A free account keeps a summary of your progress across devices." : "Cadence cloud keeps your progress with your account."}
          />
          <AccountStep
            signedInEmail={signedIn ? (user?.email ?? "your account") : null}
            optional={optional}
            afterAccount={async ({ newsletter: news }) => {
              setWantsNews(news);
              if (connection.mode !== "cloud") await connection.chooseCloud({ keepServer: true });
              afterSigningIn();
            }}
          />
        </View>
      );
      primary = signedIn ? { label: nextPosition(position, steps) ? "Continue" : "Start practising", onPress: () => void advance() } : null;
      break;
    }
    case "paywall":
      body = <PlusPaywall compact onDone={() => void finish()} doneLabel="Not now" />;
      primary = null;
      break;
  }

  const isLast = nextPosition(position, steps) === null;
  if (primary && isLast && primary.label === "Continue") primary = { ...primary, label: replay ? "Save" : "Start practising" };
  if (finishing && primary) primary = { ...primary, disabled: true };

  // An optional account is skipped from the top bar like any other step, so
  // the form keeps the whole screen.
  const accountSkippable = step === "account" && !signedIn && accountOptional(answers.place);
  // Plus is always optional: "Not now" sits in the top bar, so the step fits one screen.
  const paywallSkip = step === "paywall" && !account.plus;
  const stepKey = step === "welcome" ? `welcome-${slide}` : step;

  return (
    <FitScreen
      bodyKey={stepKey}
      header={
        <OnboardingTopBar
          current={progressIndex(position, steps)}
          total={steps.length}
          onBack={back ? goBack : undefined}
          onSkip={!replay && (SKIPPABLE.has(step) || accountSkippable) ? skip : paywallSkip ? () => void finish() : undefined}
          skipLabel={paywallSkip ? "Not now" : undefined}
          onClose={replay ? leave : undefined}
        />
      }
      bodyStyle={styles.body}
      footer={
        notice || primary || secondary ? (
          <>
            {notice ? <Banner tone="info" message={notice} actionLabel="Continue" onAction={() => void advance()} /> : null}
            {primary ? <Button label={primary.label} disabled={primary.disabled} loading={finishing && isLast} onPress={primary.onPress} /> : null}
            {secondary ? <QuietButton label={secondary.label} onPress={secondary.onPress} /> : null}
          </>
        ) : null
      }>
      <StepTransition key={stepKey} direction={direction}>
        {body}
      </StepTransition>
    </FitScreen>
  );
}

/** The quieter second choice under the primary button: text only, a full 44 pt target. */
function QuietButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.quiet, pressed && styles.quietPressed]}>
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.quietLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function ArtHeader({ art }: { art: IllustrationName }) {
  const { width, height } = useWindowDimensions();
  const size = Math.round(Math.min(width * 0.45, height * 0.18, 200));
  return (
    <View style={styles.artHeader}>
      <Illustration name={art} size={size} />
    </View>
  );
}

function IntroSlide({ index }: { index: number }) {
  const slide = SLIDES[Math.min(SLIDES.length - 1, Math.max(0, index))];
  const { width, height } = useWindowDimensions();
  const size = Math.round(Math.min(width - 96, height * 0.34, 340));
  return (
    <View style={styles.slide}>
      <View style={styles.slideArt}>
        <Illustration name={slide.art} size={size} />
      </View>
      <View style={styles.slideText}>
        <Title size={height < 740 ? type.title2 : type.title1} style={{ color: colors.carbon }}>{slide.title}</Title>
        <Body size={type.body} tone="muted">
          {slide.body}
        </Body>
      </View>
      <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${SLIDES.length}`} accessible>
        {SLIDES.map((item, i) => (
          <View key={item.art} style={[styles.dot, i === index && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

/** A step arriving: a short slide from the side it came from and a fade. */
function StepTransition({ children, direction }: { children: ReactNode; direction: 1 | -1 }) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: reduceMotion ? 120 : 260, easing: Easing.out(Easing.cubic) });
  }, [progress, reduceMotion]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: reduceMotion ? 0 : (1 - progress.value) * 24 * direction }],
  }));
  return <Animated.View style={[styles.transition, style]}>{children}</Animated.View>;
}

const styles = themed(() =>
  StyleSheet.create({
    body: { paddingTop: spacing.lg },
    transition: { flexGrow: 1 },
    section: { gap: spacing.xl },
    // Short phones: six answers, the heading and the footer still fit an iPhone SE.
    sectionCompact: { gap: spacing.lg },
    choices: { gap: spacing.sm },
    choicesCompact: { gap: spacing.xs + spacing.xxs },
    ownServer: { gap: spacing.md },
    artHeader: { alignItems: "center" },
    slide: { flexGrow: 1, justifyContent: "center", gap: spacing.xl },
    slideArt: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.lg, borderRadius: radii.cardLarge, backgroundColor: colors.platinum },
    slideText: { gap: spacing.sm },
    dots: { flexDirection: "row", gap: spacing.sm, justifyContent: "center" },
    dot: { width: 8, height: 8, borderRadius: radii.pill, backgroundColor: colors.alabaster },
    dotOn: { width: 20, backgroundColor: colors.hunter },
    quiet: { minHeight: TAP_TARGET, alignItems: "center", justifyContent: "center", borderRadius: radii.control },
    quietPressed: { opacity: 0.6 },
    quietLabel: { fontFamily: fonts.bodySemiBold, fontSize: type.body, color: colors.hunter, textAlign: "center" },
  }),
);
