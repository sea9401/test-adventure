import { V2_EQUIPMENT, type V2EquipInstance } from "@/adventure/data/v2/v2Equipment";
import { equipmentOrderSnapshot } from "./equipmentBuyOrders";
import type { PriceStat } from "./marketplaceShared";

const MIN_COMPARABLE_TRADES = 2;
const WARNING_MIN_TRADES = 3;

/** 같은 장비 안에서 위력 25%·품질 25점 단위로 묶은 내부 시세 키. UI에는 키를 노출하지 않는다. */
export function equipmentComparablePriceKeys(
  itemId: string,
  power: number,
  qualityPct: number,
): [specific: string, powerBand: string] | null {
  const item = V2_EQUIPMENT[itemId as keyof typeof V2_EQUIPMENT];
  if (!item || !Number.isFinite(power) || power < 1) return null;
  const normalizedQuality = Math.max(0, Math.min(100, Math.round(qualityPct)));
  const powerBand = Math.max(1, Math.round((power / item.power) * 4));
  const qualityBand = Math.min(4, Math.floor(normalizedQuality / 25));
  return [
    `${itemId}#similar:p${powerBand}:q${qualityBand}`,
    `${itemId}#similar:p${powerBand}`,
  ];
}

export function comparableEquipmentPriceStat(
  priceRef: Record<string, PriceStat>,
  instance: V2EquipInstance,
): PriceStat | undefined {
  const snapshot = equipmentOrderSnapshot(instance);
  if (!snapshot) return undefined;
  const keys = equipmentComparablePriceKeys(
    instance.id,
    snapshot.power,
    snapshot.qualityPct,
  );
  if (!keys) return undefined;
  return keys
    .map((key) => priceRef[key])
    .find((stat) => stat != null && stat.n >= MIN_COMPARABLE_TRADES);
}

export type EquipmentPriceWarning = "low" | "high" | null;

/** 표본이 충분하고 평균의 절반 이하·두 배 이상일 때만 조용한 실수 방지 경고를 낸다. */
export function equipmentPriceWarning(
  price: number,
  stat: PriceStat | undefined,
): EquipmentPriceWarning {
  if (!Number.isFinite(price) || price < 1 || !stat || stat.n < WARNING_MIN_TRADES) {
    return null;
  }
  if (price <= stat.avg * 0.5) return "low";
  if (price >= stat.avg * 2) return "high";
  return null;
}
