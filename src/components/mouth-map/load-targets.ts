// FILE: src/components/mouth-map/load-targets.ts
//
// Reads the articulation targets for the mouth map on the server:
// content/articulation/*.json when the content pipeline has committed them,
// otherwise the bundled placeholder (fixture-targets.json, every target marked
// needsReview). Each file is `{format: 1, targets: ArticulationTarget[]}`;
// invalid targets are dropped rather than drawn wrong.
import "server-only";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";
import fixture from "@/components/mouth-map/fixture-targets.json";
import { validateArticulationTarget, type ArticulationTarget } from "@/lib/platform/vocal-tract/index.ts";

export interface LoadedTargets {
  targets: ArticulationTarget[];
  /** True while the placeholder is in use. */
  fixture: boolean;
}

function accept(raw: unknown): ArticulationTarget[] {
  const body = raw as { format?: unknown; targets?: unknown };
  if (body?.format !== 1 || !Array.isArray(body.targets)) return [];
  return (body.targets as ArticulationTarget[]).filter((target) => validateArticulationTarget(target).length === 0);
}

export const loadArticulationTargets = cache(async (): Promise<LoadedTargets> => {
  // Shipped through outputFileTracingIncludes in next.config.ts; left to the
  // tracer, the dynamic file names matched every "content*" file in the repo.
  const dir = path.join(/* turbopackIgnore: true */ process.cwd(), "content", "articulation");
  try {
    const names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    const targets: ArticulationTarget[] = [];
    for (const name of names) {
      targets.push(...accept(JSON.parse(await readFile(path.join(/* turbopackIgnore: true */ dir, name), "utf8"))));
    }
    if (targets.length > 0) return { targets, fixture: false };
  } catch {
    // No committed targets yet; fall through to the placeholder.
  }
  return { targets: accept(fixture), fixture: true };
});
