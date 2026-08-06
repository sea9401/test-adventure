import { describe, expect, it } from "vitest";
import { isBrowserPushSubscription } from "./push-notifications";

describe("Web Push 구독 검증", () => {
  it("표준 HTTPS endpoint와 두 키를 허용한다", () => {
    expect(
      isBrowserPushSubscription({
        endpoint: "https://push.example.test/subscription/abc",
        keys: { p256dh: "public-key", auth: "auth-key" },
      }),
    ).toBe(true);
  });

  it("HTTP endpoint와 누락된 키를 거부한다", () => {
    expect(
      isBrowserPushSubscription({
        endpoint: "http://push.example.test/subscription/abc",
        keys: { p256dh: "public-key", auth: "auth-key" },
      }),
    ).toBe(false);
    expect(
      isBrowserPushSubscription({
        endpoint: "https://push.example.test/subscription/abc",
        keys: { p256dh: "public-key" },
      }),
    ).toBe(false);
  });
});
