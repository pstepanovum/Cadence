// FILE: mobile/src/components/auth/SignInOptions.tsx
//
// Every way in, on one screen: Apple, then Google (each by its maker's button
// guidelines), then email and password. Used by the sign-in and sign-up
// screens and by the account step of first-run setup, so all three behave the
// same. While the keyboard is up only the email form shows, so the fields and
// the button stay above it on an iPhone SE.
import * as AppleAuthentication from "expo-apple-authentication";
import { Check } from "lucide-react-native";
import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type TextInput } from "react-native";
import { SvgXml } from "react-native-svg";

import { useKeyboardVisible } from "@/components/auth/layout";
import { Banner, Body, Button, TextField, TextLink } from "@/components/ui";
import { describeAuthError, isCancelledSignIn } from "@/copy/auth-errors";
import { LOGO_GREEN_DARK } from "@/data/svg";
import { config } from "@/lib/config";
import {
  clearPendingLink,
  createAccountWithEmail,
  LinkAfterSignInError,
  ProviderUnavailableError,
  signInWithEmail,
  signInWithProvider,
  usePendingLink,
  useProviderButtons,
  type ProviderMethod,
} from "@/lib/firebase-providers";
import { haptics } from "@/lib/haptics";
import { continueLabel, pendingLinkMessage } from "@/platform/sign-in-methods";
import { colors, currentScheme, fonts, maxScale, radii, spacing, TAP_TARGET, type, themed } from "@/theme/theme";

export const MIN_PASSWORD = 8;

/**
 * A text field drawn the way the design system draws fields on a plain page:
 * a flat platinum fill with no stroke, and a hunter ring only while focused.
 */
export function AuthField({ ref, onFocus, onBlur, style, ...props }: React.ComponentProps<typeof TextField>) {
  const [focused, setFocused] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[styles.field, focused && styles.fieldFocused, style]}
    />
  );
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The Cadence wordmark in the page's brand colour (hunter, lime in dark mode). */
export function Wordmark({ width = 132 }: { width?: number }) {
  return <SvgXml xml={LOGO_GREEN_DARK.replaceAll("#A7C957", colors.hunter)} width={width} height={Math.round((width * 82) / 334)} accessibilityLabel="Cadence" />;
}

/** One line under the form in a test build, so nobody mistakes it for the store app. */
export function TestBuildNote() {
  if (!config.authEmulator) return null;
  return (
    <Body size={type.caption} tone="muted" style={styles.center}>
      {`Test build · sign-in goes to the emulator at ${config.authEmulator}`}
    </Body>
  );
}

export type AuthIntent = "signin" | "signup";

export interface SignedIn {
  /** True for a new email account. */
  created: boolean;
  /** The product-news box, ticked only by the person. */
  newsletter: boolean;
}

export function SignInOptions({
  intent,
  onSignedIn,
  onIntentChange,
  forgotHref,
  testIDPrefix = "auth",
}: {
  intent: AuthIntent;
  /** Runs once the account exists; a failure there is shown like a sign-in failure. */
  onSignedIn?: (result: SignedIn) => Promise<void> | void;
  /** Switch between sign in and create inline (the setup step); the screens link instead. */
  onIntentChange?: (next: AuthIntent) => void;
  forgotHref?: "/forgot-password";
  testIDPrefix?: string;
}) {
  const providers = useProviderButtons();
  const pending = usePendingLink();
  const typing = useKeyboardVisible();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [news, setNews] = useState(false);
  const [busy, setBusy] = useState<ProviderMethod | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const creating = intent === "signup";
  const trimmed = email.trim();
  const emailOk = EMAIL.test(trimmed);
  const canSubmit = emailOk && (creating ? password.length >= MIN_PASSWORD : password.length > 0);
  const missing = MIN_PASSWORD - password.length;

  function fail(cause: unknown, fallback: string) {
    if (isCancelledSignIn(cause)) return;
    haptics.error();
    if (cause instanceof ProviderUnavailableError || cause instanceof LinkAfterSignInError) setError(cause.message);
    else setError(describeAuthError(cause, fallback, { emulator: config.authEmulator }));
  }

  async function withProvider(method: ProviderMethod) {
    if (busy) return;
    setBusy(method);
    setError(null);
    try {
      const outcome = await signInWithProvider(method);
      if (outcome === "signed-in") {
        await onSignedIn?.({ created: false, newsletter: false });
        haptics.success();
      } else if (outcome === "link-needed") {
        haptics.warning();
      }
    } catch (cause) {
      fail(cause, `Couldn't sign in with ${method === "apple.com" ? "Apple" : "Google"}. Try again.`);
    } finally {
      setBusy(null);
    }
  }

  async function withEmail() {
    if (busy) return;
    if (!canSubmit) {
      haptics.error();
      setError(!emailOk ? "Enter your email address." : creating ? `Choose a password of at least ${MIN_PASSWORD} characters.` : "Enter your password.");
      return;
    }
    setBusy("email");
    setError(null);
    try {
      if (creating) await createAccountWithEmail(trimmed, password);
      else await signInWithEmail(trimmed, password);
      await onSignedIn?.({ created: creating, newsletter: creating && news });
      haptics.success();
    } catch (cause) {
      fail(cause, creating ? "Couldn't create your account. Try again." : "Couldn't sign in. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const disabled = busy !== null;

  return (
    <View style={styles.root}>
      {pending ? <Banner tone="info" message={pendingLinkMessage(pending)} actionLabel="Cancel" onAction={clearPendingLink} /> : null}

      {!typing && providers.length > 0 ? (
        <View style={styles.providers}>
          {providers.map((method) =>
            method === "apple.com" ? (
              <AppleButton key={method} intent={intent} busy={busy === method} disabled={disabled} onPress={() => void withProvider(method)} />
            ) : (
              <GoogleButton key={method} intent={intent} busy={busy === method} disabled={disabled} onPress={() => void withProvider(method)} />
            ),
          )}
          <View style={styles.divider} accessible={false} importantForAccessibility="no-hide-descendants">
            <View style={styles.rule} />
            <Text maxFontSizeMultiplier={maxScale.label} style={styles.or}>
              or
            </Text>
            <View style={styles.rule} />
          </View>
        </View>
      ) : null}

      <View style={styles.fields}>
        <AuthField
          testID={`${testIDPrefix}-email`}
          accessibilityLabel="Email"
          placeholder="Email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={creating ? "username" : "emailAddress"}
          keyboardType="email-address"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          value={email}
          onChangeText={setEmail}
          editable={!disabled}
        />
        <AuthField
          ref={passwordRef}
          testID={`${testIDPrefix}-password`}
          accessibilityLabel="Password"
          placeholder={creating ? `Password, at least ${MIN_PASSWORD} characters` : "Password"}
          secureTextEntry
          autoComplete={creating ? "new-password" : "current-password"}
          // A test build skips iOS's strong-password offer, which covers the
          // field and swallows the automated flows' typing on the simulator.
          textContentType={creating && !config.testBuild ? "newPassword" : "password"}
          returnKeyType="go"
          onSubmitEditing={() => void withEmail()}
          value={password}
          onChangeText={setPassword}
          editable={!disabled}
        />
        {creating && password.length > 0 && missing > 0 ? (
          <Body size={type.caption} tone="muted">
            {`${missing} more ${missing === 1 ? "character" : "characters"} to go.`}
          </Body>
        ) : null}
      </View>

      {creating ? <NewsCheckbox checked={news} onChange={setNews} /> : null}

      {error ? (
        <View accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Body size={type.footnote} weight="medium" tone="error" style={styles.center}>
            {error}
          </Body>
        </View>
      ) : null}

      <Button
        label={creating ? "Create account" : "Sign in"}
        loading={busy === "email"}
        disabled={disabled && busy !== "email"}
        onPress={() => void withEmail()}
      />

      {!creating && forgotHref && !typing ? (
        <View style={styles.centerRow}>
          <TextLink label="Forgot your password?" href={forgotHref} />
        </View>
      ) : null}
      {onIntentChange && !typing ? (
        <View style={styles.switchRow}>
          <Body size={type.footnote} tone="muted">
            {creating ? "Already have an account?" : "New to Cadence?"}
          </Body>
          <TextLink
            label={creating ? "Sign in" : "Create one"}
            onPress={() => {
              setError(null);
              onIntentChange(creating ? "signin" : "signup");
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function NewsCheckbox({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel="Send me product news and offers"
      onPress={() => {
        haptics.select();
        onChange(!checked);
      }}
      style={styles.checkRow}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Check color={colors.snow} size={15} strokeWidth={3} /> : null}</View>
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.checkLabel}>
        Send me product news and offers
      </Text>
    </Pressable>
  );
}

const BUTTON_HEIGHT = 50;

/** Apple's own button: black on light, white on dark, the app's corner radius. */
function AppleButton({ intent, busy, disabled, onPress }: { intent: AuthIntent; busy: boolean; disabled: boolean; onPress: () => void }) {
  if (Platform.OS !== "ios") return null;
  return (
    <View style={[styles.providerButton, (disabled || busy) && styles.dim]} pointerEvents={disabled ? "none" : "auto"}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={intent === "signup" ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={currentScheme() === "dark" ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={radii.control}
        style={styles.fillButton}
        onPress={() => {
          haptics.tap();
          onPress();
        }}
      />
    </View>
  );
}

// Google's "G", unaltered, from the Sign in with Google branding guidelines.
export const GOOGLE_G = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

/** The Apple logo (Simple Icons, CC0), for listing Apple as a sign-in method. */
export function appleLogo(fill: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>`;
}

/** Google's neutral button: a flat #F2F2F2 fill with no stroke, the full-colour G and "Sign in with Google". */
function GoogleButton({ intent, busy, disabled, onPress }: { intent: AuthIntent; busy: boolean; disabled: boolean; onPress: () => void }) {
  const label = continueLabel("google.com", intent);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.providerButton, styles.google, (disabled || busy) && styles.dim, pressed && styles.pressed]}>
      <SvgXml xml={GOOGLE_G} width={18} height={18} />
      <Text maxFontSizeMultiplier={maxScale.control} style={styles.googleLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    root: { gap: spacing.md },
    center: { textAlign: "center" },
    providers: { gap: spacing.sm },
    providerButton: { height: BUTTON_HEIGHT, borderRadius: radii.control, overflow: "hidden" },
    fillButton: { width: "100%", height: BUTTON_HEIGHT },
    google: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm + 2, backgroundColor: "#F2F2F2", paddingHorizontal: spacing.lg },
    // Google's guidelines: Roboto Medium 14/20 in #1F1F1F; the app's medium face stands in.
    googleLabel: { fontFamily: fonts.bodySemiBold, fontSize: 17, color: "#1F1F1F", letterSpacing: 0.1 },
    dim: { opacity: 0.55 },
    pressed: { opacity: 0.85 },
    divider: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingTop: spacing.xs },
    rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.alabaster },
    or: { fontFamily: fonts.body, fontSize: type.footnote, color: colors.slate },
    fields: { gap: spacing.sm },
    field: { backgroundColor: colors.platinum, borderColor: colors.platinum },
    fieldFocused: { borderColor: colors.hunter },
    centerRow: { alignItems: "center" },
    checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: TAP_TARGET },
    box: { width: 24, height: 24, borderRadius: 7, backgroundColor: colors.platinum, alignItems: "center", justifyContent: "center" },
    boxOn: { backgroundColor: colors.hunter },
    checkLabel: { flex: 1, fontFamily: fonts.body, fontSize: type.callout, color: colors.iron },
    switchRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "center", columnGap: spacing.sm },
  }),
);
