// First-run setup (src/components/onboarding/OnboardingFlow.tsx). Shown once
// per phone, before anything else; the root navigator removes it when done.
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";

export default function OnboardingScreen() {
  return <OnboardingFlow />;
}
