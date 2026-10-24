// FILE: src/app/(dashboard)/practice/[mode]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { modeById } from "@/components/learn-hub/modes";
import { parseLevel } from "@/components/learn-hub/modes";
import { PracticeSession } from "@/components/learn-hub/PracticeSession";
import { AppPage } from "@/components/ui/app-page";

interface Props {
  params: Promise<{ mode: string }>;
  searchParams: Promise<{ level?: string; gp?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: modeById((await params).mode)?.title ?? "Practice" };
}

export default async function PracticeModePage({ params, searchParams }: Props) {
  const { mode } = await params;
  if (!modeById(mode)) notFound();
  const query = await searchParams;
  const gp = typeof query.gp === "string" && /^gp\.[a-z0-9.-]{1,90}$/.test(query.gp) ? query.gp : null;
  return (
    <AppPage current="practice">
      <PracticeSession modeId={mode} initialLevel={parseLevel(query.level)} grammarPointId={gp} />
    </AppPage>
  );
}
