import { defineConfig } from "@playwright/test";

const PORT = 3297;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /mobile-ui\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    hasTouch: true,
    isMobile: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "mobile-320",
      use: {
        viewport: { width: 320, height: 568 },
        deviceScaleFactor: 2,
      },
    },
    {
      name: "mobile-390",
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command:
      "MOBILE_UI_NEXT_DIST_DIR=.next-mobile-ui npm run dev -- --hostname 127.0.0.1 --port 3297",
    url: `${BASE_URL}/dev/landing`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
