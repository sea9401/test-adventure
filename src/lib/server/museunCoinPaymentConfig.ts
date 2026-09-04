import "server-only";

export type MuseunCoinPaymentMode = "disabled" | "test" | "live";

export type MuseunCoinPaymentConfig = {
  mode: Exclude<MuseunCoinPaymentMode, "disabled">;
  clientKey: string;
  secretKey: string;
};

export function readMuseunCoinPaymentConfig(
  env: Record<string, string | undefined> = process.env,
): MuseunCoinPaymentConfig | null {
  const mode = env.MUSEUN_COIN_PAYMENTS_MODE?.trim();
  if (!mode || mode === "disabled") return null;
  if (mode !== "test" && mode !== "live") {
    throw new Error("invalid_payment_mode");
  }

  const clientKey = env.TOSS_PAYMENTS_CLIENT_KEY?.trim();
  const secretKey = env.TOSS_PAYMENTS_SECRET_KEY?.trim();
  if (!clientKey || !secretKey) throw new Error("payment_keys_required");
  if (
    mode === "live" &&
    (clientKey.startsWith("test_") || secretKey.startsWith("test_"))
  ) {
    throw new Error("live_keys_required");
  }

  return { mode, clientKey, secretKey };
}
