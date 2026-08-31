export function formatSecretShopRemaining(remainingMs: number): string {
  const totalSeconds = Math.ceil(Math.max(0, remainingMs) / 1_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function correctedSecretShopExpiry(
  expiresAt: number,
  serverNow: number,
  clientNow: number,
): number {
  return clientNow + Math.max(0, expiresAt - serverNow);
}
