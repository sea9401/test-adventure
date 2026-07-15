import type { FishTier } from "@/adventure/data/v2/fish";

export const FISHING_STOCK_KEY = "fishing-stock.v1";

export type FishingCatchItemId =
  | "catch_common"
  | "catch_fresh"
  | "catch_quality"
  | "catch_special"
  | "catch_legendary";

export type FishingCatchItem = {
  id: FishingCatchItemId;
  tier: FishTier;
  name: string;
  icon: string;
};

export const FISHING_CATCH_ITEMS: Record<
  FishingCatchItemId,
  FishingCatchItem
> = {
  catch_common: {
    id: "catch_common",
    tier: "common",
    name: "일반 어획물",
    icon: "🐟",
  },
  catch_fresh: {
    id: "catch_fresh",
    tier: "uncommon",
    name: "신선한 어획물",
    icon: "🐠",
  },
  catch_quality: {
    id: "catch_quality",
    tier: "rare",
    name: "고급 어획물",
    icon: "🦈",
  },
  catch_special: {
    id: "catch_special",
    tier: "epic",
    name: "특급 어획물",
    icon: "🐡",
  },
  catch_legendary: {
    id: "catch_legendary",
    tier: "legendary",
    name: "전설의 어획물",
    icon: "🐉",
  },
};

export const FISHING_CATCH_ITEM_LIST = Object.values(FISHING_CATCH_ITEMS);

const CATCH_ITEM_BY_TIER = Object.fromEntries(
  FISHING_CATCH_ITEM_LIST.map((item) => [item.tier, item]),
) as Record<FishTier, FishingCatchItem>;

export type FishingStock = {
  version: 1;
  items: Partial<Record<FishingCatchItemId, number>>;
};

export function emptyFishingStock(): FishingStock {
  return { version: 1, items: {} };
}

function nonNegativeInt(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

export function isFishingCatchItemId(
  raw: string,
): raw is FishingCatchItemId {
  return Object.prototype.hasOwnProperty.call(FISHING_CATCH_ITEMS, raw);
}

export function parseFishingStock(raw: unknown): FishingStock {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const source =
    value.items && typeof value.items === "object"
      ? (value.items as Record<string, unknown>)
      : {};
  const items: FishingStock["items"] = {};
  for (const [id, countRaw] of Object.entries(source)) {
    if (!isFishingCatchItemId(id)) continue;
    const count = nonNegativeInt(countRaw);
    if (count > 0) items[id] = count;
  }
  return { version: 1, items };
}

export function fishingCatchItemForTier(tier: FishTier): FishingCatchItem {
  return CATCH_ITEM_BY_TIER[tier];
}

export function addFishingCatchToStock(
  stock: FishingStock,
  tier: FishTier,
): { stock: FishingStock; item: FishingCatchItem; balance: number } {
  const item = fishingCatchItemForTier(tier);
  const balance = (stock.items[item.id] ?? 0) + 1;
  return {
    stock: {
      version: 1,
      items: { ...stock.items, [item.id]: balance },
    },
    item,
    balance,
  };
}

export function spendFishingCatchItem(
  stock: FishingStock,
  itemId: FishingCatchItemId,
  quantity: number,
): FishingStock | null {
  const safeQuantity = nonNegativeInt(quantity);
  const owned = stock.items[itemId] ?? 0;
  if (safeQuantity <= 0 || safeQuantity > owned) return null;
  const items = { ...stock.items };
  const remaining = owned - safeQuantity;
  if (remaining > 0) items[itemId] = remaining;
  else delete items[itemId];
  return { version: 1, items };
}
