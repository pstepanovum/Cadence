import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/app-session";
import { getModulesWithProgressForMode } from "@/lib/learn-data";
import { getLearnCatalog } from "@/lib/learn-catalog";
import type { ModuleWithProgress } from "@/lib/learn";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await getAppSession();
    const catalog = await getLearnCatalog();

    if (!session.mode || !session.user) {
      const result: ModuleWithProgress[] = catalog.modules.map((module) => ({
        ...module,
        progress: null,
      }));
      return NextResponse.json(result);
    }

    const result = await getModulesWithProgressForMode(
      session.mode,
      session.user.id,
    );
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch modules." },
      { status: 500 },
    );
  }
}
