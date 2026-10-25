// FILE: src/app/(dashboard)/today/page.tsx
import type { Metadata } from "next";
import { TodayPlan } from "@/components/advanced/TodayPlan";
import { AppPage } from "@/components/ui/app-page";
import { getAppSession } from "@/lib/app-session";

export const metadata: Metadata = { title: "Today", description: "Today's plan: reviews, plateau drills, phrases and slang." };

export default async function TodayPage() {
  const session = await getAppSession();
  return (
    <AppPage current="phrases">
      <TodayPlan goals={session.user?.learningGoals ?? []} />
    </AppPage>
  );
}
