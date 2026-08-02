import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      "apps/web/vitest.config.ts",
      {
        test: {
          name: "node",
          include: ["packages/**/*.test.ts", "apps/api/**/*.test.ts"],
          exclude: ["**/node_modules/**", "**/e2e/**"],
          globalSetup: ["./packages/db/src/vitest-global-setup.ts"],
        },
      },
    ],
  },
});
