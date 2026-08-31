import { V2_EQUIPMENT_LIBERATION } from "@/adventure/data/v2/coreLoopConfig";
import { deriveEquippedLiberationEffects } from "@/adventure/data/v2/equipmentLiberationEffects";

export function discountedPersonalCraftGoldCost(
  baseGoldCost: number,
  discountPct: number,
): number {
  const base = Number.isFinite(baseGoldCost)
    ? Math.max(0, Math.floor(baseGoldCost))
    : 0;
  const discount = Number.isFinite(discountPct)
    ? Math.min(100, Math.max(0, discountPct))
    : 0;
  return Math.max(0, Math.floor(base * (1 - discount / 100)));
}

export function equippedPersonalCraftGoldDiscountPct(
  equipmentRaw: unknown,
  enabled: boolean = V2_EQUIPMENT_LIBERATION,
): number {
  if (!enabled) return 0;
  return Math.min(
    100,
    Math.max(
      0,
      deriveEquippedLiberationEffects(equipmentRaw).craftGoldDiscountPct,
    ),
  );
}
