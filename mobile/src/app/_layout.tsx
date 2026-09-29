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
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { unlockFirstModule } from "@/api/endpoints";
import { pruneReferenceAudioCache } from "@/audio/reference-audio";
import { Body, PillButton, Title } from "@/components/ui";
import { AuthProvider, useAuth } from "@/context/auth";
import { ConnectionProvider, useConnection } from "@/pairing/context";
import { colors, radii, spacing } from "@/theme/theme";

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
 * on a TestFlight build, where there is no dev overlay.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={styles.boundary}>
      <View style={styles.boundaryCard}>
        <Title size={22}>Cadence hit a snag</Title>
        <Body size={13}>
          Something went wrong while loading this screen. You can try again; if it keeps happening,
          signing out and back in usually clears it.
        </Body>
        <Body size={12} style={styles.boundaryDetail}>
          {error.message}
        </Body>
        <PillButton label="Try again" onPress={() => retry()} />
      </View>
    </View>
  );
}

function RootNavigator() {
  const { session, loading, profile } = useAuth();
  const { ready: connectionReady, mode, state } = useConnection();

  // Local mode has no account: the paired device token *is* the identity, so
  // being connected to a computer is what "signed in" means there.
  const local = mode === "local";
  const cloudSignedIn = !local && !!session;

  // Onboarding writes to a Supabase profile, so it only applies to cloud.
  const needsOnboarding = cloudSignedIn && !profile.onboardingCompleted;

  const inApp = local || (cloudSignedIn && !needsOnboarding);

  // Nothing chosen yet, and no legacy cloud session to fall back on.
  const needsSetup = connectionReady && mode === null && !session;

  // New accounts have no progress rows at all, which renders module 1 as
  // locked and makes Learn a dead end. This is idempotent and cheap. In local
  // mode it has to wait for the computer to answer, or there is nowhere to
  // send it.
  const canReachServer = local ? state.status === "connected" : !!session;

  useEffect(() => {
    if (!canReachServer) return;
    unlockFirstModule().catch(() => {
      // Best effort — the Learn screen offers a retry if it stays locked.
    });
  }, [canReachServer]);

  if (loading || !connectionReady) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.cream },
      }}>
      {/*
        `needsOnboarding` is excluded here as well as guarded below. Someone who
        is signed in but has not finished onboarding is not "in the app" either,
        so without this the auth group matches too, and its index redirect sends
        them straight back to sign-in — which makes onboarding unreachable for
        every new cloud account.
      */}
      <Stack.Protected guard={!inApp && !needsSetup && !needsOnboarding}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={needsOnboarding}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={inApp}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="lesson/[lessonId]" />
        <Stack.Screen name="conversation/[slug]" />
        <Stack.Screen name="coach/session" />
        <Stack.Screen name="settings/voice" />
      </Stack.Protected>
      {/*
        Not guarded: the setup flow stays reachable from Profile so a person can
        re-pair after moving computers. It is declared last on purpose — the
        first declared screen becomes the stack's initial route, and while it
        sat at the top it was the landing screen for everyone, including people
        who were already signed in and only needed onboarding.
      */}
      <Stack.Screen name="connect" />
    </Stack>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const { ready } = useConnection();

  // Hold the splash until the fonts are ready, the stored session has been
  // restored *and* the keychain has been read for a paired computer. Hiding it
  // earlier shows an empty cream screen, or worse, flashes the setup screen at
  // someone who is already paired.
  useEffect(() => {
    if (!loading && ready) SplashScreen.hideAsync();
  }, [loading, ready]);

  return <>{children}</>;
}

export default function RootLayout() {
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

  // A font that fails to download should not brick the app — render with the
  // system font rather than sitting on the splash screen forever.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ConnectionProvider>
          <AuthProvider>
            <Gate>
              <StatusBar style="dark" />
              <RootNavigator />
            </Gate>
          </AuthProvider>
        </ConnectionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
  },
  boundaryDetail: {
    color: colors.slate,
  },
});
