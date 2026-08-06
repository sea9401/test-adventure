// v2 정착지 시스템 — 빈 공터를 길드가 점령해 마을 건설·생산·업그레이드(마을→도시→대도시→국가).
// 설계 SSOT = 작업 메모리 project-v2-settlement-redesign. 옛 분쟁지대 쟁탈 아레나 단순화 대체.
//
// PR-1 = 데이터 모델 + 순수 생산 엔진(미배선·inert). 아직 어디서도 import 안 함 → 런타임 무영향.
//   후속: DB(생산상태·길드재화)·라우트(생산 시작/수확/업그레이드)·UI(길드 마을 페이지)·
//   건설/명명·지형특성 맵 리매핑·국가 선포.
//
// 🔑 설계 가드(메모리): 재화→업그레이드 자기완결 sink 루프가 옛 stone 경제(sink 0으로 삭제)와의
//   결정적 차이. 생명 = 업그레이드 깊이/지속성. 수치는 전부 다이얼(라이브 실측 후 조정).

import {
  WOODCUTTING_MATERIAL_ID,
  WOODCUTTING_MATERIALS,
} from "./woodcuttingSpots";
import { MINING_MATERIAL_ID, MINING_MATERIALS } from "./miningSpots";
import {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_PROCESSED_MATERIALS,
  type LifeProcessedMaterialId,
} from "../../v2/lifeWorkshopMaterials";

// ── 정착지 단계 ──────────────────────────────────────────────────────────
export type VillageTier = "village" | "city" | "metropolis";
export const VILLAGE_TIERS: VillageTier[] = ["village", "city", "metropolis"];
export const VILLAGE_TIER_NAME: Record<VillageTier, string> = {
  village: "마을",
  city: "도시",
  metropolis: "대도시",
};

// 다음 단계(없으면 null = 최종. 국가 선포는 별도 게이트). 단계 인덱스.
export function nextTier(tier: VillageTier): VillageTier | null {
  const i = VILLAGE_TIERS.indexOf(tier);
  return i >= 0 && i < VILLAGE_TIERS.length - 1 ? VILLAGE_TIERS[i + 1] : null;
}

// 이전 단계(없으면 null = 최하). 정복 함락 시 마을 1단계 강등에 사용(대도시→도시→마을, 마을=null).
export function prevTier(tier: VillageTier): VillageTier | null {
  const i = VILLAGE_TIERS.indexOf(tier);
  return i > 0 ? VILLAGE_TIERS[i - 1] : null;
}

// 국가 선포 게이트 — 이 등급 이상의 마을(=대도시) 하나를 보유하면 선포 가능.
//   하드 "땅 N개" 게이트는 두지 않음(메모리 설계 8번): 땅이 많을수록 재화가 빨라 자연히
//   확장이 유도되도록(emergent). 보유 마을 중 하나라도 이 단계면 충족.
export const NATION_REQUIRED_TIER: VillageTier = "metropolis";

export function tierMeetsNation(tier: VillageTier): boolean {
  return VILLAGE_TIERS.indexOf(tier) >= VILLAGE_TIERS.indexOf(NATION_REQUIRED_TIER);
}

// ── 지형 특성 ── 거점마다 1개(static outposts.ts 에서 부여). 해당 생산에 +보너스. ──────
//   키는 영구 유지(farmland/mine/lake), 표시명은 생산물 테마에 맞춤: 숲→통나무·광맥→철광석·어장(식량폐기).
export type TerrainTrait = "plain" | "farmland" | "mine" | "lake";
export const TERRAIN_TRAIT_NAME: Record<TerrainTrait, string> = {
  plain: "평지",
  farmland: "숲", // 통나무(crop) 보너스
  mine: "광맥", // 철광석(ore) 보너스
  lake: "어장", // (식량 폐기 — 보너스 없음)
};

// ── 생산 종류 ── 내부 키(crop/ore) 영구 유지, 표시명만 재테마. 식량(fish) 폐기(2026-06-25).
//   crop=통나무 / ore=철광석 — 둘 다 사냥 드랍 재료로 전환 중(슬롯 생산은 과도기 잔존).
export type ProductionKind = "crop" | "ore";
export const PRODUCTION_KIND_NAME: Record<ProductionKind, string> = {
  crop: "통나무",
  ore: "철광석",
};
export const SETTLEMENT_RESOURCE_NAME: Record<ProductionKind, string> = {
  crop: "통나무",
  ore: "철광석",
};
// 종류별 간단 아이콘(이모지) — 슬롯/재화 표시용.
export const PRODUCTION_KIND_ICON: Record<ProductionKind, string> = {
  crop: "🪵",
  ore: "🪨",
};
export const PRODUCTION_KINDS: ProductionKind[] = ["crop", "ore"];

// 길드 정착지에 기부할 수 있는 생활 재료. 기초 소나무/철은 레거시 crop/ore 풀을
// 그대로 사용하고, 상위 재료는 재료 ID 자체를 키로 보존해 시설 비용에서 구분한다.
export const SETTLEMENT_WOOD_MATERIAL_IDS = [
  WOODCUTTING_MATERIAL_ID.pine,
  WOODCUTTING_MATERIAL_ID.birch,
  WOODCUTTING_MATERIAL_ID.willow,
  WOODCUTTING_MATERIAL_ID.oak,
  WOODCUTTING_MATERIAL_ID.cedar,
  WOODCUTTING_MATERIAL_ID.cypress,
] as const;
export const SETTLEMENT_ORE_MATERIAL_IDS = [
  MINING_MATERIAL_ID.iron,
  MINING_MATERIAL_ID.copper,
  MINING_MATERIAL_ID.silver,
  MINING_MATERIAL_ID.gold,
  MINING_MATERIAL_ID.mythril,
  MINING_MATERIAL_ID.adamantite,
] as const;
export const SETTLEMENT_DONATION_MATERIAL_IDS = [
  ...SETTLEMENT_WOOD_MATERIAL_IDS,
  ...SETTLEMENT_ORE_MATERIAL_IDS,
] as const;

// 가공품은 타일 정착지 자원 전환에만 추가한다. 길드 시설 직접 기부는 기존 원재료
// 단위 비용을 유지해 이미 진행 중인 시설 기부량과 UI를 바꾸지 않는다.
export const SETTLEMENT_PROCESSED_DONATION_MATERIAL_IDS = [
  LIFE_PROCESSED_MATERIAL_ID.softwood,
  LIFE_PROCESSED_MATERIAL_ID.hardwood,
  LIFE_PROCESSED_MATERIAL_ID.masterwood,
  LIFE_PROCESSED_MATERIAL_ID.basicIngot,
  LIFE_PROCESSED_MATERIAL_ID.preciousIngot,
  LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy,
] as const;
export const SETTLEMENT_VILLAGE_DONATION_MATERIAL_IDS = [
  ...SETTLEMENT_DONATION_MATERIAL_IDS,
  ...SETTLEMENT_PROCESSED_DONATION_MATERIAL_IDS,
] as const;

export type SettlementDonationMaterialId =
  (typeof SETTLEMENT_DONATION_MATERIAL_IDS)[number];
export type SettlementVillageDonationMaterialId =
  (typeof SETTLEMENT_VILLAGE_DONATION_MATERIAL_IDS)[number];
export type SettlementResourceKey =
  | ProductionKind
  | Exclude<
      SettlementDonationMaterialId,
      typeof WOODCUTTING_MATERIAL_ID.pine | typeof MINING_MATERIAL_ID.iron
    >;

export const SETTLEMENT_MATERIAL_TO_RESOURCE: Record<
  SettlementVillageDonationMaterialId,
  SettlementResourceKey
> = {
  [WOODCUTTING_MATERIAL_ID.pine]: "crop",
  [WOODCUTTING_MATERIAL_ID.birch]: WOODCUTTING_MATERIAL_ID.birch,
  [WOODCUTTING_MATERIAL_ID.willow]: WOODCUTTING_MATERIAL_ID.willow,
  [WOODCUTTING_MATERIAL_ID.oak]: WOODCUTTING_MATERIAL_ID.oak,
  [WOODCUTTING_MATERIAL_ID.cedar]: WOODCUTTING_MATERIAL_ID.cedar,
  [WOODCUTTING_MATERIAL_ID.cypress]: WOODCUTTING_MATERIAL_ID.cypress,
  [MINING_MATERIAL_ID.iron]: "ore",
  [MINING_MATERIAL_ID.copper]: MINING_MATERIAL_ID.copper,
  [MINING_MATERIAL_ID.silver]: MINING_MATERIAL_ID.silver,
  [MINING_MATERIAL_ID.gold]: MINING_MATERIAL_ID.gold,
  [MINING_MATERIAL_ID.mythril]: MINING_MATERIAL_ID.mythril,
  [MINING_MATERIAL_ID.adamantite]: MINING_MATERIAL_ID.adamantite,
  [LIFE_PROCESSED_MATERIAL_ID.softwood]: "crop",
  [LIFE_PROCESSED_MATERIAL_ID.hardwood]: WOODCUTTING_MATERIAL_ID.willow,
  [LIFE_PROCESSED_MATERIAL_ID.masterwood]: WOODCUTTING_MATERIAL_ID.cedar,
  [LIFE_PROCESSED_MATERIAL_ID.basicIngot]: "ore",
  [LIFE_PROCESSED_MATERIAL_ID.preciousIngot]: MINING_MATERIAL_ID.silver,
  [LIFE_PROCESSED_MATERIAL_ID.arcaneAlloy]: MINING_MATERIAL_ID.mythril,
};

export const SETTLEMENT_VILLAGE_DONATION_VALUE: Record<
  SettlementVillageDonationMaterialId,
  number
> = Object.fromEntries([
  ...SETTLEMENT_DONATION_MATERIAL_IDS.map((id) => [id, 1] as const),
  ...SETTLEMENT_PROCESSED_DONATION_MATERIAL_IDS.map((id) => [id, 8] as const),
]) as Record<SettlementVillageDonationMaterialId, number>;

export const SETTLEMENT_RESOURCE_TO_MATERIAL = Object.fromEntries(
  SETTLEMENT_DONATION_MATERIAL_IDS.map((materialId) => [
    SETTLEMENT_MATERIAL_TO_RESOURCE[materialId],
    materialId,
  ]),
) as Record<SettlementResourceKey, SettlementDonationMaterialId>;

export const SETTLEMENT_RESOURCE_KEYS = [
  "crop",
  "ore",
  WOODCUTTING_MATERIAL_ID.birch,
  MINING_MATERIAL_ID.copper,
  WOODCUTTING_MATERIAL_ID.willow,
  MINING_MATERIAL_ID.silver,
  WOODCUTTING_MATERIAL_ID.oak,
  MINING_MATERIAL_ID.gold,
  WOODCUTTING_MATERIAL_ID.cedar,
  MINING_MATERIAL_ID.mythril,
  WOODCUTTING_MATERIAL_ID.cypress,
  MINING_MATERIAL_ID.adamantite,
] satisfies SettlementResourceKey[];

export function settlementDonationMaterialName(
  id: SettlementVillageDonationMaterialId,
): string {
  return (
    (WOODCUTTING_MATERIALS as Record<string, { name: string }>)[id]?.name ??
    (MINING_MATERIALS as Record<string, { name: string }>)[id]?.name ??
    (LIFE_PROCESSED_MATERIALS as Record<
      LifeProcessedMaterialId,
      { name: string }
    >)[id as LifeProcessedMaterialId]?.name ??
    id
  );
}

export function settlementResourceName(key: SettlementResourceKey): string {
  if (key === "crop") {
    return settlementDonationMaterialName(WOODCUTTING_MATERIAL_ID.pine);
  }
  if (key === "ore") {
    return settlementDonationMaterialName(MINING_MATERIAL_ID.iron);
  }
  return settlementDonationMaterialName(key);
}

export function settlementResourceIcon(key: SettlementResourceKey): string {
  return key === "crop" || SETTLEMENT_WOOD_MATERIAL_IDS.includes(
    key as (typeof SETTLEMENT_WOOD_MATERIAL_IDS)[number],
  )
    ? PRODUCTION_KIND_ICON.crop
    : PRODUCTION_KIND_ICON.ore;
}

// ── 영지 건축물 ───────────────────────────────────────────────────────────
// 현재는 "마을별 1슬롯에 무엇을 둘지"를 저장/표시하는 골격만 둔다. 실제 제작/연구 효과는 후속 PR.
export type SettlementBuildingId =
  | "guild_smithy"
  | "training_ground"
  | "exploration_hq"
  | "map_workshop"
  | "alchemy_workshop"
  | "dining_hall"
  | "trade_post"
  | "guild_warehouse";

export type SettlementBuildingDef = {
  id: SettlementBuildingId;
  name: string;
  icon: string;
  iconName: import("./gameIcon").GameIconName;
  desc: string;
};

export type SettlementBuildingSlot = {
  id: SettlementBuildingId;
  level: number;
};

export type SettlementBuildings = Record<number, SettlementBuildingSlot>;

export const SETTLEMENT_BUILDINGS: Record<
  SettlementBuildingId,
  SettlementBuildingDef
> = {
  guild_smithy: {
    id: "guild_smithy",
    name: "제작소",
    icon: "⚒️",
    iconName: "Hammer",
    desc: "장비 제작과 대장장이 성장을 위한 영지 시설입니다.",
  },
  training_ground: {
    id: "training_ground",
    name: "훈련장",
    icon: "🎯",
    iconName: "Target",
    desc: "길드원이 매일 현재 직업 숙련도 훈련을 받을 수 있는 영지 시설입니다.",
  },
  exploration_hq: {
    id: "exploration_hq",
    name: "탐사 본부",
    icon: "🧭",
    iconName: "Compass",
    desc: "길드 단위 주간 탐사 의뢰와 원정 진척 보너스를 위한 영지 시설입니다.",
  },
  map_workshop: {
    id: "map_workshop",
    name: "지도 제작소",
    icon: "🗺️",
    iconName: "MapTrifold",
    desc: "길드 탐사 지도를 복원하는 데 필요한 지도 조각을 줄여주는 영지 시설입니다.",
  },
  alchemy_workshop: {
    id: "alchemy_workshop",
    name: "연금 공방",
    icon: "⚗️",
    iconName: "Flask",
    desc: "허브와 은빛잎으로 HP·MP 충전액을 조제하는 길드 공용 시설입니다.",
  },
  dining_hall: {
    id: "dining_hall",
    name: "길드 식당",
    icon: "🍲",
    iconName: "CookingPot",
    desc: "농장과 낚시 식재료로 주간 식사를 준비하는 길드 공용 시설입니다.",
  },
  trade_post: {
    id: "trade_post",
    name: "길드 교역소",
    icon: "⚖️",
    iconName: "Scales",
    desc: "생활 재료를 주간 계약에 공동 납품하고 교역 토큰을 얻는 길드 공용 시설입니다.",
  },
  guild_warehouse: {
    id: "guild_warehouse",
    name: "길드 창고",
    icon: "📦",
    iconName: "Cube",
    desc: "길드원이 재료를 함께 보관하고 운영진이 필요한 곳에 배분하는 공용 시설입니다.",
  },
};
export const SETTLEMENT_BUILDING_IDS = Object.keys(
  SETTLEMENT_BUILDINGS,
) as SettlementBuildingId[];
export const PLACEABLE_SETTLEMENT_BUILDING_IDS: SettlementBuildingId[] = [
  "guild_smithy",
  "training_ground",
  "exploration_hq",
  "alchemy_workshop",
  "dining_hall",
  "trade_post",
  "guild_warehouse",
];

export const GUILD_FACILITY_UNLOCK_GOLD_COST: Partial<
  Record<SettlementBuildingId, number>
> = {
  guild_smithy: 50_000_000,
  training_ground: 80_000_000,
  exploration_hq: 65_000_000,
  map_workshop: 15_000_000,
  alchemy_workshop: 60_000_000,
  dining_hall: 50_000_000,
  trade_post: 70_000_000,
  guild_warehouse: 60_000_000,
};

export const MAX_SETTLEMENT_BUILDING_LEVEL = 5;

export type SettlementBuildingUpgradeCost = Partial<
  Record<SettlementResourceKey, number>
> & {
  gold?: number;
  fame?: number;
};

export type SettlementBuildingUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  qualityChanceBonusPct: number;
  weeklyProgressBonusPct: number;
  label: string;
};

function facilityResourceCostForLevel(
  level: 2 | 3 | 4 | 5,
): Partial<Record<SettlementResourceKey, number>> {
  if (level === 2) {
    return { crop: 500, ore: 500 };
  }
  if (level === 3) {
    return {
      crop: 900,
      ore: 900,
      [WOODCUTTING_MATERIAL_ID.birch]: 600,
      [MINING_MATERIAL_ID.copper]: 600,
    };
  }
  if (level === 4) {
    return {
      [WOODCUTTING_MATERIAL_ID.birch]: 1400,
      [MINING_MATERIAL_ID.copper]: 1400,
      [WOODCUTTING_MATERIAL_ID.willow]: 1000,
      [MINING_MATERIAL_ID.silver]: 1000,
      [WOODCUTTING_MATERIAL_ID.oak]: 600,
      [MINING_MATERIAL_ID.gold]: 600,
    };
  }
  return {
    [WOODCUTTING_MATERIAL_ID.willow]: 2000,
    [MINING_MATERIAL_ID.silver]: 2000,
    [WOODCUTTING_MATERIAL_ID.oak]: 1500,
    [MINING_MATERIAL_ID.gold]: 1500,
    [WOODCUTTING_MATERIAL_ID.cedar]: 1000,
    [MINING_MATERIAL_ID.mythril]: 1000,
    [WOODCUTTING_MATERIAL_ID.cypress]: 500,
    [MINING_MATERIAL_ID.adamantite]: 500,
  };
}

function facilityUpgradeCost(
  level: 2 | 3 | 4 | 5,
  gold: number,
  fame: number,
): SettlementBuildingUpgradeCost {
  return { ...facilityResourceCostForLevel(level), gold, fame };
}

export const GUILD_SMITHY_UPGRADES: readonly SettlementBuildingUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    qualityChanceBonusPct: 0,
    weeklyProgressBonusPct: 0,
    label: "기본 제작",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 20_000_000, 0),
    qualityChanceBonusPct: 1,
    weeklyProgressBonusPct: 10,
    label: "담금질 설비",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 45_000_000, 600),
    qualityChanceBonusPct: 2,
    weeklyProgressBonusPct: 20,
    label: "명장 화로",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 90_000_000, 1250),
    qualityChanceBonusPct: 4,
    weeklyProgressBonusPct: 30,
    label: "장인 조합 설비",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 160_000_000, 2500),
    qualityChanceBonusPct: 6,
    weeklyProgressBonusPct: 40,
    label: "대장장이 전당",
  },
];

export type TrainingGroundUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  trainingRewardBonusPct: number;
  unlockedDrillCount: number;
  label: string;
};

export const TRAINING_GROUND_UPGRADES: readonly TrainingGroundUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    trainingRewardBonusPct: 0,
    unlockedDrillCount: 1,
    label: "기초 훈련장",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 25_000_000, 0),
    trainingRewardBonusPct: 10,
    unlockedDrillCount: 1,
    label: "장비 훈련 구역",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 55_000_000, 750),
    trainingRewardBonusPct: 20,
    unlockedDrillCount: 2,
    label: "실전 교관 배치",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 110_000_000, 1600),
    trainingRewardBonusPct: 35,
    unlockedDrillCount: 2,
    label: "전술 훈련장",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 190_000_000, 3000),
    trainingRewardBonusPct: 50,
    unlockedDrillCount: 3,
    label: "정예 훈련소",
  },
];

export type MapWorkshopUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  fragmentDiscountPct: number;
  label: string;
};

export type ExplorationHqUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  weeklyMissionCount: number;
  missionProgressBonusPct: number;
  label: string;
};

export type AlchemyWorkshopUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  weeklyEnergy: number;
  label: string;
};

export type DiningHallUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  /** 기본 1장과 별도로 기부로 얻을 수 있는 주간 식권 상한. */
  weeklyMealTickets: number;
  weeklyMenuSlots: number;
  label: string;
};

export type TradePostUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  weeklyContractCount: number;
  personalContributionCap: number;
  tokenYieldBonusPct: number;
  completionRewardBonusPct: number;
  label: string;
};

export type GuildWarehouseUpgradeDef = {
  level: number;
  cost: SettlementBuildingUpgradeCost;
  capacity: number;
  label: string;
};

export const MAP_WORKSHOP_UPGRADES: readonly MapWorkshopUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    fragmentDiscountPct: 5,
    label: "낡은 제도대",
  },
  {
    level: 2,
    cost: { crop: 500, ore: 400 },
    fragmentDiscountPct: 10,
    label: "측량 도구",
  },
  {
    level: 3,
    cost: { crop: 1400, ore: 1100 },
    fragmentDiscountPct: 15,
    label: "정밀 나침반",
  },
  {
    level: 4,
    cost: { crop: 3200, ore: 2600 },
    fragmentDiscountPct: 20,
    label: "항로 기록실",
  },
  {
    level: 5,
    cost: { crop: 6800, ore: 5400 },
    fragmentDiscountPct: 25,
    label: "왕립 지도 보관소",
  },
];

export const EXPLORATION_HQ_UPGRADES: readonly ExplorationHqUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    weeklyMissionCount: 1,
    missionProgressBonusPct: 0,
    label: "탐사 게시판",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 22_000_000, 0),
    weeklyMissionCount: 2,
    missionProgressBonusPct: 10,
    label: "정찰 기록실",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 50_000_000, 700),
    weeklyMissionCount: 3,
    missionProgressBonusPct: 15,
    label: "원정 지휘소",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 100_000_000, 1500),
    weeklyMissionCount: 4,
    missionProgressBonusPct: 25,
    label: "길잡이 회의실",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 175_000_000, 2800),
    weeklyMissionCount: 6,
    missionProgressBonusPct: 35,
    label: "대륙 탐사 본부",
  },
];

export const ALCHEMY_WORKSHOP_UPGRADES: readonly AlchemyWorkshopUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    weeklyEnergy: 12,
    label: "약초 분쇄대",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 20_000_000, 0),
    weeklyEnergy: 16,
    label: "추출 조제실",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 45_000_000, 600),
    weeklyEnergy: 20,
    label: "정밀 증류기",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 90_000_000, 1250),
    weeklyEnergy: 24,
    label: "마력 촉매실",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 160_000_000, 2500),
    weeklyEnergy: 30,
    label: "대연금 연구소",
  },
];

export const DINING_HALL_UPGRADES: readonly DiningHallUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    weeklyMealTickets: 2,
    weeklyMenuSlots: 1,
    label: "공동 취사장",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 20_000_000, 0),
    weeklyMealTickets: 2,
    weeklyMenuSlots: 2,
    label: "식재료 저장고",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 45_000_000, 600),
    weeklyMealTickets: 3,
    weeklyMenuSlots: 3,
    label: "전문 조리실",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 90_000_000, 1250),
    weeklyMealTickets: 4,
    weeklyMenuSlots: 4,
    label: "연회 준비실",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 160_000_000, 2500),
    weeklyMealTickets: 5,
    weeklyMenuSlots: 5,
    label: "길드 대연회장",
  },
];

export const TRADE_POST_UPGRADES: readonly TradePostUpgradeDef[] = [
  {
    level: 1,
    cost: {},
    weeklyContractCount: 3,
    personalContributionCap: 120,
    tokenYieldBonusPct: 20,
    completionRewardBonusPct: 0,
    label: "임시 교역 천막",
  },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 25_000_000, 0),
    weeklyContractCount: 3,
    personalContributionCap: 200,
    tokenYieldBonusPct: 70,
    completionRewardBonusPct: 25,
    label: "상단 접수대",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 55_000_000, 750),
    weeklyContractCount: 4,
    personalContributionCap: 300,
    tokenYieldBonusPct: 120,
    completionRewardBonusPct: 50,
    label: "광역 물류창고",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 110_000_000, 1600),
    weeklyContractCount: 4,
    personalContributionCap: 420,
    tokenYieldBonusPct: 170,
    completionRewardBonusPct: 75,
    label: "대륙 상단 지부",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 190_000_000, 3000),
    weeklyContractCount: 5,
    personalContributionCap: 600,
    tokenYieldBonusPct: 220,
    completionRewardBonusPct: 100,
    label: "왕립 교역 연합소",
  },
];

export const GUILD_WAREHOUSE_UPGRADES: readonly GuildWarehouseUpgradeDef[] = [
  { level: 1, cost: {}, capacity: 1, label: "공동 보관실" },
  {
    level: 2,
    cost: facilityUpgradeCost(2, 20_000_000, 0),
    capacity: 3,
    label: "분류 선반",
  },
  {
    level: 3,
    cost: facilityUpgradeCost(3, 45_000_000, 600),
    capacity: 5,
    label: "물류 관리실",
  },
  {
    level: 4,
    cost: facilityUpgradeCost(4, 90_000_000, 1250),
    capacity: 7,
    label: "대형 적재고",
  },
  {
    level: 5,
    cost: facilityUpgradeCost(5, 160_000_000, 2500),
    capacity: 9,
    label: "왕립 공동 창고",
  },
];

export type AnySettlementBuildingUpgradeDef =
  | SettlementBuildingUpgradeDef
  | TrainingGroundUpgradeDef
  | MapWorkshopUpgradeDef
  | ExplorationHqUpgradeDef
  | AlchemyWorkshopUpgradeDef
  | DiningHallUpgradeDef
  | TradePostUpgradeDef
  | GuildWarehouseUpgradeDef;

export function clampSettlementBuildingLevel(level: unknown): number {
  const n = Math.floor(Number(level) || 1);
  return Math.min(MAX_SETTLEMENT_BUILDING_LEVEL, Math.max(1, n));
}

export function settlementBuildingSlot(
  id: SettlementBuildingId,
  level: unknown = 1,
): SettlementBuildingSlot {
  return { id, level: clampSettlementBuildingLevel(level) };
}

export function settlementBuildingIdOf(
  raw: unknown,
): SettlementBuildingId | null {
  if (isSettlementBuildingId(raw)) return raw;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const id = (raw as Record<string, unknown>).id;
  return isSettlementBuildingId(id) ? id : null;
}

export function settlementBuildingLevelOf(raw: unknown): number {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return 1;
  return clampSettlementBuildingLevel((raw as Record<string, unknown>).level);
}

export function guildSmithyUpgradeForLevel(
  level: number,
): SettlementBuildingUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_SMITHY_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    GUILD_SMITHY_UPGRADES[0]
  );
}

export function nextGuildSmithyUpgrade(
  level: number,
): SettlementBuildingUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_SMITHY_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function trainingGroundUpgradeForLevel(
  level: number,
): TrainingGroundUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRAINING_GROUND_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    TRAINING_GROUND_UPGRADES[0]
  );
}

export function nextTrainingGroundUpgrade(
  level: number,
): TrainingGroundUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRAINING_GROUND_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ??
    null
  );
}

export function explorationHqUpgradeForLevel(
  level: number,
): ExplorationHqUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    EXPLORATION_HQ_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    EXPLORATION_HQ_UPGRADES[0]
  );
}

export function nextExplorationHqUpgrade(
  level: number,
): ExplorationHqUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    EXPLORATION_HQ_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ??
    null
  );
}

export function alchemyWorkshopUpgradeForLevel(
  level: number,
): AlchemyWorkshopUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    ALCHEMY_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    ALCHEMY_WORKSHOP_UPGRADES[0]
  );
}

export function nextAlchemyWorkshopUpgrade(
  level: number,
): AlchemyWorkshopUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    ALCHEMY_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function diningHallUpgradeForLevel(
  level: number,
): DiningHallUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    DINING_HALL_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    DINING_HALL_UPGRADES[0]
  );
}

export function nextDiningHallUpgrade(
  level: number,
): DiningHallUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    DINING_HALL_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function tradePostUpgradeForLevel(level: number): TradePostUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRADE_POST_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    TRADE_POST_UPGRADES[0]
  );
}

export function nextTradePostUpgrade(
  level: number,
): TradePostUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    TRADE_POST_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function guildWarehouseUpgradeForLevel(
  level: number,
): GuildWarehouseUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_WAREHOUSE_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    GUILD_WAREHOUSE_UPGRADES[0]
  );
}

export function nextGuildWarehouseUpgrade(
  level: number,
): GuildWarehouseUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    GUILD_WAREHOUSE_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ??
    null
  );
}

export function mapWorkshopUpgradeForLevel(level: number): MapWorkshopUpgradeDef {
  const safe = clampSettlementBuildingLevel(level);
  return (
    MAP_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe) ??
    MAP_WORKSHOP_UPGRADES[0]
  );
}

export function nextMapWorkshopUpgrade(
  level: number,
): MapWorkshopUpgradeDef | null {
  const safe = clampSettlementBuildingLevel(level);
  return (
    MAP_WORKSHOP_UPGRADES.find((upgrade) => upgrade.level === safe + 1) ?? null
  );
}

export function nextSettlementBuildingUpgrade(
  buildingId: SettlementBuildingId,
  level: number,
): AnySettlementBuildingUpgradeDef | null {
  if (buildingId === "training_ground") {
    return nextTrainingGroundUpgrade(level);
  }
  if (buildingId === "exploration_hq") {
    return nextExplorationHqUpgrade(level);
  }
  if (buildingId === "map_workshop") {
    return nextMapWorkshopUpgrade(level);
  }
  if (buildingId === "alchemy_workshop") {
    return nextAlchemyWorkshopUpgrade(level);
  }
  if (buildingId === "dining_hall") {
    return nextDiningHallUpgrade(level);
  }
  if (buildingId === "trade_post") {
    return nextTradePostUpgrade(level);
  }
  if (buildingId === "guild_warehouse") {
    return nextGuildWarehouseUpgrade(level);
  }
  if (buildingId === "guild_smithy") {
    return nextGuildSmithyUpgrade(level);
  }
  return null;
}

export function settlementBuildingUpgradeSummary(
  buildingId: SettlementBuildingId,
  upgrade: AnySettlementBuildingUpgradeDef,
): string {
  if (buildingId === "training_ground") {
    const training = upgrade as TrainingGroundUpgradeDef;
    return `훈련 보상 +${training.trainingRewardBonusPct}% · 일일 훈련 ${training.unlockedDrillCount}회`;
  }
  if (buildingId === "exploration_hq") {
    const exploration = upgrade as ExplorationHqUpgradeDef;
    return `해금 의뢰 ${exploration.weeklyMissionCount}종 · 진척 +${exploration.missionProgressBonusPct}%`;
  }
  if (buildingId === "map_workshop") {
    const map = upgrade as MapWorkshopUpgradeDef;
    return `지도 조각 비용 -${map.fragmentDiscountPct}%`;
  }
  if (buildingId === "alchemy_workshop") {
    const alchemy = upgrade as AlchemyWorkshopUpgradeDef;
    return `주간 연성력 ${alchemy.weeklyEnergy} · 조제법 Lv.${alchemy.level}`;
  }
  if (buildingId === "dining_hall") {
    const dining = upgrade as DiningHallUpgradeDef;
    return `기본 식권 1장 + 기여 식권 ${dining.weeklyMealTickets}장 · 메뉴 ${dining.weeklyMenuSlots}종`;
  }
  if (buildingId === "trade_post") {
    const trade = upgrade as TradePostUpgradeDef;
    return `주간 계약 ${trade.weeklyContractCount}건 · 개인 납품 ${trade.personalContributionCap}점 · 토큰 +${trade.tokenYieldBonusPct}% · 완료 보상 +${trade.completionRewardBonusPct}%`;
  }
  if (buildingId === "guild_warehouse") {
    const warehouse = upgrade as GuildWarehouseUpgradeDef;
    return `아이템 보관 슬롯 ${warehouse.capacity.toLocaleString()}칸`;
  }
  const smithy = upgrade as SettlementBuildingUpgradeDef;
  return `품질 +${smithy.qualityChanceBonusPct}%p · 주간 의뢰 진척 +${smithy.weeklyProgressBonusPct}%`;
}

export function settlementBuildingUpgradeCostText(
  cost: SettlementBuildingUpgradeCost,
): string {
  const parts = SETTLEMENT_RESOURCE_KEYS.filter(
    (key) => (cost[key] ?? 0) > 0,
  ).map(
    (key) =>
      `${settlementResourceIcon(key)} ${settlementResourceName(key)} ${(
        cost[key] ?? 0
      ).toLocaleString()}`,
  );
  if ((cost.gold ?? 0) > 0) {
    parts.push(`길드 금고 ${(cost.gold ?? 0).toLocaleString()}G`);
  }
  if ((cost.fame ?? 0) > 0) {
    parts.push(`길드 명성 ${(cost.fame ?? 0).toLocaleString()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "무료";
}

export function canAffordSettlementBuildingUpgrade(
  resources: SettlementResources,
  cost: SettlementBuildingUpgradeCost,
): boolean {
  return SETTLEMENT_RESOURCE_KEYS.every(
    (key) =>
      Math.max(0, resources[key] ?? 0) >= Math.max(0, cost[key] ?? 0),
  );
}

export function settlementBuildingMaterialsComplete(
  donated: SettlementResources,
  cost: SettlementBuildingUpgradeCost,
): boolean {
  return SETTLEMENT_RESOURCE_KEYS.every(
    (key) =>
      Math.max(0, donated[key] ?? 0) >= Math.max(0, cost[key] ?? 0),
  );
}

export function spendSettlementBuildingUpgradeCost(
  resources: SettlementResources,
  cost: SettlementBuildingUpgradeCost,
): SettlementResources {
  const next: SettlementResources = { ...resources };
  for (const key of SETTLEMENT_RESOURCE_KEYS) {
    const amount = Math.max(0, cost[key] ?? 0);
    if (amount > 0) {
      next[key] = Math.max(0, Math.floor((next[key] ?? 0) - amount));
    }
  }
  return next;
}

export function isSettlementBuildingId(v: unknown): v is SettlementBuildingId {
  return (
    typeof v === "string" &&
    Object.prototype.hasOwnProperty.call(SETTLEMENT_BUILDINGS, v)
  );
}

export function canPlaceSettlementBuilding(
  buildingId: SettlementBuildingId,
): boolean {
  return PLACEABLE_SETTLEMENT_BUILDING_IDS.includes(buildingId);
}

// 특성 → 보너스 받는 생산 종류(없으면 null). farmland=통나무 / mine=철광석 / lake=보너스 없음.
export const TRAIT_BONUS_KIND: Record<TerrainTrait, ProductionKind | null> = {
  plain: null,
  farmland: "crop",
  mine: "ore",
  lake: null, // 어장 — 식량 폐기로 보너스 없음(특성 재배치는 후속)
};
export const TRAIT_BONUS_PCT = 30; // 일치 특성 +30% 수확량 (다이얼)

// 지형 특성 효과(툴팁용). [PR-3 중립화] 슬롯 생산 폐지로 수확 보너스 실효 0 — 중립 표시.
//   TRAIT_BONUS_KIND/TRAIT_BONUS_PCT 데이터는 미래 지형 작업용으로 보존(현재 미표시·미적용).
export function terrainTraitDesc(_trait: TerrainTrait): string {
  return "특별한 효과 없음";
}

// [폐지·PR-3] 슬롯 12h 생산(produce/harvest)은 제거됨 — 통나무/철광석은 사냥 드랍으로 수급
//   (settlementMaterials). 슬롯은 건축물 슬롯 해금(골드 sink)과 건물 배치만 담당.
//   생산 소요시간/수확량/수확 다이얼·헬퍼 삭제. crop/ore 풀은 기부(donate)+업글 소비로만 변동.
// ── 건축물 슬롯 ───────────────────────────────────────────────────────────
// 마을별 건물 슬롯은 1칸으로 압축한다. 장인/영지 건물 콘텐츠가 늘어나기 전까지 선택 압박을 유지하고,
//   슬롯 확장은 후속 건축가/연구/상위 영지 보상으로 다시 열 수 있게 상수 경계만 남긴다.
//   건설 직후엔 빈 상태(0슬롯)이고 골드로 건축물 슬롯을 해금한다.
export const MAX_SLOTS_BY_TIER: Record<VillageTier, number> = {
  village: 1,
  city: 1,
  metropolis: 1,
};
export const GRID_COLS_BY_TIER: Record<VillageTier, number> = {
  village: 1,
  city: 1,
  metropolis: 1,
};
// 화면에 항상 보여주는 슬롯 수 = 가장 큰 단계(대도시) 기준. 현재는 전 단계 1슬롯.
export const GRID_DISPLAY_COLS = GRID_COLS_BY_TIER.metropolis; // 1
export const GRID_DISPLAY_SLOTS = MAX_SLOTS_BY_TIER.metropolis; // 1
// 건설 직후 열려 있는 건축물 슬롯 수 — 0(첫 슬롯도 골드로 해금한다).
export const INITIAL_UNLOCKED_SLOTS = 0;

// 해금 수를 단계별 건축물 슬롯 범위로 보정 — [0, 최대]. 손상/과거 데이터 방어.
export function clampUnlockedSlots(tier: VillageTier, n: number): number {
  if (!Number.isInteger(n) || n < 0) return 0;
  return Math.min(MAX_SLOTS_BY_TIER[tier], n);
}

// 업그레이드 비용(현 단계 → 다음, 길드 정착지 재화). metropolis 는 최종(국가는 별도 게이트).
//   넉넉한 시간경과 생산을 요구하는 큰 비용 — 다이얼(라이브 실측 후 조정).
export const UPGRADE_COST: Partial<
  Record<VillageTier, Partial<Record<ProductionKind, number>>>
> = {
  village: { crop: 400, ore: 250 }, // 마을 → 도시
  city: { crop: 1500, ore: 1000 }, // 도시 → 대도시
};

// ── 생산 작업(개체) [폐지·PR-3 잔존] ── 옛 슬롯 생산 작업 타입. 슬롯 생산(produce/harvest)은
//   제거됐지만 레거시 jobs jsonb(outpost_villages.jobs·schema/v2Settlement 파싱)를 위해 타입만 보존.
export type ProductionJob = {
  kind: ProductionKind;
  /** 시작 시각(ms epoch). [폐지] 옛 수확 준비 판정용. */
  startedAt: number;
};

// 정착지 재화 풀(전환 적립·마을/영지 건축물 업그레이드 소비). 중앙 길드 시설의
// 공동 기부 진행도는 별도 guild_facility_upgrade_donations 에 저장한다.
export type SettlementResources = Partial<Record<SettlementResourceKey, number>>;

export type GuildFacilityDonationProgress = {
  targetLevel: number;
  materials: SettlementResources;
};

export type GuildFacilityDonationProgressMap = Partial<
  Record<SettlementBuildingId, GuildFacilityDonationProgress>
>;

// 업그레이드 가능?(다음 단계 존재 + 현 건축물 슬롯 모두 해금 + 재화 충분). 부족 종류 목록도 함께.
//   needSlots = 현 단계 슬롯을 다 안 열었음.
//   costMultiplier = 자원 비용 배수(타일 정착지의 리베라 거리 스케일용·기본 1=옛 거점 경로 불변).
export function canUpgrade(
  tier: VillageTier,
  unlockedSlots: number,
  resources: SettlementResources,
  costMultiplier = 1,
): {
  ok: boolean;
  next: VillageTier | null;
  missing: ProductionKind[];
  needSlots: boolean;
} {
  const next = nextTier(tier);
  if (!next) return { ok: false, next: null, missing: [], needSlots: false };
  const needSlots = unlockedSlots < MAX_SLOTS_BY_TIER[tier];
  const cost = UPGRADE_COST[tier] ?? {};
  const missing: ProductionKind[] = [];
  for (const k of PRODUCTION_KINDS) {
    const need = Math.round((cost[k] ?? 0) * costMultiplier);
    if ((resources[k] ?? 0) < need) missing.push(k);
  }
  return { ok: !needSlots && missing.length === 0, next, missing, needSlots };
}

// 업그레이드 비용 차감(순수) — canUpgrade 통과 가정. 차감된 새 재화(비파괴).
//   costMultiplier = canUpgrade 와 동일 배수(차감과 검증 일치 필수).
export function applyUpgradeCost(
  tier: VillageTier,
  resources: SettlementResources,
  costMultiplier = 1,
): SettlementResources {
  const cost = UPGRADE_COST[tier] ?? {};
  const next: SettlementResources = { ...resources };
  for (const k of PRODUCTION_KINDS) {
    const need = Math.round((cost[k] ?? 0) * costMultiplier);
    if (need > 0) next[k] = Math.max(0, (next[k] ?? 0) - need);
  }
  return next;
}

// ── 마을 건설 비용 ── 빈 공터에 마을을 세울 때 드는 길드 금고 골드(1회). ──────────
export const VILLAGE_BUILD_GOLD_COST = 10_000_000; // 마을 건설 1천만

// ── 건축물 슬롯 해금 ── 다음 슬롯을 길드 골드로 연다(단계 업그레이드와 별개).
// 비용 = 길드 금고 골드(거점 세금/입금 풀). 현재 마을별 1슬롯이므로 첫 슬롯 5천만만 사용된다.
export const SLOT_UNLOCK_GOLD_BASE = 50_000_000; // 첫 칸 5천만
export const SLOT_UNLOCK_GOLD_STEP = 50_000_000; // 후속 슬롯 확장용 다이얼
export function slotUnlockGoldCost(currentUnlocked: number): number {
  if (currentUnlocked < 0) return 0;
  return SLOT_UNLOCK_GOLD_BASE + SLOT_UNLOCK_GOLD_STEP * currentUnlocked;
}

// 건축물 슬롯 해금 가능?(여유 + 길드 골드 충분). atMax = 현 단계 슬롯을 다 열었음.
export function canUnlockSlot(
  tier: VillageTier,
  unlockedSlots: number,
  gold: number,
): { ok: boolean; atMax: boolean; cost: number } {
  const cost = slotUnlockGoldCost(unlockedSlots);
  if (unlockedSlots >= MAX_SLOTS_BY_TIER[tier]) {
    return { ok: false, atMax: true, cost };
  }
  return { ok: gold >= cost, atMax: false, cost };
}

// ── 건설/명명 ── 빈 공터(점령지)에 마을을 세우고 길드가 이름을 짓는다. ─────────────
// 닉네임 규약과 동일(1~16자).
export const VILLAGE_NAME_MAX = 16;
export function isValidVillageName(name: string): boolean {
  const t = name.trim();
  return t.length >= 1 && t.length <= VILLAGE_NAME_MAX;
}
