import {
  FunnelDisplay_400Regular,
  FunnelDisplay_500Medium,
  FunnelDisplay_600SemiBold,
  FunnelDisplay_700Bold,
} from "@expo-google-fonts/funnel-display";
import { SourGummy_600SemiBold, SourGummy_700Bold } from "@expo-google-fonts/sour-gummy";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as SystemUI from "expo-system-ui";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, useColorScheme, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { unlockFirstModule } from "@/api/endpoints";
import { pruneReferenceAudioCache } from "@/audio/reference-audio";
import { Body, Button, Title } from "@/components/ui";
import { UpdateGate } from "@/components/UpdateNotice";
import { AccountProvider } from "@/context/account";
import { EngagementWatcher } from "@/components/EngagementWatcher";
import { cadenceForMinutes, focusForGoal } from "@/onboarding/flow";
import { markOnboardingDoneForExistingInstall, useOnboardingStatus } from "@/onboarding/store";
import { AuthProvider, useAuth } from "@/context/auth";
import { ConnectionProvider, useConnection } from "@/pairing/context";
import { applyColorScheme, colors, radii, shadows, spacing, type, themed } from "@/theme/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      // A phone changes network constantly; refetching when a screen is
      // focused again is cheaper than showing stale progress.
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * expo-router renders this instead of a red box when a screen throws. Without
 * it, a bad config value or a malformed API response is an unexplained crash
 * on a TestFlight build, where there is no dev overlay. It sits outside every
 * provider, so it cannot know the mode or the account; the copy works for both.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.boundary}>
      <View style={styles.boundaryCard}>
        <Title size={type.title2}>Something went wrong</Title>
        <Body size={type.callout}>
          This screen could not load. Try again, and if it keeps happening, close Cadence and open
          it again.
        </Body>
        {__DEV__ ? (
          <Body size={type.caption} tone="muted">
            {error.message}
          </Body>
        ) : null}
        <Button label="Try again" onPress={() => void retry()} />
      </View>
    </View>
  );
}

function RootNavigator() {
  const { user, loading, profileReady, profileError, retryProfile, signOut, profile, updateProfile } = useAuth();
  const { ready: connectionReady, mode, state } = useConnection();
  const onboarding = useOnboardingStatus();

  // Local mode has no account: the paired device token *is* the identity, so
  // being connected to a computer is what "signed in" means there.
  const local = mode === "local";
  const cloudSignedIn = mode === "cloud" && !!user;

  // First-run setup is the phone's, and shows once. An install from before it
  // existed has already chosen how to practise, so it counts as done.
  const existingInstall = onboarding.loaded && connectionReady && onboarding.saved === null && mode !== null;
  useEffect(() => {
    if (existingInstall) markOnboardingDoneForExistingInstall();
  }, [existingInstall]);
  const needsOnboarding = onboarding.loaded && connectionReady && !onboarding.completed && !existingInstall;

  const inApp = !needsOnboarding && (local || (cloudSignedIn && profileReady));

  // Nothing chosen yet.
  const needsSetup = connectionReady && mode === null && !needsOnboarding;

  // The web app reads `onboardingCompleted` from the profile; an account that
  // signs in on a phone that already finished setup gets it set quietly.
  const markProfile = cloudSignedIn && profileReady && !profileError && onboarding.completed && !profile.onboardingCompleted;
  useEffect(() => {
    if (!markProfile) return;
    const answers = onboarding.saved?.answers;
    updateProfile({
      onboardingCompleted: true,
      ...(answers?.goal ? { practiceFocus: focusForGoal(answers.goal), practiceCadence: cadenceForMinutes(answers.minutes) } : {}),
    }).catch(() => {});
    // Once per account and phone; the profile flag stops it after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markProfile]);

  // New accounts have no progress rows at all, which renders module 1 as
  // locked and makes Learn a dead end. This is idempotent and cheap. In local
  // mode it has to wait for the computer to answer, or there is nowhere to
  // send it.
  const canReachServer = local ? state.status === "connected" : cloudSignedIn;

  useEffect(() => {
    if (!canReachServer) return;
    unlockFirstModule().catch(() => {
      // Best effort — the Learn screen offers a retry if it stays locked.
    });
  }, [canReachServer]);

  if (loading || !connectionReady || !onboarding.loaded) return null;

  if (cloudSignedIn && profileError && !needsOnboarding) {
    return (
      <View style={styles.boundary}>
        <View style={styles.boundaryCard}>
          <Title size={type.title2}>{"Can't load your profile"}</Title>
          <Body size={type.callout}>{profileError}</Body>
          <Button label="Try again" onPress={retryProfile} />
          <Button label="Sign out" variant="outline" onPress={() => void signOut()} />
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.cream },
        }}>
        {/* First-run setup comes before everything, once per phone. */}
        <Stack.Protected guard={needsOnboarding}>
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={!inApp && !needsSetup && !needsOnboarding}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={inApp}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="lesson/[lessonId]" />
          <Stack.Screen name="conversation/[slug]" />
          <Stack.Screen name="coach/session" />
          <Stack.Screen name="game" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="settings/index" />
          <Stack.Screen name="settings/voice" />
          <Stack.Screen name="settings/packs" />
          <Stack.Screen name="settings/onboarding" options={{ gestureEnabled: false }} />
          <Stack.Screen name="practice/[mode]" />
          <Stack.Screen name="practice/lesson/[lessonId]" />
          <Stack.Screen name="grammar/index" />
          <Stack.Screen name="grammar/[pointId]" />
          <Stack.Screen name="sounds/index" />
          <Stack.Screen name="sounds/[soundId]" />
          <Stack.Screen name="sounds/compare" />
          <Stack.Screen name="sounds/drill/[soundId]" />
          <Stack.Screen name="word/[wordId]" />
          <Stack.Screen name="badges" />
          <Stack.Screen name="plus" options={{ presentation: "modal" }} />
          <Stack.Screen name="account" />
        </Stack.Protected>
        {/*
          Not guarded: pairing stays reachable from setup and from Settings so a
          person can re-pair after moving computers. It is declared last on
          purpose — the first declared screen becomes the stack's initial route.
        */}
        <Stack.Screen name="connect" />
        <Stack.Screen name="pair" />
      </Stack>
      {inApp ? <EngagementWatcher /> : null}
    </>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { loading, profileReady, profileError } = useAuth();
  const { ready } = useConnection();

  // Hold the splash until the fonts are ready, the stored sign-in has been
  // restored *and* the keychain has been read for a paired computer. Hiding it
  // earlier shows an empty cream screen, or worse, flashes the setup screen at
  // someone who is already paired.
  const onboarding = useOnboardingStatus();
  useEffect(() => {
    if (!loading && ready && onboarding.loaded && (profileReady || profileError)) SplashScreen.hideAsync();
  }, [loading, ready, onboarding.loaded, profileReady, profileError]);

  return <>{children}</>;
}

export default function RootLayout() {
  // The tokens follow the system appearance; a change remounts the screens so
  // every one redraws with the new colours.
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  applyColorScheme(scheme);

  const [fontsLoaded, fontError] = useFonts({
    FunnelDisplay_400Regular,
    FunnelDisplay_500Medium,
    FunnelDisplay_600SemiBold,
    FunnelDisplay_700Bold,
    SourGummy_600SemiBold,
    SourGummy_700Bold,
  });

  useEffect(() => {
    pruneReferenceAudioCache();
  }, []);

  // The window behind modals and sheets follows the scheme too.
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.cream).catch(() => {});
  }, [scheme]);

  // A font that fails to download should not brick the app — render with the
  // system font rather than sitting on the splash screen forever.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <AuthProvider>
            <AccountProvider>
              <Gate>
                <StatusBar style={scheme === "dark" ? "light" : "dark"} />
                <UpdateGate key={scheme}>
                  <RootNavigator />
                </UpdateGate>
              </Gate>
            </AccountProvider>
          </AuthProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    boundary: {
      flex: 1,
      backgroundColor: colors.cream,
      justifyContent: "center",
      padding: spacing.lg,
    },
    boundaryCard: {
      borderRadius: radii.cardLarge,
      backgroundColor: colors.snow,
      padding: spacing.xl,
      gap: spacing.md,
      boxShadow: shadows.card,
    },
  }),
);
