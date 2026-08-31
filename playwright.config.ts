import { defineConfig, devices } from "@playwright/test";

const PORT = 3212;
// Auth.js의 callback URL과 브라우저 쿠키 도메인이 반드시 같아야 한다.
// 하나의 로컬 호스트명만 사용해 127.0.0.1 ↔ localhost 전환을 막는다.
const BASE_URL = `http://localhost:${PORT}`;
const AUTHENTICATED_SPEC = /authenticated-flow\.spec\.ts/;
const MOBILE_UI_SPEC = /mobile-ui\.spec\.ts/;
const GENERIC_SPEC_IGNORES = [AUTHENTICATED_SPEC, MOBILE_UI_SPEC];

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      testIgnore: GENERIC_SPEC_IGNORES,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-webkit",
      testIgnore: GENERIC_SPEC_IGNORES,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "authenticated-chromium",
      testMatch: AUTHENTICATED_SPEC,
      // 인증 시나리오는 격리 DB의 고정 계정 하나를 공유하므로 프로젝트 안에서 직렬 실행한다.
      workers: 1,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "authenticated-mobile-webkit",
      testMatch: AUTHENTICATED_SPEC,
      // 데스크톱 인증 프로젝트가 끝난 뒤 같은 계정을 초기화해 프로젝트 간 경쟁을 막는다.
      dependencies: ["authenticated-chromium"],
      workers: 1,
      use: { ...devices["iPhone 13"] },
    },
  ],
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${PORT}`,
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      AUTH_TRUST_HOST: "true",
      AUTH_URL: BASE_URL,
      NEXTAUTH_URL: BASE_URL,
      AUTH_SECRET: "browser-e2e-only-not-a-production-secret",
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://browser_e2e:browser_e2e@127.0.0.1:1/browser_e2e",
      DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS:
        process.env.DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS ?? "true",
    },
  },
});
