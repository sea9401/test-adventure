import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatMuseunCoinLaunchDate } from "@/lib/museunCoinLaunch";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";
import nextConfig from "../next.config";

describe("payment release gates", () => {
  it("allows the Toss SDK bootstrap script in the served content security policy", async () => {
    const rules = await nextConfig.headers!();
    const policy = rules
      .find((rule) => rule.source === "/:path*")
      ?.headers.find((header) => header.key === "Content-Security-Policy")?.value;
    const scriptSources = policy
      ?.split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .find(([name]) => name === "script-src")
      ?.slice(1);

    expect(scriptSources).toContain(
      new URL("https://js.tosspayments.com/v2/standard").origin,
    );
    expect(scriptSources).not.toContain("https://*.tosspayments.com");
  });
  it("keeps tracked payment mode closed and opens the shop only with a launch date", () => {
    const env = readFileSync(".env.production", "utf8");
    expect(env).toMatch(/^MUSEUN_COIN_PAYMENTS_MODE=disabled$/m);
    expect(env).toMatch(/^PG_HOMEPAGE_REVIEW_MODE=false$/m);
    const shopOpen = /^NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN=(true|false)$/m.exec(env)?.[1];
    const launchDate = /^NEXT_PUBLIC_MUSEUN_COIN_PAYMENTS_LAUNCH_DATE=(.*)$/m.exec(env)?.[1];
    expect(shopOpen).toBeDefined();
    expect(launchDate).toBeDefined();
    if (shopOpen === "true") {
      expect(formatMuseunCoinLaunchDate(launchDate)).not.toBeNull();
    }
  });
  it("keeps checkout callbacks and payment APIs behind the shop proxy gate", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toContain('req.nextUrl.pathname.startsWith("/settings/coin-shop/")');
    expect(proxy).toContain('req.nextUrl.pathname.startsWith("/api/v2/museun-coin-payments")');
  });
  it("fails closed without keys and rejects test keys in live mode", () => {
    expect(readMuseunCoinPaymentConfig({})).toBeNull();
    expect(() => readMuseunCoinPaymentConfig({
      MUSEUN_COIN_PAYMENTS_MODE: "live",
      TOSS_PAYMENTS_CLIENT_KEY: "test_ck_placeholder",
      TOSS_PAYMENTS_SECRET_KEY: "test_sk_placeholder",
    })).toThrow("live_keys_required");
  });
  it("allows only Toss browser origins required by the checkout", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toContain("connect-src 'self'");
    expect(config).toContain("frame-src");
    expect(config.match(/https:\/\/\*\.tosspayments\.com/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
