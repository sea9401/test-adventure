import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readMuseunCoinPaymentConfig } from "@/lib/server/museunCoinPaymentConfig";

describe("payment release gates", () => {
  it("keeps tracked production payment and shop gates closed", () => {
    const env = readFileSync(".env.production", "utf8");
    expect(env).toContain("NEXT_PUBLIC_MUSEUN_COIN_SHOP_OPEN=false");
    expect(env).toContain("MUSEUN_COIN_PAYMENTS_MODE=disabled");
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
