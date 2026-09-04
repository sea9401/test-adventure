import {
  V2_EQUIPMENT,
  v2EquipCatalogTierToDisplayTier,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";

export type MarketplaceEquipmentTierFilter =
  | "all"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6";

export const MARKETPLACE_EQUIPMENT_TIER_OPTIONS: ReadonlyArray<
  readonly [MarketplaceEquipmentTierFilter, string]
> = [
  ["all", "전체 티어"],
  ["1", "1T"],
  ["2", "2T"],
  ["3", "3T"],
  ["4", "4T"],
  ["5", "5T"],
  ["6", "6T"],
];

export function matchesMarketplaceEquipmentTier(
  itemId: string,
  filter: MarketplaceEquipmentTierFilter,
): boolean {
  if (filter === "all") return true;
  const item = V2_EQUIPMENT[itemId as V2EquipmentId];
  return (
    item != null &&
    v2EquipCatalogTierToDisplayTier(item.tier) === Number(filter)
  );
}

export function matchesMarketplaceUnregisteredCodex(
  itemId: string,
  enabled: boolean,
  loaded: boolean,
  registeredIds: ReadonlySet<V2EquipmentId> | null | undefined,
): boolean {
  if (!enabled || !loaded) return true;
  const item = V2_EQUIPMENT[itemId as V2EquipmentId];
  return item != null && registeredIds?.has(item.id) === false;
}
