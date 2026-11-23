import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: {
      ...devices["Desktop Chrome"],
      // Optional: use an installed browser (e.g. PLAYWRIGHT_CHANNEL=chrome) when binaries cannot be downloaded.
      channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
      // Fake microphone for the voice-recording spec.
      launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
      permissions: ["microphone"],
    } }],
  webServer: {
    command: `pnpm dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
