import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Get Started",
  robots: { index: false, follow: false },
};
import { getAppSession } from "@/lib/app-session";
import { OnboardingWizard } from "@/components/auth/OnboardingWizard";

export default async function OnboardingPage() {
  const session = await getAppSession();

  if (session.mode !== "cloud") {
    redirect("/setup");
  }

  if (!session.user) {
    redirect("/login");
  }

  // Skip onboarding if already completed
  if (session.user.onboardingCompleted) {
    redirect("/dashboard");
  }

  return (
    <main className="h-screen overflow-hidden bg-vanilla-cream">
      <OnboardingWizard />
    </main>
  );
}
