import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Get Started",
  robots: { index: false, follow: false },
};
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "@/components/auth/OnboardingWizard";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Skip onboarding if already completed
  const completed = (user.user_metadata as Record<string, unknown> | null)
    ?.onboardingCompleted;
  if (completed) {
    redirect("/dashboard");
  }

  return (
    <main className="h-screen overflow-hidden bg-vanilla-cream">
      <OnboardingWizard />
    </main>
  );
}
