export type ShopSaleBalancePatch = {
  gold?: number;
  bankedGold?: number;
};

export function shopSaleBalancePatch(response: {
  gold?: unknown;
  bankedGold?: unknown;
}): ShopSaleBalancePatch {
  const patch: ShopSaleBalancePatch = {};
  if (
    typeof response.gold === "number" &&
    Number.isFinite(response.gold) &&
    response.gold >= 0
  ) {
    patch.gold = response.gold;
  }
  if (
    typeof response.bankedGold === "number" &&
    Number.isFinite(response.bankedGold) &&
    response.bankedGold >= 0
  ) {
    patch.bankedGold = response.bankedGold;
  }
  return patch;
}

export function shopSaleBankNotice(subject: string, gold: number): string {
  const safeGold = Number.isFinite(gold) ? Math.max(0, Math.floor(gold)) : 0;
  return `✓ ${subject} 판매 (은행 +${safeGold.toLocaleString()}골드)`;
}
