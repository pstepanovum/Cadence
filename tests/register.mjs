// FILE: tests/register.mjs
//
// Node runs the TypeScript sources directly (type stripping, Node >= 22.6), but
// it resolves modules the way the ESM spec says to: no extension guessing, no
// tsconfig path aliases. The project's sources use both. This hook teaches the
// loader the two conventions so the pure pairing modules can be tested without
// a bundler or a build step.
//
// It is deliberately narrow: only "@/..." and extensionless relative
// specifiers, and only ".ts". Anything else resolves normally.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

// "@/" means mobile/src/ — the Expo app is the only place the alias appears in
// code this test run loads. The Next.js pairing modules import each other
// relatively so they need no alias.
const MOBILE_SRC = resolvePath(repoRoot, "mobile/src");

function firstExisting(basePath) {
  for (const candidate of [basePath, `${basePath}.ts`, `${basePath}/index.ts`]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = firstExisting(resolvePath(MOBILE_SRC, specifier.slice(2)));
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }

    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : repoRoot;
      const resolved = firstExisting(resolvePath(dirname(parentPath), specifier));
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }

    return nextResolve(specifier, context);
  },
});
