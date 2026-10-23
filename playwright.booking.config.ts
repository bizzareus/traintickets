import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const webPort = 3110;
const contractPort = 3109;

export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch:
    /booking-(entry|form|checkout|payment|cancellation|share|journey)\.spec\.ts$/,
  timeout: 45_000,
  workers: 2,
  outputDir: "test-results/booking",
  use: {
    ...base.use,
    baseURL: `http://localhost:${webPort}`,
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm --prefix backend run test:booking:server",
      url: `http://127.0.0.1:${contractPort}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        SENTRY_DSN: "",
        BOOKING_CONTRACT_PORT: String(contractPort),
      },
    },
    {
      command: `npm run dev:web -- --port ${webPort}`,
      url: `http://localhost:${webPort}`,
      reuseExistingServer: false,
      timeout: 300_000,
      env: {
        NODE_ENV: "development",
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${contractPort}`,
        NEXT_PUBLIC_APP_URL: `http://localhost:${webPort}`,
        NEXT_PUBLIC_POSTHOG_KEY: "phc_booking_tests",
        NEXT_PUBLIC_ENABLE_SPLIT_BOOKING: "",
        NEXT_PUBLIC_SENTRY_DSN: "",
      },
    },
  ],
});
