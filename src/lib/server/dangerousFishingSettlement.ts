import {
  fishingWalletWithCoins,
  walletCoins,
  type FishingWallet,
} from "@/lib/server/fishing/coins";

const SAFE_INTEGER_MAX = Number.MAX_SAFE_INTEGER;

function nonNegativeSafeInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.min(SAFE_INTEGER_MAX, Math.floor(value));
}

export function mergeDangerousFishingMaterials(
  existing: unknown,
  additions: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = {};
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    for (const [id, value] of Object.entries(
      existing as Record<string, unknown>,
    )) {
      const quantity = nonNegativeSafeInteger(value);
      if (quantity > 0) merged[id] = quantity;
    }
  }
  for (const [id, value] of Object.entries(additions)) {
    const quantity = nonNegativeSafeInteger(value);
    if (quantity <= 0) continue;
    const current = merged[id] ?? 0;
    merged[id] = current + Math.min(quantity, SAFE_INTEGER_MAX - current);
  }
  return merged;
}

export function dangerousFishingWalletCoins(raw: unknown): number {
  return Math.min(SAFE_INTEGER_MAX, walletCoins(raw));
}

export function dangerousFishingWalletWithAddedCoins(
  raw: unknown,
  addedCoins: number,
): FishingWallet {
  const current = dangerousFishingWalletCoins(raw);
  const addition = nonNegativeSafeInteger(addedCoins);
  const next = current + Math.min(addition, SAFE_INTEGER_MAX - current);
  return fishingWalletWithCoins(raw, next);
}
