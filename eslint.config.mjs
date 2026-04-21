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
  ]),

  // ─── Modular Architecture Boundaries ──────────────────────────
  // Modules must communicate ONLY through their public api/index.ts.
  // Direct imports into domain/, data/, or events/ of ANY module are forbidden.
  // Phase: 'warn' during migration → change to 'error' after full migration.
  {
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          patterns: [
            {
              group: ["@/modules/*/domain", "@/modules/*/domain/*"],
              message:
                "Cross-module import into domain/ is forbidden. Use the module public API: import from '@<module>' instead.",
            },
            {
              group: ["@/modules/*/data", "@/modules/*/data/*"],
              message:
                "Cross-module import into data/ is forbidden. Use the module public API: import from '@<module>' instead.",
            },
            {
              group: ["@/modules/*/events", "@/modules/*/events/*"],
              message:
                "Cross-module import into events/ is forbidden. Use the module public API or @core/event-bus instead.",
            },
            {
              group: ["@/modules/*/*/__tests__", "@/modules/*/__tests__/*"],
              message: "Never import from test files in production code.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
