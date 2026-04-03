import { defineConfig, devices } from "@playwright/test";

const webPort = 3010;
const mockApiPort = 3009;
/** Use `localhost` so it matches `NEXT_PUBLIC_API_URL` / default `lib/api.ts` and avoids dev HMR origin issues. */
const baseURL = `http://localhost:${webPort}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:web",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: `http://localhost:${mockApiPort}`,
    },
  },
});
