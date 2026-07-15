import type { FishTier } from "@/adventure/data/v2/fish";

export const FISHING_STOCK_KEY = "fishing-stock.v1";
export const FISHING_CATCH_ITEM_CHANCE_PCT = 10;

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

// 낮은 등급이 일일 총량을 먼저 채워 고등급 획득을 막지 않도록 등급별로 독립 집계한다.
// 현재 출현 가중치(40/28/20/9/3)에 맞춰 합계 최대 100개/일로 배분했다.
export const FISHING_CATCH_ITEM_DAILY_CAP: Record<
  FishingCatchItemId,
  number
> = {
  catch_common: 40,
  catch_fresh: 30,
  catch_quality: 20,
  catch_special: 8,
  catch_legendary: 2,
};

const CATCH_ITEM_BY_TIER = Object.fromEntries(
  FISHING_CATCH_ITEM_LIST.map((item) => [item.tier, item]),
) as Record<FishTier, FishingCatchItem>;

export type FishingStock = {
  version: 1;
  items: Partial<Record<FishingCatchItemId, number>>;
  daily?: {
    date: string;
    awarded: Partial<Record<FishingCatchItemId, number>>;
  };
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
  const dailyRaw =
    value.daily && typeof value.daily === "object"
      ? (value.daily as Record<string, unknown>)
      : null;
  const awardedRaw =
    dailyRaw?.awarded && typeof dailyRaw.awarded === "object"
      ? (dailyRaw.awarded as Record<string, unknown>)
      : {};
  const awarded: NonNullable<FishingStock["daily"]>["awarded"] = {};
  for (const [id, countRaw] of Object.entries(awardedRaw)) {
    if (!isFishingCatchItemId(id)) continue;
    const count = nonNegativeInt(countRaw);
    if (count > 0) awarded[id] = count;
  }
  const date = typeof dailyRaw?.date === "string" ? dailyRaw.date : "";
  return {
    version: 1,
    items,
    ...(date ? { daily: { date, awarded } } : {}),
  };
}

export function fishingCatchItemForTier(tier: FishTier): FishingCatchItem {
  return CATCH_ITEM_BY_TIER[tier];
}

export type FishingCatchStockRoll = {
  stock: FishingStock,
  item: FishingCatchItem;
  awarded: boolean;
  reason: "awarded" | "roll_miss" | "daily_cap";
  balance: number;
  dailyAwarded: number;
  dailyCap: number;
};

export function rollFishingCatchToStock(
  stock: FishingStock,
  tier: FishTier,
  dayKey: string,
  rng: () => number = Math.random,
): FishingCatchStockRoll {
  const item = fishingCatchItemForTier(tier);
  const dailyAwarded =
    stock.daily?.date === dayKey ? stock.daily.awarded[item.id] ?? 0 : 0;
  const dailyCap = FISHING_CATCH_ITEM_DAILY_CAP[item.id];
  const base = {
    stock,
    item,
    balance: stock.items[item.id] ?? 0,
    dailyAwarded,
    dailyCap,
  };
  if (dailyAwarded >= dailyCap) {
    return { ...base, awarded: false, reason: "daily_cap" };
  }
  if (rng() >= FISHING_CATCH_ITEM_CHANCE_PCT / 100) {
    return { ...base, awarded: false, reason: "roll_miss" };
  }
  const balance = (stock.items[item.id] ?? 0) + 1;
  const nextDailyAwarded = dailyAwarded + 1;
  return {
    stock: {
      version: 1,
      items: { ...stock.items, [item.id]: balance },
      daily: {
        date: dayKey,
        awarded: {
          ...(stock.daily?.date === dayKey ? stock.daily.awarded : {}),
          [item.id]: nextDailyAwarded,
        },
      },
    },
    item,
    awarded: true,
    reason: "awarded",
    balance,
    dailyAwarded: nextDailyAwarded,
    dailyCap,
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
  return { ...stock, version: 1, items };
}
