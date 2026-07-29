import type { Page } from "@playwright/test";

const LOCAL_ORIGIN = "http://localhost:3212";

export async function prepareLocalHttpBrowser(page: Page) {
  // Production CSP upgrades every HTTP subresource to HTTPS. The E2E server is
  // intentionally local HTTP, so WebKit would otherwise request a nonexistent
  // TLS endpoint and render without CSS/JS. Raw response tests still assert
  // that production sends the upgrade directive.
  await page.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const request = route.request();
    if (request.resourceType() !== "document") {
      await route.fallback();
      return;
    }

    // Keep the unauthenticated / -> /sign-in redirect observable by the
    // browser instead of letting route.fetch follow it internally.
    const response = await route.fetch({ maxRedirects: 0 });
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
}
