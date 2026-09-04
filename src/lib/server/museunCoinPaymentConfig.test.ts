import { describe, expect, it } from "vitest";
import { readMuseunCoinPaymentConfig } from "./museunCoinPaymentConfig";

describe("readMuseunCoinPaymentConfig", () => {
  it("fails closed when payment mode is missing or disabled", () => {
    expect(readMuseunCoinPaymentConfig({})).toBeNull();
    expect(
      readMuseunCoinPaymentConfig({ MUSEUN_COIN_PAYMENTS_MODE: "disabled" }),
    ).toBeNull();
  });

  it("accepts a complete test configuration", () => {
    expect(
      readMuseunCoinPaymentConfig({
        MUSEUN_COIN_PAYMENTS_MODE: "test",
        TOSS_PAYMENTS_CLIENT_KEY: "test_ck_demo",
        TOSS_PAYMENTS_SECRET_KEY: "test_sk_demo",
      }),
    ).toEqual({
      mode: "test",
      clientKey: "test_ck_demo",
      secretKey: "test_sk_demo",
    });
  });

  it("rejects incomplete and invalid configurations", () => {
    expect(() =>
      readMuseunCoinPaymentConfig({ MUSEUN_COIN_PAYMENTS_MODE: "test" }),
    ).toThrow("payment_keys_required");
    expect(() =>
      readMuseunCoinPaymentConfig({
        MUSEUN_COIN_PAYMENTS_MODE: "preview",
      }),
    ).toThrow("invalid_payment_mode");
  });

  it("rejects test keys in live mode", () => {
    expect(() =>
      readMuseunCoinPaymentConfig({
        MUSEUN_COIN_PAYMENTS_MODE: "live",
        TOSS_PAYMENTS_CLIENT_KEY: "test_ck_demo",
        TOSS_PAYMENTS_SECRET_KEY: "test_sk_demo",
      }),
    ).toThrow("live_keys_required");
  });
});
