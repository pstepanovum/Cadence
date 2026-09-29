import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "desktop/dist/**",
    "desktop/packages/**",
    // Python services: their virtualenvs vendor megabytes of bundled JS, which
    // ESLint would otherwise parse until it runs out of memory.
    "src/backend/**",
    // The Expo app lints itself with `npm run lint` inside mobile/.
    "mobile/**",
  ]),
]);

export default eslintConfig;
