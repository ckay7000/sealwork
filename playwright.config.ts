import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  timeout: 60000,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "reports/browser.json" }]],
  use: {
    baseURL: process.env.SEALWORK_TEST_URL || "http://127.0.0.1:5190",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      executablePath: process.env.SEALWORK_CHROMIUM_PATH,
    },
  },
  webServer: process.env.SEALWORK_TEST_URL
    ? undefined
    : {
        command: "npm run dev",
        url: "http://127.0.0.1:5190/api/health",
        reuseExistingServer: true,
        timeout: 60000,
      },
});
