import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const LOCAL_ORIGIN = "http://localhost:3212";

const PUBLIC_PAGES = [
  { path: "/sign-in", heading: "무슨무슨게임", title: "무슨무슨게임" },
  { path: "/terms", heading: "이용약관", title: "이용약관" },
  {
    path: "/privacy",
    heading: "개인정보처리방침",
    title: "개인정보처리방침",
  },
  { path: "/operations", heading: "운영정책", title: "운영정책" },
  { path: "/licenses", heading: "오픈소스 고지", title: "오픈소스 고지" },
  { path: "/manual/overview", heading: "게임 개요", title: "게임 안내서" },
] as const;

const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

for (const surface of PUBLIC_PAGES) {
  test(`${surface.path} 공개 화면은 오류·가로 넘침·자동 탐지 접근성 위반이 없다`, async ({
    page,
  }) => {
    await preparePublicPage(page);
    const browserErrors = observeBrowserErrors(page);
    const badResponses = observeBadSameOriginResponses(page);
    const response = await page.goto(surface.path);

    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("heading", { level: 1, name: surface.heading }),
    ).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(surface.title));
    await expect(page.locator("html")).toHaveAttribute("lang", "ko");

    const layout = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);

    const accessibility = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    expect(violationSummary(accessibility.violations)).toEqual([]);
    expect(browserErrors).toEqual([]);
    expect(badResponses).toEqual([]);
  });
}

test("비로그인 루트는 로그인 대문으로 HTTP 리다이렉트한다", async ({ page }) => {
  await preparePublicPage(page);
  const response = await page.goto("/");
  const redirectedFrom = response?.request().redirectedFrom();
  const redirectResponse = await redirectedFrom?.response();

  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "무슨무슨게임" }),
  ).toBeVisible();
  expect(redirectResponse?.status()).toBe(307);
});

test("로그인 대문의 정책 링크를 키보드로 이동할 수 있다", async ({ page }) => {
  await preparePublicPage(page);
  await page.goto("/sign-in");
  const termsLink = page.getByRole("link", { name: "이용약관" }).last();

  await termsLink.focus();
  await expect(termsLink).toBeFocused();
  expect(await termsLink.evaluate((element) => element.matches(":focus-visible"))).toBe(
    true,
  );
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/terms$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "이용약관" }),
  ).toBeVisible();
});

test("출시 전 비공개 화면과 API는 로그인 화면으로 새지 않고 404다", async ({
  request,
}) => {
  for (const { path, method } of [
    { path: "/dev", method: "GET" },
    { path: "/settings/coin-shop", method: "GET" },
    { path: "/api/v2/museun-coin-shop", method: "GET" },
    { path: "/api/v2/dev/grant", method: "POST" },
  ] as const) {
    const response = await request.fetch(path, { method, maxRedirects: 0 });
    expect(response.status(), path).toBe(404);
  }
});

test("공개 고지 원문과 PWA 메타 파일을 제공한다", async ({ request }) => {
  const resources = [
    ["/third-party-notices.txt", "THIRD-PARTY SOFTWARE AND FONT NOTICES"],
    ["/licenses/geist-OFL-1.1.txt", "SIL OPEN FONT LICENSE"],
    ["/manifest.webmanifest", "무슨무슨게임"],
    ["/robots.txt", "Sitemap:"],
    ["/sitemap.xml", "/licenses"],
  ] as const;

  for (const [path, marker] of resources) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).toContain(marker);
  }
});

test("로그인 대문에 운영 보안 헤더가 적용된다", async ({ request }) => {
  const response = await request.get("/sign-in");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );
  expect(response.headers()["content-security-policy"]).toContain(
    "upgrade-insecure-requests",
  );
  expect(response.headers()["strict-transport-security"]).toContain("max-age=");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
});

function observeBrowserErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const location = message.location();
      errors.push(
        `console: ${message.text()}${location.url ? ` (${location.url})` : ""}`,
      );
    }
  });
  return errors;
}

async function preparePublicPage(page: Page) {
  // Production CSP upgrades every HTTP subresource to HTTPS. The E2E server is
  // intentionally local HTTP, so WebKit would otherwise request a nonexistent
  // TLS endpoint and render without CSS/JS. Raw response tests below still
  // assert that production sends the upgrade directive.
  await page.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (
      request.resourceType() !== "document" ||
      new URL(request.url()).pathname === "/"
    ) {
      await route.fallback();
      return;
    }

    const response = await route.fetch();
    const headers = response.headers();
    const contentSecurityPolicy = headers["content-security-policy"];
    if (contentSecurityPolicy) {
      headers["content-security-policy"] = contentSecurityPolicy
        .split(";")
        .map((directive) => directive.trim())
        .filter((directive) => directive !== "upgrade-insecure-requests")
        .join("; ");
    }
    await route.fulfill({ response, headers });
  });

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    });
  });
}

function observeBadSameOriginResponses(page: Page) {
  const failures: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === new URL(page.url() || "http://127.0.0.1").origin &&
      response.status() >= 400
    ) {
      failures.push(`${response.status()} ${url.pathname}`);
    }
  });
  return failures;
}

function violationSummary(
  violations: Array<{
    id: string;
    impact?: string | null;
    help: string;
    nodes: Array<{ target: unknown }>;
  }>,
) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target),
  }));
}
