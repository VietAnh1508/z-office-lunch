import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/e2e/**"],
    globalSetup: ["./packages/db/src/vitest-global-setup.ts"],
    fileParallelism: false,
  },
});
