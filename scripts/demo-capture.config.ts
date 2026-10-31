import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".", testMatch: "demo-capture.spec.ts", workers: 1, timeout: 120_000,
  use: { headless: true, viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--no-sandbox", "--disable-dev-shm-usage"] } },
});
