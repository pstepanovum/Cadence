// FILE: src/app/profile/page.tsx
import type { Metadata } from "next";
import { UserCircle } from "griddy-icons";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { Card } from "@/components/ui/card";
import { SignOutButton } from "@/components/ui/sign-out-button";
import { ProfileCoachVoice } from "@/components/audio/ProfileCoachVoice";
import { ProfileDesktopRuntime } from "@/components/desktop/profile-desktop-runtime";
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

export default async function ProfilePage() {
  const session = await requireAppUser("/profile");
  const runtime = await getRequestRuntime();
  const isDesktop = runtime === "desktop";
  const isLocal = session.mode === "local";
  const displayName = session.user.displayName;
  const practiceFocus = session.user.practiceFocus ?? undefined;
  const practiceCadence = session.user.practiceCadence ?? undefined;

  const memberSince = new Date(session.user.createdAt).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });

  return (
    <main className="min-h-screen p-4 sm:p-5 lg:p-6 flex flex-col items-center">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-4">
        <Navbar current="account" />

        <section className="grid gap-4 lg:grid-cols-[1.02fr_0.98fr]">

          {/* ── Left — identity + stats ─────────────────────────────────── */}
          <Card className="bg-white">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-[14px] bg-page px-4 py-2 text-carbon-black">
                <UserCircle size={18} color="currentColor" />
                <span className="eyebrow text-sm">Settings</span>
              </div>

              <div className="space-y-2">
                <h1 className="text-3xl font-semibold text-carbon-black sm:text-4xl lg:text-5xl">
                  {displayName}
                </h1>
                {session.user.email ? (
                  <p className="text-base text-iron-grey">{session.user.email}</p>
                ) : (
                  <p className="text-base text-iron-grey">Local profile only</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[20px] bg-page px-4 py-4">
                  <p className="eyebrow text-xs text-slate-grey">Plan</p>
                  <p className="mt-2 text-base font-semibold text-carbon-black">
                    {isLocal ? "Own computer" : "Cadence account"}
                  </p>
                </div>
                <div className="rounded-[20px] bg-page px-4 py-4">
                  <p className="eyebrow text-xs text-slate-grey">Status</p>
                  <p className="mt-2 text-base font-semibold text-carbon-black">
                    {isLocal ? "Stored on this machine" : "Synced"}
                  </p>
                </div>
                <div className="rounded-[20px] bg-page px-4 py-4">
                  <p className="eyebrow text-xs text-slate-grey">
                    Member since
                  </p>
                  <p className="mt-2 text-base font-semibold text-carbon-black">
                    {memberSince}
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* ── Right — trial banner + preferences ──────────────────────── */}
          <div className="flex flex-col gap-4">

            {/* Preferences */}
            <Card className="bg-white flex-1">
              <div className="space-y-4">
                <div className="space-y-1">
                  <p className="eyebrow text-sm text-slate-grey">Practice setup</p>
                  <h2 className="text-2xl font-semibold text-carbon-black">Your preferences</h2>
                </div>

                <div className="space-y-3">
                  <div className="rounded-[20px] bg-page px-5 py-4">
                    <p className="text-xs text-iron-grey">Focus area</p>
                    <p className="mt-1 text-base font-semibold text-carbon-black">
                      {focusLabel[practiceFocus ?? ""] ?? "Not set"}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-page px-5 py-4">
                    <p className="text-xs text-iron-grey">Daily cadence</p>
                    <p className="mt-1 text-base font-semibold text-carbon-black">
                      {cadenceLabel[practiceCadence ?? ""] ?? "Not set"}
                    </p>
                  </div>
                  <div className="rounded-[20px] bg-page px-5 py-4">
                    <p className="text-xs text-iron-grey">Member since</p>
                    <p className="mt-1 text-base font-semibold text-carbon-black">{memberSince}</p>
                  </div>
                  {isLocal ? (
                    <div className="rounded-[20px] bg-page px-5 py-4">
                      <p className="text-xs text-iron-grey">Storage</p>
                      <p className="mt-1 text-base font-semibold text-carbon-black">
                        Local only
                      </p>
                    </div>
                  ) : null}
                </div>

                <div className="pt-2 flex flex-col gap-4">
                  <Link href="/account" className="inline-flex min-h-11 w-fit items-center rounded-[14px] bg-page px-4 text-sm font-semibold text-carbon-black">
                    Plan, emails and data
                  </Link>
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
