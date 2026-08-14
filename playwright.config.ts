import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    // A dedicated port, distinct from :8787 (pnpm dev / dev:hot) — with its
    // own port, `reuseExistingServer` can only ever reuse a server this same
    // e2e setup started, never a manually-run dev server pointed at the real
    // (non-test) database.
    command: "pnpm --filter web build && pnpm --filter api dev:e2e",
    url: "http://localhost:8788/api/health",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: "http://localhost:8788",
  },
});
