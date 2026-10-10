import {
  LIFE_FESTIVAL_ORDERS,
  LIFE_FESTIVAL_SHOP_ITEM_BY_ID,
  LIFE_FESTIVAL_SHOP_ITEMS,
  LIFE_FESTIVAL_THEME_EPOCH_MONDAY,
  LIFE_FESTIVAL_THEMES,
  type LifeFestivalActivity,
  type LifeFestivalDishRequirement,
  type LifeFestivalOrder,
  type LifeFestivalShopItem,
  type LifeFestivalTheme,
  type LifeFestivalThemeId,
} from "@/adventure/data/v2/lifeFestival";
import { kstWeekMondayKey } from "@/lib/kst";

export type {
  LifeFestivalActivity,
  LifeFestivalDishRequirement,
  LifeFestivalOrder,
  LifeFestivalShopItem,
  LifeFestivalTheme,
  LifeFestivalThemeId,
} from "@/adventure/data/v2/lifeFestival";

export const LIFE_FESTIVAL_SAVE_KEY = "life-festival.v1";

export type LifeFestivalState = {
  version: 1;
  weekId: string;
  tokens: number;
  tokensEarnedTotal: number;
  deliveries: Record<string, number>;
  weeklyPurchases: Record<string, number>;
  ownedOnceItemIds: string[];
};

const WEEK_MS = 7 * 86_400_000;
const ONCE_ITEM_IDS = new Set(
  LIFE_FESTIVAL_SHOP_ITEMS.filter((item) => item.weeklyLimit === null).map(
    (item) => item.id,
  ),
);

function nonNegativeInt(value: unknown): number {
  const number = Number(value);
  if (typeof value !== "number" || !Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function positiveCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const count = nonNegativeInt(raw);
    if (count > 0) counts[key] = count;
  }
  return counts;
}

export function parseLifeFestivalState(
  raw: unknown,
  weekId: string,
): LifeFestivalState {
  const value =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const sameWeek = value.weekId === weekId;
  const owned = Array.isArray(value.ownedOnceItemIds)
    ? [
        ...new Set(
          value.ownedOnceItemIds.filter(
            (id): id is string => typeof id === "string" && ONCE_ITEM_IDS.has(id),
          ),
        ),
      ]
    : [];
  return {
    version: 1,
    weekId,
    tokens: nonNegativeInt(value.tokens),
    tokensEarnedTotal: nonNegativeInt(value.tokensEarnedTotal),
    deliveries: sameWeek ? positiveCounts(value.deliveries) : {},
    weeklyPurchases: sameWeek ? positiveCounts(value.weeklyPurchases) : {},
    ownedOnceItemIds: owned,
  };
}

function weekIndex(weekId: string): number {
  const diff =
    Date.parse(`${weekId}T00:00:00.000Z`) -
    Date.parse(`${LIFE_FESTIVAL_THEME_EPOCH_MONDAY}T00:00:00.000Z`);
  return Math.round(diff / WEEK_MS);
}

export function lifeFestivalThemeForWeek(weekId: string): LifeFestivalTheme {
  const count = LIFE_FESTIVAL_THEMES.length;
  const index = ((weekIndex(weekId) % count) + count) % count;
  return LIFE_FESTIVAL_THEMES[index];
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const pick = (state >>> 0) % (index + 1);
    [result[index], result[pick]] = [result[pick], result[index]];
  }
  return result;
}

export const LIFE_FESTIVAL_THEME_ORDER_COUNT = 3;
export const LIFE_FESTIVAL_GENERAL_ORDER_COUNT = 3;

export function lifeFestivalOrdersForWeek(weekId: string): LifeFestivalOrder[] {
  const theme = lifeFestivalThemeForWeek(weekId);
  const seed = fnv1a(`life-festival:${weekId}`);
  const themed = seededShuffle(
    LIFE_FESTIVAL_ORDERS.filter((order) => order.pool === theme.id),
    seed,
  ).slice(0, LIFE_FESTIVAL_THEME_ORDER_COUNT);
  const taken = new Set(themed.map((order) => JSON.stringify(order.requirement)));
  const general = seededShuffle(
    LIFE_FESTIVAL_ORDERS.filter(
      (order) =>
        order.pool === "general" && !taken.has(JSON.stringify(order.requirement)),
    ),
    fnv1a(`life-festival:general:${weekId}`),
  ).slice(0, LIFE_FESTIVAL_GENERAL_ORDER_COUNT);
  return [...themed, ...general];
}

export function lifeFestivalMultiplier(nth: number): 1 | 0.5 | 0.2 {
  if (nth <= 5) return 1;
  if (nth <= 15) return 0.5;
  return 0.2;
}

export function lifeFestivalDeliveryReward(
  baseTokens: number,
  alreadyDelivered: number,
  times: number,
): { tokens: number; score: number } {
  let tokens = 0;
  let score = 0;
  for (let offset = 1; offset <= times; offset += 1) {
    const multiplier = lifeFestivalMultiplier(alreadyDelivered + offset);
    tokens += Math.floor(baseTokens * multiplier);
    score += Math.round(baseTokens * 10 * multiplier);
  }
  return { tokens, score };
}

export type LifeFestivalDishFacts = {
  tier: number;
  effectTags: readonly string[];
  quality: "normal" | "careful" | "masterpiece" | "signature";
};

const QUALITY_RANK = { normal: 0, careful: 1, masterpiece: 2, signature: 3 } as const;

export function dishMatchesRequirement(
  dish: LifeFestivalDishFacts,
  requirement: LifeFestivalDishRequirement,
): boolean {
  if (dish.tier < requirement.minTier) return false;
  if (requirement.tag && !dish.effectTags.includes(requirement.tag)) return false;
  if (
    requirement.minQuality &&
    QUALITY_RANK[dish.quality] < QUALITY_RANK[requirement.minQuality]
  ) {
    return false;
  }
  return true;
}

export function validateDishSelection(
  selection: Record<string, number>,
  inventory: Partial<Record<string, number>>,
  requirement: LifeFestivalDishRequirement,
  times: number,
  lookup: (foodId: string) => LifeFestivalDishFacts | null,
): { ok: true } | { ok: false } {
  let total = 0;
  for (const [foodId, count] of Object.entries(selection)) {
    if (!Number.isInteger(count) || count <= 0) return { ok: false };
    if ((inventory[foodId] ?? 0) < count) return { ok: false };
    const dish = lookup(foodId);
    if (!dish || !dishMatchesRequirement(dish, requirement)) return { ok: false };
    total += count;
  }
  return total === requirement.quantity * times ? { ok: true } : { ok: false };
}

export type LifeFestivalShopError =
  | "unknown_item"
  | "not_enough_tokens"
  | "weekly_limit"
  | "already_owned";

export function buyLifeFestivalShopItem(
  state: LifeFestivalState,
  itemId: string,
):
  | { state: LifeFestivalState; item: LifeFestivalShopItem }
  | { error: LifeFestivalShopError } {
  const item = LIFE_FESTIVAL_SHOP_ITEM_BY_ID.get(itemId);
  if (!item) return { error: "unknown_item" };
  if (item.weeklyLimit === null) {
    if (state.ownedOnceItemIds.includes(item.id)) return { error: "already_owned" };
  } else if ((state.weeklyPurchases[item.id] ?? 0) >= item.weeklyLimit) {
    return { error: "weekly_limit" };
  }
  if (state.tokens < item.tokenCost) return { error: "not_enough_tokens" };
  return {
    item,
    state: {
      ...state,
      tokens: state.tokens - item.tokenCost,
      weeklyPurchases:
        item.weeklyLimit === null
          ? state.weeklyPurchases
          : {
              ...state.weeklyPurchases,
              [item.id]: (state.weeklyPurchases[item.id] ?? 0) + 1,
            },
      ownedOnceItemIds:
        item.weeklyLimit === null
          ? [...state.ownedOnceItemIds, item.id]
          : state.ownedOnceItemIds,
    },
  };
}

export function grantLifeFestivalTokens(
  state: LifeFestivalState,
  tokens: number,
): LifeFestivalState {
  const amount = nonNegativeInt(tokens);
  return {
    ...state,
    tokens: state.tokens + amount,
    tokensEarnedTotal: state.tokensEarnedTotal + amount,
  };
}

export type LifeFestivalBonus = {
  themeId: LifeFestivalThemeId | null;
  chancePct: number;
  xpPct: number;
};

export function lifeFestivalBonus(
  activity: LifeFestivalActivity,
  now: Date,
): LifeFestivalBonus {
  const theme = lifeFestivalThemeForWeek(kstWeekMondayKey(now));
  if (theme.activity !== activity) return { themeId: null, chancePct: 0, xpPct: 0 };
  return { themeId: theme.id, chancePct: theme.chancePct, xpPct: theme.xpPct };
}

export function lifeFestivalBonusXp(baseXp: number, xpPct: number): number {
  return Math.max(0, Math.floor((baseXp * xpPct) / 100));
}

/** 다음 주 월요일 00:00 KST(= 이번 주 축제 종료 시각). */
export function lifeFestivalWeekEndsAt(weekId: string): Date {
  return new Date(Date.parse(`${weekId}T00:00:00+09:00`) + WEEK_MS);
}

export function previousLifeFestivalWeekId(weekId: string): string {
  return new Date(Date.parse(`${weekId}T00:00:00.000Z`) - WEEK_MS)
    .toISOString()
    .slice(0, 10);
}
