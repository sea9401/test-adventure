import type {
  MarketplaceStackGroup,
  PriceStat,
} from "./marketplaceShared";
import {
  MARKETPLACE_LIFE_ITEM_IDS,
  marketplaceLifeItemDefinition,
} from "./lifeItemCatalog";

export function marketplaceLifeItemPurchaseGroups(
  priceRef: Record<string, PriceStat>,
): MarketplaceStackGroup[] {
  return MARKETPLACE_LIFE_ITEM_IDS.map((itemId) => {
    const definition = marketplaceLifeItemDefinition(itemId);
    return {
      key: `material:${itemId}`,
      kind: "material",
      itemId,
      itemName: definition?.name ?? itemId,
      totalQuantity: 0,
      minUnitPrice: priceRef[itemId]?.unitAvg ?? 1,
      listings: [],
    };
  });
}
