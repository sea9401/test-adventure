import type { Page } from "@playwright/test";
import {
  DEVICE_SESSION_COOKIE,
  DEVICE_SESSION_COOKIE_MAX_AGE,
  isValidDeviceSessionId,
} from "../../src/lib/deviceSessionConfig";

const LOCAL_ORIGIN = "http://localhost:3212";

type LocalHttpBrowserOptions = {
  authenticated?: boolean;
};

export async function prepareLocalHttpBrowser(
  page: Page,
  options: LocalHttpBrowserOptions = {},
) {
  // Production CSP upgrades every HTTP subresource to HTTPS. The E2E server is
  // intentionally local HTTP, so WebKit would otherwise request a nonexistent
  // TLS endpoint and render without CSS/JS. Raw response tests still assert
  // that production sends the upgrade directive.
  await page.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const preparesDocument =
      request.resourceType() === "document" &&
      (pathname !== "/" || options.authenticated === true);
    const preparesDeviceClaim =
      options.authenticated === true && pathname === "/api/session/claim";

    if (!preparesDocument && !preparesDeviceClaim) {
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
    if (preparesDeviceClaim && headers["set-cookie"]) {
      // Production issues the device-session cookies with Secure. Chromium
      // treats localhost as trustworthy, but WebKit correctly refuses those
      // cookies over the deliberately HTTP-only E2E server. Relax only the
      // intercepted local test response; the application response is intact.
      headers["set-cookie"] = headers["set-cookie"]
        .split("\n")
        .map((cookie) =>
          cookie.startsWith("game-")
            ? cookie.replace(/;\s*Secure(?=;|$)/gi, "")
            : cookie,
        )
        .join("\n");
    }
    if (preparesDeviceClaim && response.ok()) {
      const body = request.postDataJSON() as { sessionId?: unknown };
      if (!isValidDeviceSessionId(body.sessionId)) {
        throw new Error("The local E2E device claim has an invalid session ID");
      }
      // WebKit does not persist Set-Cookie from a fulfilled intercepted HTTP
      // response reliably. Mirror the server-approved value into this test
      // context so the next protected API request observes the claimed device.
      await page.context().addCookies([
        {
          name: DEVICE_SESSION_COOKIE,
          value: body.sessionId,
          url: LOCAL_ORIGIN,
          expires: Date.now() / 1_000 + DEVICE_SESSION_COOKIE_MAX_AGE,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
    }
    await route.fulfill({ response, headers });
  });
}
