import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests run against the production build on port 3100 with an
 * in-memory leaderboard, so every run starts from an empty board.
 *
 * CHROMIUM_PATH points Playwright at an existing Chrome or Chromium when its
 * own download is unavailable (for example in a sandbox without CDN access).
 */
const executablePath = process.env.CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 }, launchOptions: { executablePath } } },
  ],
  webServer: {
    command: "npm run start:e2e",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    env: { LEADERBOARD_STORE: "memory", LEADERBOARD_SUBMIT_LIMIT: "1000" },
    timeout: 60_000,
  },
});
