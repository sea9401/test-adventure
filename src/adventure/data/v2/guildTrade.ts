import {
  MINING_MATERIAL_ID,
  MINING_MATERIALS,
  type MiningMaterialId,
} from "./miningSpots";
import {
  WOODCUTTING_MATERIAL_ID,
  WOODCUTTING_MATERIALS,
  type WoodcuttingMaterialId,
} from "./woodcuttingSpots";
import { GUILD_WORKSHOP_MATERIAL_ID } from "./guildWorkshopMaterials";
import { MASTERY_CERTIFICATE_KEY } from "./masteryTower";
import {
  BASE_SETTLEMENT_BUILDING_MAX_LEVEL,
  type SettlementBuildingId,
} from "./settlement";
import {
  FARM_ITEMS,
  type FarmItemId,
} from "@/adventure/v2/farm";
import {
  FISHING_CATCH_ITEMS,
  type FishingCatchItemId,
} from "@/adventure/v2/fishingStock";
import type { GameIconName } from "./gameIcon";
import type { GuildMemberGrantOutput } from "./guildMemberGrant";
import type { GuildFacilitySupportKind } from "./guildFacilitySupport";
import { SUMMON_SCROLL_MATERIAL_ID } from "./coopBosses";
import { TORN_MAP_FRAGMENT_MATERIAL_ID } from "./scavengedCrafting";
import { ENHANCE_STONE_MATERIAL_ID } from "./v2Enhance";

export const GUILD_TRADE_USER_SAVE_KEY = "guild-trade-user.v1";
export const ASSOCIATION_TRADE_USER_SAVE_KEY = "association-trade-user.v1";
export const GUILD_TRADE_BASE_TARGET = 40;
export const GUILD_TRADE_TARGET_PER_EXTRA_MEMBER = 10;
export const GUILD_TRADE_MAX_TARGET_MEMBERS = 20;
export const GUILD_TRADE_BASE_REWARD_GOLD = 1_500_000;
export const GUILD_TRADE_BASE_REWARD_FAME = 100;

export type GuildTradeItemSource = "material" | "farm" | "fishing_item";
export type GuildTradeItemCategory = "wood" | "ore" | "farm" | "fish";

export type GuildTradeItem = {
  id: string;
  source: GuildTradeItemSource;
  sourceItemId: string;
  category: GuildTradeItemCategory;
  name: string;
  icon: string;
  iconName: GameIconName;
  batchSize: number;
  pointValue: number;
};

const WOOD_TRADE_BATCH: Record<
  keyof typeof WOODCUTTING_MATERIAL_ID,
  { batchSize: number; pointValue: number }
> = {
  pine: { batchSize: 10, pointValue: 1 },
  birch: { batchSize: 5, pointValue: 1 },
  willow: { batchSize: 3, pointValue: 1 },
  oak: { batchSize: 2, pointValue: 1 },
  cedar: { batchSize: 1, pointValue: 1 },
  cypress: { batchSize: 1, pointValue: 2 },
};

const ORE_TRADE_BATCH: Record<
  "iron" | "copper" | "silver" | "gold" | "mythril" | "adamantite",
  { batchSize: number; pointValue: number }
> = {
  iron: { batchSize: 10, pointValue: 1 },
  copper: { batchSize: 5, pointValue: 1 },
  silver: { batchSize: 3, pointValue: 1 },
  gold: { batchSize: 2, pointValue: 1 },
  mythril: { batchSize: 1, pointValue: 1 },
  adamantite: { batchSize: 1, pointValue: 2 },
};

const FARM_TRADE_ITEM_IDS = [
  "wheat",
  "herb",
  "corn",
  "tomato",
  "strawberry",
  "potato",
  "onion",
  "rice",
  "soybean",
  "sugarcane",
  "cacao",
] as const satisfies readonly FarmItemId[];

const FARM_TRADE_BATCH: Record<
  (typeof FARM_TRADE_ITEM_IDS)[number],
  { batchSize: number; pointValue: number }
> = {
  wheat: { batchSize: 5, pointValue: 1 },
  herb: { batchSize: 4, pointValue: 1 },
  corn: { batchSize: 3, pointValue: 1 },
  tomato: { batchSize: 3, pointValue: 1 },
  strawberry: { batchSize: 2, pointValue: 1 },
  potato: { batchSize: 2, pointValue: 1 },
  onion: { batchSize: 1, pointValue: 1 },
  rice: { batchSize: 1, pointValue: 1 },
  soybean: { batchSize: 1, pointValue: 1 },
  sugarcane: { batchSize: 1, pointValue: 2 },
  cacao: { batchSize: 1, pointValue: 2 },
};

const FISH_TRADE_BATCH: Record<
  FishingCatchItemId,
  { batchSize: number; pointValue: number }
> = {
  catch_common: { batchSize: 5, pointValue: 1 },
  catch_fresh: { batchSize: 3, pointValue: 1 },
  catch_quality: { batchSize: 1, pointValue: 1 },
  catch_special: { batchSize: 1, pointValue: 3 },
  catch_legendary: { batchSize: 1, pointValue: 8 },
};

const woodItems = Object.entries(WOODCUTTING_MATERIAL_ID).map(
  ([key, materialId]) => {
    const material = WOODCUTTING_MATERIALS[materialId as WoodcuttingMaterialId];
    const batch = WOOD_TRADE_BATCH[key as keyof typeof WOOD_TRADE_BATCH];
    return {
      id: `material:${materialId}`,
      source: "material" as const,
      sourceItemId: materialId,
      category: "wood" as const,
      name: material.name,
      icon: "🪵",
      iconName: "Tree" as const,
      ...batch,
    };
  },
);

const oreKeys = [
  "iron",
  "copper",
  "silver",
  "gold",
  "mythril",
  "adamantite",
] as const;
const oreItems = oreKeys.map((key) => {
  const materialId = MINING_MATERIAL_ID[key] as MiningMaterialId;
  return {
    id: `material:${materialId}`,
    source: "material" as const,
    sourceItemId: materialId,
    category: "ore" as const,
    name: MINING_MATERIALS[materialId].name,
    icon: "⛏️",
    iconName: "Shovel" as const,
    ...ORE_TRADE_BATCH[key],
  };
});

const farmItems = FARM_TRADE_ITEM_IDS.map((itemId) => ({
  id: `farm:${itemId}`,
  source: "farm" as const,
  sourceItemId: itemId,
  category: "farm" as const,
  name: FARM_ITEMS[itemId].name,
  icon: FARM_ITEMS[itemId].icon,
  iconName: "Plant" as const,
  ...FARM_TRADE_BATCH[itemId],
}));

const fishItems = Object.values(FISHING_CATCH_ITEMS).map((item) => ({
  id: `fishing_item:${item.id}`,
  source: "fishing_item" as const,
  sourceItemId: item.id,
  category: "fish" as const,
  name: item.name,
  icon: item.icon,
  iconName: "Fish" as const,
  ...FISH_TRADE_BATCH[item.id],
}));

export const GUILD_TRADE_ITEMS: readonly GuildTradeItem[] = [
  ...woodItems,
  ...oreItems,
  ...farmItems,
  ...fishItems,
];

export function guildTradeItem(raw: unknown): GuildTradeItem | null {
  if (typeof raw !== "string") return null;
  return GUILD_TRADE_ITEMS.find((item) => item.id === raw) ?? null;
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickFrom(
  items: readonly GuildTradeItem[],
  seed: string,
): GuildTradeItem {
  return items[hashText(seed) % items.length];
}

/** 주차·길드별로 안정적인 계약 목록을 만든다. DB에는 결과 ID를 저장해 시설 레벨 변경에도 고정한다. */
export function guildTradeItemsForWeek(
  weekKey: string,
  guildId: number,
  count: number,
): GuildTradeItem[] {
  // Lv.1~5 최대 5건, 교역소 Lv.7 6건·Lv.10 7건. 5건째부터는 서로 다른 고급 품목을 더한다.
  const safeCount = Math.max(1, Math.min(7, Math.floor(count)));
  const byCategory = (category: GuildTradeItemCategory) =>
    GUILD_TRADE_ITEMS.filter((item) => item.category === category);
  const foodOrder: GuildTradeItemCategory[] =
    hashText(`${weekKey}:${guildId}:food-order`) % 2 === 0
      ? ["farm", "fish"]
      : ["fish", "farm"];
  const categories: GuildTradeItemCategory[] = [
    "wood",
    "ore",
    ...foodOrder,
  ];
  const picked = categories.slice(0, Math.min(4, safeCount)).map((category, index) =>
    pickFrom(byCategory(category), `${weekKey}:${guildId}:${category}:${index}`),
  );
  for (let slot = 5; slot <= safeCount; slot += 1) {
    const selectedIds = new Set(picked.map((item) => item.id));
    const premium = GUILD_TRADE_ITEMS.filter(
      (item) => item.pointValue >= 2 && !selectedIds.has(item.id),
    );
    if (premium.length === 0) break;
    // 5건째 시드는 기존과 같게 두어 이미 만들어진 주간 계약과 결과가 바뀌지 않게 한다.
    const seed =
      slot === 5
        ? `${weekKey}:${guildId}:premium`
        : `${weekKey}:${guildId}:premium:${slot}`;
    picked.push(pickFrom(premium, seed));
  }
  return picked;
}

export function guildTradeContractTarget(memberCount: number): number {
  const members = Math.max(
    1,
    Math.min(GUILD_TRADE_MAX_TARGET_MEMBERS, Math.floor(memberCount) || 1),
  );
  return (
    GUILD_TRADE_BASE_TARGET +
    (members - 1) * GUILD_TRADE_TARGET_PER_EXTRA_MEMBER
  );
}

export function guildTradeCompletionReward(rewardBonusPct: number): {
  gold: number;
  fame: number;
} {
  const pct = Math.max(0, Math.floor(rewardBonusPct));
  return {
    gold: Math.floor((GUILD_TRADE_BASE_REWARD_GOLD * (100 + pct)) / 100),
    fame: Math.floor((GUILD_TRADE_BASE_REWARD_FAME * (100 + pct)) / 100),
  };
}

/**
 * 시설 보너스의 소수 토큰을 개인 주간 누적 납품점수 기준으로 이월해, 1점짜리
 * 묶음을 여러 번 납품해도 보너스가 유실되지 않게 한다.
 */
export function guildTradeTokenReward(
  contributionPointsBefore: number,
  deliveredPoints: number,
  bonusPct: number,
): number {
  const before = Math.max(0, Math.floor(contributionPointsBefore));
  const delivered = Math.max(0, Math.floor(deliveredPoints));
  const multiplierPct = 100 + Math.max(0, Math.floor(bonusPct));
  return (
    Math.floor(((before + delivered) * multiplierPct) / 100) -
    Math.floor((before * multiplierPct) / 100)
  );
}

export type GuildTradeShopItemId =
  | "refined_iron"
  | "stamina_potion"
  | "mastery_certificate"
  | "mithril_shard"
  | "sunstone"
  | "settlement_supplies"
  | "trade_support_fund"
  | "guild_fame_document"
  | "summon_scroll_bundle"
  | "map_fragment_bundle"
  | "grand_fame_document"
  | "blue_stone_supply"
  | "advanced_facility_supplies";

export type GuildTradeShopItem = {
  id: GuildTradeShopItemId;
  name: string;
  description: string;
  icon: string;
  iconName: GameIconName;
  tokenCost: number;
  weeklyLimit: number;
  minFacilityLevel: number;
  target: "members" | "guild";
  output:
    | GuildMemberGrantOutput
    | {
        kind: "guild_facility_support";
        count: number;
        // 없으면 기본(통나무·철광석) 지원 물자.
        supportKind?: GuildFacilitySupportKind;
      }
    | { kind: "guild_gold"; count: number }
    | { kind: "guild_fame"; count: number };
};

export type GuildFacilitySupportTarget = {
  buildingId: SettlementBuildingId;
  buildingName: string;
  currentLevel: number;
  targetLevel: number | null;
  eligible: boolean;
  reason:
    | "max_level"
    | "materials_not_required"
    | "remaining_below_200"
    | null;
  supportKind: GuildFacilitySupportKind;
  // 지원 종류의 첫째·둘째 재료(기본 = 통나무·철광석, 상위 = 편백나무·아다만타이트).
  crop: { current: number; required: number; grant: number; after: number };
  ore: { current: number; required: number; grant: number; after: number };
};

export const GUILD_TRADE_SHOP_ITEMS: readonly GuildTradeShopItem[] = [
  {
    id: "refined_iron",
    name: "정제 철괴",
    description: "제작소의 초반 장비 제작에 쓰는 정제 재료입니다.",
    icon: "🔩",
    iconName: "Gear",
    tokenCost: 20,
    weeklyLimit: 7,
    minFacilityLevel: 1,
    target: "members",
    output: {
      kind: "material",
      materialId: GUILD_WORKSHOP_MATERIAL_ID.refinedIron,
      count: 1,
    },
  },
  {
    id: "stamina_potion",
    name: "스태미나 포션",
    description: "보관했다가 스태미나 200을 회복할 수 있습니다.",
    icon: "🧪",
    iconName: "Flask",
    tokenCost: 40,
    weeklyLimit: 3,
    minFacilityLevel: 2,
    target: "members",
    output: { kind: "stamina_potion", count: 1 },
  },
  {
    id: "mastery_certificate",
    name: "숙련 증서 묶음",
    description: "직업 숙련도나 공용 숙달 포인트로 바꿀 수 있는 증서 10개입니다.",
    icon: "📜",
    iconName: "Scroll",
    tokenCost: 30,
    weeklyLimit: 6,
    minFacilityLevel: 3,
    target: "members",
    output: {
      kind: "mastery_certificate",
      itemKey: MASTERY_CERTIFICATE_KEY,
      count: 10,
    },
  },
  {
    id: "mithril_shard",
    name: "미스릴 조각",
    description: "중상급 제작 장비에 필요한 희귀 금속 조각입니다.",
    icon: "🔹",
    iconName: "Diamond",
    tokenCost: 60,
    weeklyLimit: 3,
    minFacilityLevel: 4,
    target: "members",
    output: {
      kind: "material",
      materialId: GUILD_WORKSHOP_MATERIAL_ID.mithrilShard,
      count: 1,
    },
  },
  {
    id: "sunstone",
    name: "태양석",
    description: "상급 제작 장비에 쓰는 뜨거운 고급 광석입니다.",
    icon: "☀️",
    iconName: "Sun",
    tokenCost: 100,
    weeklyLimit: 2,
    minFacilityLevel: 5,
    target: "members",
    output: {
      kind: "material",
      materialId: GUILD_WORKSHOP_MATERIAL_ID.sunstone,
      count: 1,
    },
  },
  {
    id: "settlement_supplies",
    name: "길드 시설 지원 물자",
    description:
      "선택한 길드 시설의 통나무·철광석 기부 진행도에 총 200개를 즉시 지원합니다.",
    icon: "📦",
    iconName: "House",
    tokenCost: 120,
    weeklyLimit: 3,
    minFacilityLevel: 1,
    target: "guild",
    output: { kind: "guild_facility_support", count: 200 },
  },
  {
    id: "trade_support_fund",
    name: "교역 지원금",
    description: "길드 공용 자금에 3,000,000G를 추가합니다.",
    icon: "🪙",
    iconName: "Coins",
    tokenCost: 180,
    weeklyLimit: 2,
    minFacilityLevel: 2,
    target: "guild",
    output: { kind: "guild_gold", count: 3_000_000 },
  },
  {
    id: "guild_fame_document",
    name: "길드 명성 문서",
    description: "길드 누적 명성과 사용 가능 명성을 100 올립니다.",
    icon: "🏆",
    iconName: "Trophy",
    tokenCost: 200,
    weeklyLimit: 2,
    minFacilityLevel: 3,
    target: "guild",
    output: { kind: "guild_fame", count: 100 },
  },
  {
    id: "summon_scroll_bundle",
    name: "소환서 꾸러미",
    description: "현재 길드원 전원에게 보스 소환서를 1장씩 나눕니다.",
    icon: "📜",
    iconName: "Scroll",
    tokenCost: 150,
    weeklyLimit: 2,
    minFacilityLevel: 6,
    target: "members",
    output: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 },
  },
  {
    id: "map_fragment_bundle",
    name: "지도 조각 꾸러미",
    description: "현재 길드원 전원에게 찢어진 지도 조각을 1개씩 나눕니다.",
    icon: "🗺️",
    iconName: "MapTrifold",
    tokenCost: 180,
    weeklyLimit: 1,
    minFacilityLevel: 7,
    target: "members",
    output: { kind: "material", materialId: TORN_MAP_FRAGMENT_MATERIAL_ID, count: 1 },
  },
  {
    id: "grand_fame_document",
    name: "길드 명성 대문서",
    description: "길드 누적 명성과 사용 가능 명성을 300 올립니다.",
    icon: "📯",
    iconName: "Trophy",
    tokenCost: 400,
    weeklyLimit: 2,
    minFacilityLevel: 8,
    target: "guild",
    output: { kind: "guild_fame", count: 300 },
  },
  {
    id: "blue_stone_supply",
    name: "푸른 강화석 보급",
    description: "현재 길드원 전원에게 푸른 강화석을 1개씩 나눕니다.",
    icon: "🔷",
    iconName: "Diamond",
    tokenCost: 350,
    weeklyLimit: 1,
    minFacilityLevel: 9,
    target: "members",
    output: { kind: "material", materialId: ENHANCE_STONE_MATERIAL_ID.blue, count: 1 },
  },
  {
    id: "advanced_facility_supplies",
    name: "상위 시설 지원 물자",
    description:
      "선택한 길드 시설의 다음 업그레이드에 편백나무와 아다만타이트를 합계 200개 지원합니다.",
    icon: "🏗️",
    iconName: "Cube",
    tokenCost: 300,
    weeklyLimit: 2,
    minFacilityLevel: 10,
    target: "guild",
    output: { kind: "guild_facility_support", count: 200, supportKind: "advanced" },
  },
];

// 협회 교역소는 Lv.5가 최대라 Lv.6 이상 품목은 목록에서 뺀다.
export const ASSOCIATION_TRADE_SHOP_ITEMS: readonly GuildTradeShopItem[] =
  GUILD_TRADE_SHOP_ITEMS.filter(
    (item) =>
      item.target === "members" &&
      item.minFacilityLevel <= BASE_SETTLEMENT_BUILDING_MAX_LEVEL,
  );

export function guildTradeShopItem(raw: unknown): GuildTradeShopItem | null {
  if (typeof raw !== "string") return null;
  return GUILD_TRADE_SHOP_ITEMS.find((item) => item.id === raw) ?? null;
}

export function associationTradeShopItem(raw: unknown): GuildTradeShopItem | null {
  if (typeof raw !== "string") return null;
  return ASSOCIATION_TRADE_SHOP_ITEMS.find((item) => item.id === raw) ?? null;
}

export type GuildTradeUserState = {
  version: 1;
  guildId: number;
  weekKey: string;
  /** 공동 잔고 도입 전 개인 토큰. 서버가 길드 공동 잔고로 이관한 뒤 0으로 저장한다. */
  tokens: number;
  contributionPoints: number;
  purchases: Partial<Record<GuildTradeShopItemId, number>>;
};

function nonNegativeInt(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

export function parseGuildTradeUserState(
  raw: unknown,
  args: { guildId: number; weekKey: string },
): GuildTradeUserState {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sameGuild = nonNegativeInt(value.guildId) === args.guildId;
  const sameWeek = value.weekKey === args.weekKey;
  const purchaseRaw =
    sameGuild && sameWeek && value.purchases && typeof value.purchases === "object"
      ? (value.purchases as Record<string, unknown>)
      : {};
  const purchases: GuildTradeUserState["purchases"] = {};
  for (const shopItem of GUILD_TRADE_SHOP_ITEMS) {
    const count = nonNegativeInt(purchaseRaw[shopItem.id]);
    if (count > 0) purchases[shopItem.id] = count;
  }
  return {
    version: 1,
    guildId: args.guildId,
    weekKey: args.weekKey,
    tokens: sameGuild ? nonNegativeInt(value.tokens) : 0,
    // 길드를 옮겨도 같은 주의 개인 납품 점수는 이어져 개인 납품 한도가 다시 생기지 않는다.
    contributionPoints: sameWeek ? nonNegativeInt(value.contributionPoints) : 0,
    purchases,
  };
}

// 길드 교역소와 협회 교역소는 장부가 따로지만 개인 납품 한도는 같은 주 안에서 합산한다.
export function guildTradeWeeklyContributionPoints(
  raw: unknown,
  weekKey: string,
): number {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return value.weekKey === weekKey ? nonNegativeInt(value.contributionPoints) : 0;
}
