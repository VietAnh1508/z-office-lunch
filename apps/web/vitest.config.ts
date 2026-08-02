import { mergeConfig, defineConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      name: "web",
      environment: "jsdom",
      environmentOptions: {
        jsdom: {
          url: "http://localhost:3000",
        },
      },
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      exclude: ["**/node_modules/**", "**/e2e/**"],
    },
  }),
);
