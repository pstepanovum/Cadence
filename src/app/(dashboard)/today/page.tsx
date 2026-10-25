// FILE: src/app/(dashboard)/today/page.tsx
import type { Metadata } from "next";
import { TodayPlan } from "@/components/advanced/TodayPlan";
import { AppPage } from "@/components/ui/app-page";

export const metadata: Metadata = { title: "Today", description: "Today's plan: reviews, plateau drills, phrases and slang." };

export default function TodayPage() {
  return (
    <AppPage current="phrases">
      <TodayPlan />
    </AppPage>
  );
}
