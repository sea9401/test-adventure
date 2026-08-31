export function parseForgeCombinationQuantity(value: unknown): number | null {
  if (value === undefined) return 1;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1
    ? value
    : null;
}

export function forgeCombinationTotal(
  unit: number,
  quantity: number,
): number | null {
  if (
    !Number.isSafeInteger(unit) ||
    unit < 0 ||
    parseForgeCombinationQuantity(quantity) == null
  ) {
    return null;
  }
  const total = unit * quantity;
  return Number.isSafeInteger(total) ? total : null;
}

type MaxForgeCombinationQuantityInput = {
  materialHave: number;
  materialCost: number;
  spendableGold: number;
  goldCost: number;
  capacity?: number;
};

function normalizedOwnedCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

export function maxForgeCombinationQuantity({
  materialHave,
  materialCost,
  spendableGold,
  goldCost,
  capacity,
}: MaxForgeCombinationQuantityInput): number {
  if (
    !Number.isSafeInteger(materialCost) ||
    materialCost < 1 ||
    !Number.isSafeInteger(goldCost) ||
    goldCost < 1
  ) {
    return 0;
  }

  const limits = [
    Math.floor(normalizedOwnedCount(materialHave) / materialCost),
    Math.floor(normalizedOwnedCount(spendableGold) / goldCost),
  ];
  if (capacity !== undefined) limits.push(normalizedOwnedCount(capacity));
  return Math.max(0, Math.min(...limits));
}
