// 행상 파견의 규칙 상수. 산물을 적재 점수로 바꿔 수레에 싣고, 몇 시간 뒤 행상 증표로 받는다.
// 화면·안내서·서버가 함께 읽는 순수 모듈이라 세이브나 서버 전용 모듈을 가져오지 않는다.

import { MINING_MATERIAL_ID } from "@/adventure/data/v2/miningSpots";
import { WOODCUTTING_MATERIAL_ID } from "@/adventure/data/v2/woodcuttingSpots";
import { CUT_GEMS } from "./gemCutting";
import { LIFE_MAJOR_PRODUCT_ID } from "./lifeMajorProducts";
import { LIFE_PROCESSED_MATERIAL_ID } from "./lifeWorkshopMaterials";

export const PEDDLER_ROUTE_IDS = ["river", "ridge", "harbor"] as const;
export type PeddlerRouteId = (typeof PEDDLER_ROUTE_IDS)[number];

export type PeddlerRouteUnlock =
  | { kind: "start" }
  | { kind: "route_rank"; routeId: PeddlerRouteId; rank: number }
  | { kind: "total_rank"; rank: number };

export type PeddlerRoute = { id: PeddlerRouteId; name: string; unlock: PeddlerRouteUnlock };

export const PEDDLER_ROUTES: readonly PeddlerRoute[] = [
  { id: "river", name: "강나루 장터", unlock: { kind: "start" } },
  { id: "ridge", name: "산마루 광산촌", unlock: { kind: "route_rank", routeId: "river", rank: 3 } },
  { id: "harbor", name: "남쪽 항구", unlock: { kind: "total_rank", rank: 10 } },
];

export function isPeddlerRouteId(raw: unknown): raw is PeddlerRouteId {
  return typeof raw === "string" && (PEDDLER_ROUTE_IDS as readonly string[]).includes(raw);
}

/** 첫 교역로를 여는 조건: 생활 하나가 이 레벨 이상. */
export const PEDDLER_REQUIRED_LIFE_LEVEL = 50;

// ── 적재 점수 ──

export const PEDDLER_PROFESSIONS = ["farming", "mining", "woodcutting", "fishing"] as const;
export type PeddlerProfession = (typeof PEDDLER_PROFESSIONS)[number];

export type PeddlerCargoGroup = "wood" | "ore" | "byproduct" | "processed" | "crop" | "ranch" | "fish" | "dish";

export const PEDDLER_CARGO_GROUP_NAMES: Record<PeddlerCargoGroup, string> = {
  wood: "원목",
  ore: "광석",
  byproduct: "채광 부산물",
  processed: "가공재",
  crop: "작물",
  ranch: "축산물",
  fish: "어획물",
  dish: "요리",
};

export type PeddlerCargoSource = "material" | "farm" | "fish";

export type PeddlerCargoItem = {
  /** `material:<재료 id>` · `farm:<농장 품목 id>` · `fish:<어획물 id>` */
  id: string;
  source: PeddlerCargoSource;
  sourceItemId: string;
  group: Exclude<PeddlerCargoGroup, "dish">;
  profession: PeddlerProfession;
  /** 개당 적재 점수. */
  points: number;
};

function cargo(
  source: PeddlerCargoSource,
  group: PeddlerCargoItem["group"],
  profession: PeddlerProfession,
  entries: readonly (readonly [string, number])[],
): PeddlerCargoItem[] {
  return entries.map(([sourceItemId, points]) => ({
    id: `${source}:${sourceItemId}`,
    source,
    sourceItemId,
    group,
    profession,
    points,
  }));
}

const W = WOODCUTTING_MATERIAL_ID;
const M = MINING_MATERIAL_ID;
const P = LIFE_PROCESSED_MATERIAL_ID;

// 2시간 느긋한 자동 채집 1회분이 약 1,300점이 되게 맞춘 값이다.
export const PEDDLER_CARGO_ITEMS: readonly PeddlerCargoItem[] = [
  ...cargo("material", "wood", "woodcutting", [
    [W.pine, 2],
    [W.birch, 2],
    [W.willow, 3],
    [W.oak, 4],
    [W.cedar, 5],
    [W.cypress, 6],
  ]),
  ...cargo("material", "processed", "woodcutting", [
    [P.softwood, 24],
    [P.hardwood, 38],
    [P.masterwood, 60],
  ]),
  ...cargo("material", "ore", "mining", [
    [M.iron, 2],
    [M.copper, 2],
    [M.silver, 3],
    [M.gold, 4],
    [M.mythril, 5],
    [M.adamantite, 6],
  ]),
  ...cargo("material", "byproduct", "mining", [
    [M.stone, 1],
    [M.coal, 1],
  ]),
  ...cargo("material", "processed", "mining", [
    [P.basicIngot, 24],
    [P.preciousIngot, 38],
    [P.arcaneAlloy, 60],
  ]),
  ...cargo("farm", "crop", "farming", [
    ["wheat", 20],
    ["corn", 25],
    ["herb", 30],
    ["tomato", 30],
    ["potato", 45],
    ["strawberry", 50],
    ["rice", 55],
    ["onion", 60],
    ["soybean", 60],
    ["sugarcane", 70],
    ["cacao", 90],
  ]),
  ...cargo("farm", "ranch", "farming", [
    ["egg", 20],
    ["milk", 40],
    ["pork", 60],
  ]),
  ...cargo("fish", "fish", "fishing", [
    ["catch_common", 15],
    ["catch_fresh", 25],
    ["catch_quality", 40],
    ["catch_special", 120],
    ["catch_legendary", 400],
  ]),
];

const CARGO_ITEM_BY_ID = new Map(PEDDLER_CARGO_ITEMS.map((item) => [item.id, item]));

export function peddlerCargoItem(raw: unknown): PeddlerCargoItem | null {
  return typeof raw === "string" ? CARGO_ITEM_BY_ID.get(raw) ?? null : null;
}

export const PEDDLER_DISH_CARGO_PREFIX = "dish:";
/** 요리는 재료 환산값의 약 1.2배. 품질과 무관하게 티어로 정한다. */
export const PEDDLER_DISH_POINTS_BY_TIER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 200,
  2: 400,
  3: 800,
  4: 1400,
  5: 1700,
};

// ── 파견 ──

export const PEDDLER_DISPATCH_HOURS = [4, 8, 12] as const;
export type PeddlerDispatchHours = (typeof PEDDLER_DISPATCH_HOURS)[number];

export function isPeddlerDispatchHours(raw: unknown): raw is PeddlerDispatchHours {
  return (PEDDLER_DISPATCH_HOURS as readonly unknown[]).includes(raw);
}

/** 증표 기준 적재량. 아래 표는 이 점수를 실었을 때 받는 증표다. */
export const PEDDLER_TOKEN_LOAD_POINTS = 2_000;
export const PEDDLER_TOKENS_PER_LOAD: Record<PeddlerDispatchHours, number> = { 4: 10, 8: 14, 12: 17 };
/** 우대 품목의 적재 점수에 더 쳐 주는 비율(%). */
export const PEDDLER_PREFERRED_BONUS_PCT = 50;
export const PEDDLER_MIN_CARGO_POINTS = 200;
export const PEDDLER_CARGO_KIND_LIMIT = 30;

const TOKEN_DENOMINATOR = 100 * PEDDLER_TOKEN_LOAD_POINTS;

/**
 * 받을 증표와 다음 파견으로 넘길 나머지. 나머지를 버리면 적게 나눠 보낼수록 손해라 이월한다.
 * carry는 0 이상 TOKEN_DENOMINATOR 미만의 정수다.
 */
export function peddlerTokenReward({
  points,
  preferredPoints,
  hours,
  carry,
}: {
  points: number;
  preferredPoints: number;
  hours: PeddlerDispatchHours;
  carry: number;
}): { tokens: number; carry: number } {
  const weighted = points * 100 + preferredPoints * PEDDLER_PREFERRED_BONUS_PCT;
  const numerator = weighted * PEDDLER_TOKENS_PER_LOAD[hours] + Math.max(0, Math.floor(carry));
  return { tokens: Math.floor(numerator / TOKEN_DENOMINATOR), carry: numerator % TOKEN_DENOMINATOR };
}

// ── 교역 등급 ──

/** n등급에 필요한 누적 적재 점수(1등급부터). */
export const PEDDLER_RANK_THRESHOLDS: readonly number[] = [
  6_000, 16_000, 32_000, 56_000, 90_000, 140_000, 210_000, 300_000, 420_000, 600_000,
];
export const PEDDLER_MAX_RANK = PEDDLER_RANK_THRESHOLDS.length;
export const PEDDLER_BASE_CAPACITY = 2_000;
export const PEDDLER_CAPACITY_PER_RANK = 200;
/** 교역 등급 합계 칭호 조건. */
export const PEDDLER_REGULAR_TITLE_TOTAL_RANK = 15;
export const PEDDLER_MASTER_TITLE_TOTAL_RANK = 30;

export function peddlerRankForPoints(standingPoints: number): number {
  let rank = 0;
  for (const threshold of PEDDLER_RANK_THRESHOLDS) {
    if (standingPoints < threshold) break;
    rank += 1;
  }
  return rank;
}

export function peddlerNextRankAt(rank: number): number | null {
  return rank >= PEDDLER_MAX_RANK ? null : PEDDLER_RANK_THRESHOLDS[Math.max(0, rank)];
}

export function peddlerCapacityForRank(rank: number): number {
  return PEDDLER_BASE_CAPACITY + PEDDLER_CAPACITY_PER_RANK * Math.max(0, Math.min(PEDDLER_MAX_RANK, rank));
}

// ── 우대 품목 ──

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** 주차 번호의 기준 월요일(KST 날짜 키). */
export const PEDDLER_EPOCH_MONDAY = "2026-01-05";
export const PEDDLER_PREFERRED_ITEM_COUNT = 2;

function itemsOf(profession: PeddlerProfession): readonly PeddlerCargoItem[] {
  return PEDDLER_CARGO_ITEMS.filter((item) => item.profession === profession);
}

const ITEMS_BY_PROFESSION: Record<PeddlerProfession, readonly PeddlerCargoItem[]> = {
  farming: itemsOf("farming"),
  mining: itemsOf("mining"),
  woodcutting: itemsOf("woodcutting"),
  fishing: itemsOf("fishing"),
};

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function weekIndex(weekId: string): number {
  const diff = Date.parse(`${weekId}T00:00:00.000Z`) - Date.parse(`${PEDDLER_EPOCH_MONDAY}T00:00:00.000Z`);
  return Number.isFinite(diff) ? Math.round(diff / WEEK_MS) : 0;
}

/**
 * 그 주 그 교역로의 우대 품목 2종. 서로 다른 생활에서 하나씩 뽑고, 세 교역로를 합치면 네 생활이 모두 나온다.
 * 한 생활은 한 교역로에 격주로 돌아오며 그때마다 다음 품목으로 넘어가 모든 품목이 차례로 우대된다.
 * 첫째와 셋째 교역로는 같은 두 생활을 쓰므로 품목 순번을 목록의 3분의 2만큼 벌려 겹치지 않게 한다.
 */
export function peddlerPreferredItemIds(weekId: string, routeId: PeddlerRouteId): string[] {
  const week = weekIndex(weekId);
  const routeIndex = PEDDLER_ROUTE_IDS.indexOf(routeId);
  const count = PEDDLER_PROFESSIONS.length;
  return [0, count / 2].map((offset) => {
    const items = ITEMS_BY_PROFESSION[PEDDLER_PROFESSIONS[mod(week + routeIndex + offset, count)]];
    const index = mod(Math.floor(week / 2) + routeIndex * Math.ceil(items.length / 3), items.length);
    return items[index].id;
  });
}

// ── 증표 교환 ──

export type PeddlerShopItemId =
  | "master_crop"
  | "master_wood"
  | "master_alloy"
  | "master_catch"
  | "cut_gem_polished"
  | "cut_gem_refined"
  | "compound_feed";

export type PeddlerShopItem = {
  id: PeddlerShopItemId;
  tokenCost: number;
  /** null이면 한도가 없다. */
  weeklyLimit: number | null;
  output: { kind: "material" | "farm"; itemId: string; count: number };
};

const MASTER_PRODUCT_TOKEN_COST = 30;
const MASTER_PRODUCT_WEEKLY_LIMIT = 5;

function masterProduct(id: PeddlerShopItemId, itemId: string): PeddlerShopItem {
  return {
    id,
    tokenCost: MASTER_PRODUCT_TOKEN_COST,
    weeklyLimit: MASTER_PRODUCT_WEEKLY_LIMIT,
    output: { kind: "material", itemId, count: 1 },
  };
}

export const PEDDLER_SHOP_ITEMS: readonly PeddlerShopItem[] = [
  masterProduct("master_crop", LIFE_MAJOR_PRODUCT_ID.farming),
  masterProduct("master_wood", LIFE_MAJOR_PRODUCT_ID.woodcutting),
  masterProduct("master_alloy", LIFE_MAJOR_PRODUCT_ID.mining),
  masterProduct("master_catch", LIFE_MAJOR_PRODUCT_ID.fishing),
  {
    id: "cut_gem_polished",
    tokenCost: 40,
    weeklyLimit: 5,
    output: { kind: "material", itemId: CUT_GEMS.polished.id, count: 1 },
  },
  {
    id: "cut_gem_refined",
    tokenCost: 120,
    weeklyLimit: 1,
    output: { kind: "material", itemId: CUT_GEMS.refined.id, count: 1 },
  },
  {
    id: "compound_feed",
    tokenCost: 10,
    weeklyLimit: null,
    output: { kind: "farm", itemId: "compound_feed", count: 10 },
  },
];

const SHOP_ITEM_BY_ID = new Map(PEDDLER_SHOP_ITEMS.map((item) => [item.id as string, item]));

export function peddlerShopItem(raw: unknown): PeddlerShopItem | null {
  return typeof raw === "string" ? SHOP_ITEM_BY_ID.get(raw) ?? null : null;
}

/** 한 번에 교환할 수 있는 수량 상한(한도 없는 품목용). */
export const PEDDLER_SHOP_QUANTITY_LIMIT = 100;
