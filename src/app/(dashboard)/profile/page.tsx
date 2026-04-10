// FILE: src/app/profile/page.tsx
import type { Metadata } from "next";
import Image from "next/image";
import { UserCircle } from "griddy-icons";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { ProfileCoachVoice } from "@/components/audio/ProfileCoachVoice";
import { ProfileDesktopRuntime } from "@/components/desktop/profile-desktop-runtime";
import { CancelSubscriptionButton } from "@/components/auth/CancelSubscriptionButton";
import { requireAppUser } from "@/lib/app-session";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";

export const metadata: Metadata = {
  title: "Settings",
  robots: { index: false, follow: false },
};

const focusLabel: Record<string, string> = {
  conversations: "Conversation confidence",
  vowels:        "Short and long vowel control",
  work:          "Clearer speaking at work",
  daily:         "Daily speaking fluency",
};

const cadenceLabel: Record<string, string> = {
  "5-minutes":    "5 min / day",
  "15-minutes":   "15 min / day",
  "30-minutes":   "30 min / day",
  "weekend-only": "Few times a week",
};

function trialDaysLeft(trialEnd: string | undefined): number | null {
  if (!trialEnd) return null;
  const diff = new Date(trialEnd).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export default async function ProfilePage() {
  const session = await requireAppUser("/profile");
  const runtime = await getRequestRuntime();
  const isDesktop = runtime === "desktop";
  const meta = session.user.meta;
  const isLocal = session.mode === "local";
  const displayName = session.user.displayName;
  const practiceFocus = session.user.practiceFocus ?? undefined;
  const practiceCadence = session.user.practiceCadence ?? undefined;
  const subStatus = isLocal
    ? undefined
    : (meta.stripe_subscription_status as string | undefined);
  const trialEnd = isLocal ? undefined : (meta.stripe_trial_end as string | undefined);
  const daysLeft        = trialDaysLeft(trialEnd);
  const isTrialing        = subStatus === "trialing";
  const isActive          = subStatus === "active";
  const isCancelingAtEnd  = isLocal
    ? false
    : (meta.stripe_cancel_at_period_end as boolean | undefined);
  const cancelAt = isLocal
    ? null
    : (meta.stripe_cancel_at as string | null | undefined);

  const memberSince = new Date(session.user.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  const trialEndFormatted = trialEnd
    ? new Date(trialEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="profile" />

        <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">

          {/* ── Left — identity + stats ─────────────────────────────────── */}
          <Card className="bg-white">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full bg-vanilla-cream px-4 py-2 text-hunter-green">
                <UserCircle size={18} color="currentColor" />
                <span className="eyebrow text-sm">Settings</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-hunter-green sm:text-4xl lg:text-5xl">
                  {displayName}
                </h1>
                {session.user.email ? (
                  <p className="text-base text-iron-grey">{session.user.email}</p>
                ) : (
                  <p className="text-base text-iron-grey">Local profile only</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                  <p className="eyebrow text-xs text-sage-green">Plan</p>
                  <p className="mt-2 text-base font-semibold text-hunter-green">
                    {isLocal ? "Local mode" : "Cadence Cloud"}
                  </p>
                </div>
                <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                  <p className="eyebrow text-xs text-sage-green">Status</p>
                  <p className="mt-2 text-base font-semibold text-hunter-green">
                    {isLocal
                      ? "Stored on this machine"
                      : isTrialing
                        ? "Trial"
                        : isActive
                          ? "Active"
                          : (subStatus ?? "—")}
                  </p>
                </div>
                <div className="rounded-3xl bg-vanilla-cream px-4 py-4">
                  <p className="eyebrow text-xs text-sage-green">
                    {isTrialing && daysLeft !== null ? "Days left" : "Member since"}
                  </p>
                  <p className="mt-2 text-base font-semibold text-hunter-green">
                    {isTrialing && daysLeft !== null ? `${daysLeft} days` : memberSince}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Right — trial banner + preferences ──────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Trial / active banner */}
            {!isLocal && (isTrialing || isActive) && (
              <Card className="relative overflow-hidden bg-vanilla-cream">
                <div className="flex items-center justify-between gap-6">
                  <div className="space-y-1">
                    <p className="eyebrow text-xs text-sage-green">
                      {isTrialing ? "Free trial active" : "Subscription active"}
                    </p>
                    <p className="text-2xl font-semibold text-hunter-green">
                      {isTrialing && daysLeft !== null
                        ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left on your trial`
                        : "You're on Cadence Pro"}
                    </p>
                    {isTrialing && trialEndFormatted && (
                      <p className="text-sm leading-6 text-iron-grey">
                        Charged $14.99/mo on {trialEndFormatted}. Cancel any time.
                      </p>
                    )}
                  </div>
                  <Image
                    src="/illustration/following-your-dreams-1.svg"
                    alt=""
                    width={120}
                    height={110}
                    className="hidden shrink-0 select-none sm:block"
                  />
                </div>
              </Card>
            )}

            {/* Preferences */}
            <Card className="bg-white flex-1">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="eyebrow text-sm text-sage-green">Practice setup</p>
                  <h2 className="text-2xl font-semibold text-hunter-green">Your preferences</h2>
                </div>

                <div className="space-y-3">
                  <div className="rounded-3xl bg-vanilla-cream px-5 py-4">
                    <p className="text-xs text-iron-grey">Focus area</p>
                    <p className="mt-1 text-base font-semibold text-hunter-green">
                      {focusLabel[practiceFocus ?? ""] ?? "Not set"}
                    </p>
                  </div>
                  <div className="rounded-3xl bg-vanilla-cream px-5 py-4">
                    <p className="text-xs text-iron-grey">Daily cadence</p>
                    <p className="mt-1 text-base font-semibold text-hunter-green">
                      {cadenceLabel[practiceCadence ?? ""] ?? "Not set"}
                    </p>
                  </div>
                  <div className="rounded-3xl bg-vanilla-cream px-5 py-4">
                    <p className="text-xs text-iron-grey">Member since</p>
                    <p className="mt-1 text-base font-semibold text-hunter-green">{memberSince}</p>
                  </div>
                  {isLocal ? (
                    <div className="rounded-3xl bg-vanilla-cream px-5 py-4">
                      <p className="text-xs text-iron-grey">Storage</p>
                      <p className="mt-1 text-base font-semibold text-hunter-green">
                        Local only
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="pt-2 flex flex-col gap-4">
                  {!isLocal && (isTrialing || isActive) && (
                    <CancelSubscriptionButton
                      isCanceling={Boolean(isCancelingAtEnd)}
                      cancelAt={cancelAt ?? null}
                    />
                  )}
                  <SignOutButton mode={session.mode} />
                </div>
              </div>
            </Card>

          </div>
        </section>

        <ProfileCoachVoice />
        {isDesktop ? <ProfileDesktopRuntime /> : null}

      </div>
    </main>
  );
}
