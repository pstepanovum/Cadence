// FILE: src/lib/pairing/learn-store.ts
//
// Local mode keeps learn progress in a browser cookie. A paired phone has no
// cookie jar we control, so its progress lives in one file in the server's data
// directory instead, shared by every device paired to this computer.
//
// The state format is exactly what local-learn.ts already serializes, so this
// file is pure storage: it never inspects or migrates the blob.
import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { resolveDataDir } from "./store";

function resolveLearnFile(): string {
  return join(resolveDataDir(), "learn-state.json");
}

let cached: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** The serialized state, or null when nothing has been stored yet. */
export function readDeviceLearnState(): Promise<string | null> {
  const run = queue.then(async () => {
    if (cached !== null) {
      return cached;
    }

    try {
      const contents = await readFile(resolveLearnFile(), "utf8");
      cached = contents;
      return contents;
    } catch {
      return null;
    }
  });

  queue = run.catch(() => undefined);
  return run;
}

export function writeDeviceLearnState(serialized: string): Promise<void> {
  const run = queue.then(async () => {
    const file = resolveLearnFile();
    await mkdir(dirname(file), { recursive: true });

    const temporary = `${file}.${process.pid}.tmp`;
    await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, file);

    cached = serialized;
  });

  queue = run.catch(() => undefined);
  return run;
}

export function resetDeviceLearnStateCache(): void {
  cached = null;
  queue = Promise.resolve();
}
