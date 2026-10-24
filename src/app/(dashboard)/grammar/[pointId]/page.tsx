// FILE: src/app/(dashboard)/grammar/[pointId]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GrammarPointView } from "@/components/learn-hub/GrammarPointView";
import { AppPage } from "@/components/ui/app-page";
import { isContentId } from "@/lib/platform/content-model.ts";

export const metadata: Metadata = { title: "Grammar" };

export default async function GrammarPointPage({ params }: { params: Promise<{ pointId: string }> }) {
  const pointId = decodeURIComponent((await params).pointId);
  if (!isContentId(pointId, "gp")) notFound();
  return (
    <AppPage current="practice">
      <GrammarPointView pointId={pointId} />
    </AppPage>
  );
}
