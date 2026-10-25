import type { Metadata } from "next";
import { SetupSelection } from "@/components/auth/SetupSelection";
import { getAppSession } from "@/lib/app-session";
import { getRequestRuntime } from "@/lib/runtime/request-runtime";
import { isCloudServerReady } from "@/lib/firebase/admin";
import { isFirebaseConfigured } from "@/lib/firebase/config";

export const metadata: Metadata = {
  title: "Choose Your Setup",
  robots: { index: false, follow: false },
};

interface SetupPageProps {
  searchParams: Promise<{
    next?: string;
  }>;
}

export default async function SetupPage({ searchParams }: SetupPageProps) {
  const [{ next }, runtime, session] = await Promise.all([
    searchParams,
    getRequestRuntime(),
    getAppSession(),
  ]);

  return (
    <main className="auth-page min-h-dvh px-4 py-5 sm:px-6">
      <SetupSelection
        runtime={runtime}
        nextPath={typeof next === "string" ? next : null}
        currentMode={session.mode}
        cloudAvailable={isFirebaseConfigured && isCloudServerReady()}
        currentDisplayName={session.user?.displayName ?? null}
      />
    </main>
  );
}
