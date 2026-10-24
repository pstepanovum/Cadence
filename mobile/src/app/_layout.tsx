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
import { Body, Button, Title } from "@/components/ui";
import { AuthProvider, useAuth } from "@/context/auth";
import { ConnectionProvider, useConnection } from "@/pairing/context";
import { colors, radii, shadows, spacing, type } from "@/theme/theme";

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
  const { user, loading, profileReady, profileError, retryProfile, signOut, profile } = useAuth();
  const { ready: connectionReady, mode, state } = useConnection();

  // Local mode has no account: the paired device token *is* the identity, so
  // being connected to a computer is what "signed in" means there.
  const local = mode === "local";
  const cloudSignedIn = mode === "cloud" && !!user;

  // Onboarding writes to the cloud account's profile, so it only applies there.
  // Until the profile arrives neither applies, so a fresh sign-in stays on the
  // sign-in screen for that moment instead of flashing onboarding.
  const needsOnboarding = cloudSignedIn && profileReady && !profile.onboardingCompleted;

  const inApp = local || (cloudSignedIn && profileReady && profile.onboardingCompleted);

  // Nothing chosen yet.
  const needsSetup = connectionReady && mode === null;

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

  if (loading || !connectionReady) return null;

  if (cloudSignedIn && profileError) {
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
        <Stack.Screen name="game" />
        <Stack.Screen name="profile" />
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
  const { loading, profileReady, profileError } = useAuth();
  const { ready } = useConnection();

  // Hold the splash until the fonts are ready, the stored sign-in has been
  // restored *and* the keychain has been read for a paired computer. Hiding it
  // earlier shows an empty cream screen, or worse, flashes the setup screen at
  // someone who is already paired.
  useEffect(() => {
    if (!loading && ready && (profileReady || profileError)) SplashScreen.hideAsync();
  }, [loading, ready, profileReady, profileError]);

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
    boxShadow: shadows.card,
  },
});
