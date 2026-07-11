export const FARM_SAVE_KEY = "farm.v2";

export const FARM_PLOT_COUNT = 2;

export const FARM_MAX_PLOT_COUNT = 6;

export const FARM_DAILY_DELIVERY_LIMIT = 2;

export const FARMING_LEVEL_XP_SCALE = 10;
export const FARMING_XP_MS_PER_POINT = 5 * 60 * 1000;

export type FarmCropId =
  | "wheat"
  | "herb"
  | "corn"
  | "tomato"
  | "strawberry"
  | "potato"
  | "onion"
  | "rice"
  | "soybean"
  | "sugarcane"
  | "cacao";

export const FARM_CROP_REQUIRED_SKILL_ID = "v2c_farmer_seedselection";
export const FARM_CROP_REQUIRED_SKILL_NAME = "씨앗 선별";

export const FARM_CROP_UNLOCK_SKILLS = {
  farmer: {
    id: FARM_CROP_REQUIRED_SKILL_ID,
    name: FARM_CROP_REQUIRED_SKILL_NAME,
  },
  horticulturist: {
    id: "v2c_horticulturist_soilreading",
    name: "토양 읽기",
  },
  masterfarmer: {
    id: "v2c_masterfarmer_composting",
    name: "퇴비 배합",
  },
  harvestking: {
    id: "v2c_harvestking_abundance",
    name: "풍작 감각",
  },
  earthartisan: {
    id: "v2c_earthartisan_landcare",
    name: "대지 돌보기",
  },
} as const;

export type FarmSeedInventory = Partial<Record<FarmCropId, number>>;
export type FarmItemInventory = Partial<Record<FarmItemId, number>>;

export const FARM_DAILY_QUEST_SEED_POUCH_NAME = "낡은 씨앗 주머니";

export const FARM_DAILY_QUEST_SEED_REWARD: FarmSeedInventory = {
  wheat: 4,
  herb: 2,
  corn: 1,
};

export const FARM_FISHING_SEED_POUCH_NAME = "물가 씨앗 주머니";

export const FARM_FISHING_CONTRACT_SEED_REWARD: FarmSeedInventory = {
  wheat: 2,
  herb: 1,
};

export const FARM_FISHING_SHOP_SEED_REWARD: FarmSeedInventory = {
  wheat: 3,
  herb: 2,
  corn: 1,
};

export type FarmPlotUpgrade = {
  plotCount: number;
  costReputation: number;
  title: string;
};

export const FARM_PLOT_UPGRADES: readonly FarmPlotUpgrade[] = [
  { plotCount: 3, costReputation: 20, title: "작은 밭두렁" },
  { plotCount: 4, costReputation: 50, title: "두 번째 밭두렁" },
  { plotCount: 5, costReputation: 100, title: "작은 공동 텃밭" },
  { plotCount: 6, costReputation: 180, title: "넓은 공동 텃밭" },
];

export type FarmItemId =
  | "wheat"
  | "golden_wheat"
  | "herb"
  | "silverleaf"
  | "corn"
  | "sweet_corn"
  | "tomato"
  | "heirloom_tomato"
  | "strawberry"
  | "white_strawberry"
  | "potato"
  | "golden_potato"
  | "onion"
  | "pearl_onion"
  | "rice"
  | "golden_rice"
  | "soybean"
  | "black_soybean"
  | "sugarcane"
  | "crystal_sugarcane"
  | "cacao"
  | "royal_cacao";

export type FarmItemDefinition = {
  name: string;
  icon: string;
  imageSrc?: string;
};

export const FARM_ITEMS: Record<FarmItemId, FarmItemDefinition> = {
  wheat: { name: "밀", icon: "🌾", imageSrc: "/images/items/farm/wheat.webp" },
  golden_wheat: {
    name: "황금 밀",
    icon: "✨",
    imageSrc: "/images/items/farm/golden_wheat.webp",
  },
  herb: { name: "허브", icon: "🌿", imageSrc: "/images/items/farm/herb.webp" },
  silverleaf: {
    name: "은빛잎",
    icon: "🍃",
    imageSrc: "/images/items/farm/silverleaf.webp",
  },
  corn: { name: "옥수수", icon: "🌽", imageSrc: "/images/items/farm/corn.webp" },
  sweet_corn: {
    name: "달콤 옥수수",
    icon: "🌽",
    imageSrc: "/images/items/farm/sweet_corn.webp",
  },
  tomato: { name: "토마토", icon: "🍅" },
  heirloom_tomato: { name: "고대종 토마토", icon: "🍅" },
  strawberry: { name: "딸기", icon: "🍓" },
  white_strawberry: { name: "설향 딸기", icon: "🍓" },
  potato: { name: "감자", icon: "🥔" },
  golden_potato: { name: "황금 감자", icon: "🥔" },
  onion: { name: "양파", icon: "🧅" },
  pearl_onion: { name: "진주 양파", icon: "🧅" },
  rice: { name: "쌀", icon: "🍚" },
  golden_rice: { name: "황금 쌀", icon: "🌾" },
  soybean: { name: "콩", icon: "🫘" },
  black_soybean: { name: "검은콩", icon: "🫘" },
  sugarcane: { name: "사탕수수", icon: "🎋" },
  crystal_sugarcane: { name: "수정 사탕수수", icon: "💎" },
  cacao: { name: "카카오", icon: "🍫" },
  royal_cacao: { name: "왕실 카카오", icon: "🍫" },
};

export type FarmCrop = {
  id: FarmCropId;
  name: string;
  seedName: string;
  itemId: FarmItemId;
  itemName: string;
  rareItemId: FarmItemId;
  rareItemName: string;
  growMs: number;
  yieldMin: number;
  yieldMax: number;
  rareChance: number;
  requiredSkillId?: string;
  requiredSkillName?: string;
  note: string;
};

export type FarmPlot = {
  id: string;
  cropId: FarmCropId | null;
  plantedAt: number | null;
  readyAt: number | null;
};

export type FarmState = {
  version: 1;
  plots: FarmPlot[];
  inventory: FarmItemInventory;
  seeds: FarmSeedInventory;
  deliveries: {
    dayKey: string;
    claimedIds: string[];
  };
  weekly: {
    weekKey: string;
    claimedIds: string[];
  };
  stats: {
    harvests: number;
    rareHarvests: number;
    deliveries: number;
    reputation: number;
    reputationSpent: number;
    farmingXp: number;
  };
};

export type FarmHarvestResult = {
  plotId: string;
  cropId: FarmCropId;
  itemId: FarmItemId;
  itemName: string;
  quantity: number;
  rareItemId: FarmItemId | null;
  rareItemName: string | null;
  rareQuantity: number;
  farmingXpGained: number;
  farmingXp: number;
  farmingLevel: number;
};

export type FarmHarvestOptions = {
  yieldBonusPct?: number;
  rareChancePct?: number;
};

export type FarmDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItemId: FarmItemId;
  requiredItemName: string;
  requiredQuantity: number;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmSpecialDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItems: FarmItemInventory;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmSpecialDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmWeeklyDeliveryRequest = {
  id: string;
  title: string;
  note: string;
  requiredItems: FarmItemInventory;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmWeeklyDeliveryResult = {
  requestId: string;
  title: string;
  rewardSeeds: FarmSeedInventory;
  rewardReputation: number;
};

export type FarmShopItem = {
  id: string;
  title: string;
  note: string;
  costReputation: number;
  rewardSeeds: FarmSeedInventory;
  requiredSkillId?: string;
  requiredSkillName?: string;
};

export type FarmShopPurchaseResult = {
  itemId: string;
  title: string;
  costReputation: number;
  rewardSeeds: FarmSeedInventory;
};

export type FarmPlotUpgradeResult = {
  title: string;
  plotCount: number;
  costReputation: number;
};

export const FARM_CROPS: Record<FarmCropId, FarmCrop> = {
  wheat: {
    id: "wheat",
    name: "밀",
    seedName: "밀 씨앗",
    itemId: "wheat",
    itemName: "밀",
    rareItemId: "golden_wheat",
    rareItemName: "황금 밀",
    growMs: 5 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 5,
    rareChance: 0.05,
    note: "빠르게 자라는 기본 작물. 납품과 빵 재료로 쓰기 좋습니다.",
  },
  herb: {
    id: "herb",
    name: "허브",
    seedName: "허브 씨앗",
    itemId: "herb",
    itemName: "허브",
    rareItemId: "silverleaf",
    rareItemName: "은빛잎",
    growMs: 15 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 4,
    rareChance: 0.08,
    note: "회복 음식과 포션 계열로 확장하기 좋은 약초 작물입니다.",
  },
  corn: {
    id: "corn",
    name: "옥수수",
    seedName: "옥수수 씨앗",
    itemId: "corn",
    itemName: "옥수수",
    rareItemId: "sweet_corn",
    rareItemName: "달콤 옥수수",
    growMs: 60 * 60 * 1000,
    yieldMin: 5,
    yieldMax: 8,
    rareChance: 0.1,
    requiredSkillId: FARM_CROP_REQUIRED_SKILL_ID,
    requiredSkillName: FARM_CROP_REQUIRED_SKILL_NAME,
    note: "농부 패시브를 배운 뒤 다룰 수 있는 장기 작물입니다. 오래 걸리지만 수확량이 좋습니다.",
  },
  tomato: {
    id: "tomato",
    name: "토마토",
    seedName: "토마토 씨앗",
    itemId: "tomato",
    itemName: "토마토",
    rareItemId: "heirloom_tomato",
    rareItemName: "고대종 토마토",
    growMs: 30 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 5,
    rareChance: 0.08,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.horticulturist.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.horticulturist.name,
    note: "수프, 소스, 샐러드로 폭넓게 이어지는 원예 작물입니다.",
  },
  strawberry: {
    id: "strawberry",
    name: "딸기",
    seedName: "딸기 씨앗",
    itemId: "strawberry",
    itemName: "딸기",
    rareItemId: "white_strawberry",
    rareItemName: "설향 딸기",
    growMs: 45 * 60 * 1000,
    yieldMin: 2,
    yieldMax: 4,
    rareChance: 0.1,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.horticulturist.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.horticulturist.name,
    note: "잼, 주스, 제과류에 활용하기 좋은 과일 작물입니다.",
  },
  potato: {
    id: "potato",
    name: "감자",
    seedName: "씨감자",
    itemId: "potato",
    itemName: "감자",
    rareItemId: "golden_potato",
    rareItemName: "황금 감자",
    growMs: 90 * 60 * 1000,
    yieldMin: 4,
    yieldMax: 7,
    rareChance: 0.07,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.masterfarmer.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.masterfarmer.name,
    note: "구이, 수프, 전분 가공에 두루 쓰이는 든든한 뿌리작물입니다.",
  },
  onion: {
    id: "onion",
    name: "양파",
    seedName: "양파 씨앗",
    itemId: "onion",
    itemName: "양파",
    rareItemId: "pearl_onion",
    rareItemName: "진주 양파",
    growMs: 2 * 60 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 6,
    rareChance: 0.08,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.masterfarmer.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.masterfarmer.name,
    note: "볶음, 수프, 육류 요리의 맛을 받쳐 주는 핵심 향채입니다.",
  },
  rice: {
    id: "rice",
    name: "쌀",
    seedName: "볍씨",
    itemId: "rice",
    itemName: "쌀",
    rareItemId: "golden_rice",
    rareItemName: "황금 쌀",
    growMs: 3 * 60 * 60 * 1000,
    yieldMin: 5,
    yieldMax: 8,
    rareChance: 0.06,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.harvestking.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.harvestking.name,
    note: "밥, 죽, 떡과 발효식까지 확장되는 상급 주식 작물입니다.",
  },
  soybean: {
    id: "soybean",
    name: "콩",
    seedName: "콩 씨앗",
    itemId: "soybean",
    itemName: "콩",
    rareItemId: "black_soybean",
    rareItemName: "검은콩",
    growMs: 4 * 60 * 60 * 1000,
    yieldMin: 4,
    yieldMax: 7,
    rareChance: 0.08,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.harvestking.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.harvestking.name,
    note: "두부, 장류, 기름과 단백질 요리로 가공하기 좋은 작물입니다.",
  },
  sugarcane: {
    id: "sugarcane",
    name: "사탕수수",
    seedName: "사탕수수 묘목",
    itemId: "sugarcane",
    itemName: "사탕수수",
    rareItemId: "crystal_sugarcane",
    rareItemName: "수정 사탕수수",
    growMs: 6 * 60 * 60 * 1000,
    yieldMin: 4,
    yieldMax: 6,
    rareChance: 0.07,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.earthartisan.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.earthartisan.name,
    note: "설탕, 시럽, 음료와 고급 디저트의 기반이 되는 가공 작물입니다.",
  },
  cacao: {
    id: "cacao",
    name: "카카오",
    seedName: "카카오 묘목",
    itemId: "cacao",
    itemName: "카카오",
    rareItemId: "royal_cacao",
    rareItemName: "왕실 카카오",
    growMs: 8 * 60 * 60 * 1000,
    yieldMin: 3,
    yieldMax: 5,
    rareChance: 0.1,
    requiredSkillId: FARM_CROP_UNLOCK_SKILLS.earthartisan.id,
    requiredSkillName: FARM_CROP_UNLOCK_SKILLS.earthartisan.name,
    note: "초콜릿, 음료, 제과류에 쓰이는 전설 등급의 고급 작물입니다.",
  },
};

export const FARM_CROP_LIST = Object.values(FARM_CROPS);

export const FARM_STARTER_SEEDS: FarmSeedInventory = {
  wheat: 3,
  herb: 1,
};

export function emptyFarmState(now = Date.now()): FarmState {
  return {
    version: 1,
    plots: createFarmPlots(FARM_PLOT_COUNT),
    inventory: {},
    seeds: { ...FARM_STARTER_SEEDS },
    deliveries: { dayKey: farmDayKey(now), claimedIds: [] },
    weekly: { weekKey: farmWeekKey(now), claimedIds: [] },
    stats: {
      harvests: 0,
      rareHarvests: 0,
      deliveries: 0,
      reputation: 0,
      reputationSpent: 0,
      farmingXp: 0,
    },
  };
}

export function parseFarmState(raw: unknown): FarmState {
  const fallback = emptyFarmState();
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<FarmState>;
  const stats = {
    harvests: nonNegativeInt(value.stats?.harvests),
    rareHarvests: nonNegativeInt(value.stats?.rareHarvests),
    deliveries: nonNegativeInt(value.stats?.deliveries),
    reputation: nonNegativeInt(value.stats?.reputation),
    reputationSpent: nonNegativeInt(value.stats?.reputationSpent),
    farmingXp: nonNegativeInt(value.stats?.farmingXp),
  };
  const savedPlots = Array.isArray(value.plots) ? value.plots : [];
  const plotCount = Math.max(
    FARM_PLOT_COUNT,
    Math.min(FARM_MAX_PLOT_COUNT, savedPlots.length || FARM_PLOT_COUNT),
  );
  const plots = createFarmPlots(plotCount).map((base, index) => {
    const candidate = savedPlots[index];
    if (!candidate || typeof candidate !== "object") return base;
    const p = candidate as Partial<FarmPlot>;
    const cropId = isFarmCropId(p.cropId) ? p.cropId : null;
    const plantedAt = cropId ? positiveNumberOrNull(p.plantedAt) : null;
    const readyAt = cropId ? positiveNumberOrNull(p.readyAt) : null;
    return {
      id: base.id,
      cropId,
      plantedAt,
      readyAt,
    };
  });
  return {
    version: 1,
    plots,
    inventory: parseInventory(value.inventory),
    seeds:
      value.seeds === undefined
        ? { ...FARM_STARTER_SEEDS }
        : parseSeedInventory(value.seeds),
    deliveries: parseDeliveryState(value.deliveries),
    weekly: parseWeeklyState(value.weekly),
    stats,
  };
}

export function getFarmDeliveryRequests(): FarmDeliveryRequest[] {
  return [
    {
      id: "bakery-wheat",
      title: "마을 제빵소 보급",
      note: "여관과 제빵소에서 가장 자주 찾는 기본 납품입니다.",
      requiredItemId: "wheat",
      requiredItemName: "밀",
      requiredQuantity: 3,
      rewardSeeds: {},
      rewardReputation: 2,
    },
    {
      id: "clinic-herb",
      title: "치료소 약초 묶음",
      note: "모험가 치료소가 하루치 약초를 모으고 있습니다.",
      requiredItemId: "herb",
      requiredItemName: "허브",
      requiredQuantity: 2,
      rewardSeeds: {},
      rewardReputation: 3,
    },
    {
      id: "market-corn",
      title: "장터 간식 상자",
      note: "오래 자라는 작물을 요구하지만 농장 증표를 더 줍니다.",
      requiredItemId: "corn",
      requiredItemName: "옥수수",
      requiredQuantity: 5,
      rewardSeeds: {},
      rewardReputation: 4,
    },
    {
      id: "inn-tomato",
      title: "여관 토마토 바구니",
      note: "여관 주방에서 소스와 수프에 쓸 잘 익은 토마토를 찾습니다.",
      requiredItemId: "tomato",
      requiredItemName: "토마토",
      requiredQuantity: 3,
      rewardSeeds: {},
      rewardReputation: 3,
    },
    {
      id: "bakery-strawberry",
      title: "제빵소 딸기 상자",
      note: "잼과 과일 타르트를 시험할 제빵소의 주문입니다.",
      requiredItemId: "strawberry",
      requiredItemName: "딸기",
      requiredQuantity: 2,
      rewardSeeds: {},
      rewardReputation: 4,
    },
    {
      id: "tavern-potato",
      title: "주점 감자 자루",
      note: "든든한 모험가 식사를 준비하기 위한 감자 주문입니다.",
      requiredItemId: "potato",
      requiredItemName: "감자",
      requiredQuantity: 5,
      rewardSeeds: {},
      rewardReputation: 5,
    },
    {
      id: "kitchen-onion",
      title: "공동 주방 양파 망",
      note: "여러 요리의 밑맛을 낼 양파를 공동 주방에 납품합니다.",
      requiredItemId: "onion",
      requiredItemName: "양파",
      requiredQuantity: 4,
      rewardSeeds: {},
      rewardReputation: 5,
    },
    {
      id: "granary-rice",
      title: "마을 곡물창고 쌀 포대",
      note: "마을의 주식 비축분으로 쓸 쌀을 곡물창고에서 매입합니다.",
      requiredItemId: "rice",
      requiredItemName: "쌀",
      requiredQuantity: 6,
      rewardSeeds: {},
      rewardReputation: 6,
    },
    {
      id: "fermenter-soybean",
      title: "발효장 콩 자루",
      note: "장류와 두부를 연구하는 발효장의 정기 주문입니다.",
      requiredItemId: "soybean",
      requiredItemName: "콩",
      requiredQuantity: 5,
      rewardSeeds: {},
      rewardReputation: 6,
    },
    {
      id: "confectioner-sugarcane",
      title: "제과점 사탕수수 묶음",
      note: "설탕과 시럽을 만들기 위한 고급 제과점 주문입니다.",
      requiredItemId: "sugarcane",
      requiredItemName: "사탕수수",
      requiredQuantity: 5,
      rewardSeeds: {},
      rewardReputation: 7,
    },
    {
      id: "chocolatier-cacao",
      title: "왕실 제과사 카카오 상자",
      note: "고급 초콜릿과 음료를 연구할 카카오를 구하고 있습니다.",
      requiredItemId: "cacao",
      requiredItemName: "카카오",
      requiredQuantity: 4,
      rewardSeeds: {},
      rewardReputation: 8,
    },
  ];
}

export function getFarmSpecialDeliveryRequests(): FarmSpecialDeliveryRequest[] {
  return [
    {
      id: "rare-golden-wheat",
      title: "제빵장의 황금 밀 주문",
      note: "희귀 수확으로 얻은 황금 밀을 고급 빵 재료로 넘깁니다.",
      requiredItems: { golden_wheat: 1 },
      rewardSeeds: {},
      rewardReputation: 3,
    },
    {
      id: "rare-silverleaf",
      title: "치료소 은빛잎 표본",
      note: "은빛잎은 약효가 좋아 치료소에서 별도 사례를 제공합니다.",
      requiredItems: { silverleaf: 1 },
      rewardSeeds: {},
      rewardReputation: 4,
    },
    {
      id: "rare-sweet-corn",
      title: "장터 달콤 옥수수 상자",
      note: "달콤 옥수수는 축제 간식 재료로 높은 값을 받습니다.",
      requiredItems: { sweet_corn: 1 },
      rewardSeeds: {},
      rewardReputation: 5,
    },
    ...FARM_CROP_LIST.filter(
      (crop) => crop.id !== "corn" && crop.requiredSkillId,
    ).map((crop, index) => ({
      id: `rare-${crop.rareItemId}`,
      title: `${crop.rareItemName} 연구 납품`,
      note: `${crop.rareItemName}의 맛과 가공 특성을 연구하기 위한 희귀 수확 주문입니다.`,
      requiredItems: { [crop.rareItemId]: 1 },
      rewardSeeds: {},
      rewardReputation: 5 + index,
    })),
  ];
}

export function getFarmWeeklyDeliveryRequests(): FarmWeeklyDeliveryRequest[] {
  return [
    {
      id: "weekly-bakery-crate",
      title: "주간 제빵소 밀 상자",
      note: "이번 주 여관과 제빵소에 들어갈 밀을 한 번에 납품합니다.",
      requiredItems: { wheat: 30, golden_wheat: 1 },
      rewardSeeds: {},
      rewardReputation: 8,
    },
    {
      id: "weekly-clinic-bundle",
      title: "주간 치료소 약초 묶음",
      note: "치료소가 회복약 재료를 넉넉히 확보하려 합니다.",
      requiredItems: { herb: 16, silverleaf: 1 },
      rewardSeeds: {},
      rewardReputation: 9,
    },
    {
      id: "weekly-market-cart",
      title: "주간 장터 간식 수레",
      note: "오래 자란 옥수수와 희귀 수확을 모아 장터에 보냅니다.",
      requiredItems: { corn: 24, sweet_corn: 1 },
      rewardSeeds: {},
      rewardReputation: 10,
    },
  ];
}

export function getFarmShopItems(): FarmShopItem[] {
  return [
    {
      id: "seed-crate",
      title: "마을 씨앗 상자",
      note: "씨앗이 끊겼을 때 하루 재파종을 보조하는 소량 묶음입니다.",
      costReputation: 8,
      rewardSeeds: { wheat: 2, herb: 1 },
    },
    {
      id: "herbal-seed-box",
      title: "약초 씨앗 상자",
      note: "허브가 모자랄 때 보충하는 치료소 추천 씨앗입니다.",
      costReputation: 10,
      rewardSeeds: { herb: 2 },
    },
    {
      id: "market-seed-box",
      title: "장터 씨앗 상자",
      note: "옥수수 재배를 이어가기 위한 비싼 장터 보충품입니다.",
      costReputation: 12,
      rewardSeeds: { corn: 2 },
      requiredSkillId: FARM_CROP_UNLOCK_SKILLS.farmer.id,
      requiredSkillName: FARM_CROP_UNLOCK_SKILLS.farmer.name,
    },
    {
      id: "horticulture-seed-box",
      title: "원예가 씨앗 상자",
      note: "소스와 제과 요리의 기반이 될 토마토와 딸기 씨앗입니다.",
      costReputation: 16,
      rewardSeeds: { tomato: 2, strawberry: 1 },
      requiredSkillId: FARM_CROP_UNLOCK_SKILLS.horticulturist.id,
      requiredSkillName: FARM_CROP_UNLOCK_SKILLS.horticulturist.name,
    },
    {
      id: "staple-seed-box",
      title: "숙련 농부 밭작물 상자",
      note: "다양한 식사에 쓰이는 감자와 양파를 함께 보충합니다.",
      costReputation: 20,
      rewardSeeds: { potato: 2, onion: 2 },
      requiredSkillId: FARM_CROP_UNLOCK_SKILLS.masterfarmer.id,
      requiredSkillName: FARM_CROP_UNLOCK_SKILLS.masterfarmer.name,
    },
    {
      id: "artisan-seed-box",
      title: "농업 장인 곡물 상자",
      note: "주식과 발효 요리로 확장되는 볍씨와 콩 씨앗입니다.",
      costReputation: 26,
      rewardSeeds: { rice: 2, soybean: 2 },
      requiredSkillId: FARM_CROP_UNLOCK_SKILLS.harvestking.id,
      requiredSkillName: FARM_CROP_UNLOCK_SKILLS.harvestking.name,
    },
    {
      id: "legendary-seed-box",
      title: "전설의 농부 가공작물 상자",
      note: "설탕과 초콜릿 계열 요리를 위한 사탕수수와 카카오 묘목입니다.",
      costReputation: 34,
      rewardSeeds: { sugarcane: 2, cacao: 1 },
      requiredSkillId: FARM_CROP_UNLOCK_SKILLS.earthartisan.id,
      requiredSkillName: FARM_CROP_UNLOCK_SKILLS.earthartisan.name,
    },
  ];
}

export function normalizeFarmForDay(
  state: FarmState,
  now = Date.now(),
): FarmState {
  const withPlots = normalizeFarmPlotCount(state);
  const dayKey = farmDayKey(now);
  const weekKey = farmWeekKey(now);
  const withDaily =
    withPlots.deliveries.dayKey === dayKey
      ? withPlots
      : {
          ...withPlots,
          deliveries: { dayKey, claimedIds: [] },
        };
  if (withDaily.weekly.weekKey === weekKey) return withDaily;
  return {
    ...withDaily,
    weekly: { weekKey, claimedIds: [] },
  };
}

export function farmAvailableReputation(state: FarmState): number {
  return Math.max(0, state.stats.reputation - state.stats.reputationSpent);
}

export function farmCropMasteryGain(cropId: FarmCropId): number {
  const crop = FARM_CROPS[cropId];
  return Math.max(1, Math.round(crop.growMs / FARMING_XP_MS_PER_POINT));
}

export function farmingLevelXpThreshold(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return (safeLevel - 1) * (safeLevel - 1) * FARMING_LEVEL_XP_SCALE;
}

export function farmingLevelForXp(xp: number): number {
  const safeXp = Math.max(0, Math.floor(xp));
  return Math.floor(Math.sqrt(safeXp / FARMING_LEVEL_XP_SCALE)) + 1;
}

export function farmingLevelForState(state: FarmState): number {
  return farmingLevelForXp(state.stats.farmingXp);
}

export function buyFarmShopItem(
  state: FarmState,
  itemId: string,
  options: { learnedSkillIds?: Iterable<string> | null } = {},
): { state: FarmState; result: FarmShopPurchaseResult } {
  const item = getFarmShopItems().find((entry) => entry.id === itemId);
  if (!item) throw new FarmError("shop_item_not_found");
  if (
    item.requiredSkillId &&
    !hasFarmCropRequiredSkill(options.learnedSkillIds, item.requiredSkillId)
  ) {
    throw new FarmError("shop_item_locked");
  }
  if (farmAvailableReputation(state) < item.costReputation) {
    throw new FarmError("not_enough_reputation");
  }
  const next = grantFarmSeeds(
    {
      ...state,
      stats: {
        ...state.stats,
        reputationSpent: state.stats.reputationSpent + item.costReputation,
      },
    },
    item.rewardSeeds,
  );
  return {
    state: next,
    result: {
      itemId: item.id,
      title: item.title,
      costReputation: item.costReputation,
      rewardSeeds: item.rewardSeeds,
    },
  };
}

export function buyFarmPlotUpgrade(
  state: FarmState,
): { state: FarmState; result: FarmPlotUpgradeResult } {
  const current = normalizeFarmPlotCount(state);
  const upgrade = nextFarmPlotUpgrade(current);
  if (!upgrade) throw new FarmError("plot_upgrade_not_available");
  if (farmAvailableReputation(current) < upgrade.costReputation) {
    throw new FarmError("not_enough_reputation");
  }
  const nextState = normalizeFarmPlotCount({
    ...current,
    plots: createFarmPlots(upgrade.plotCount).map(
      (plot, index) => current.plots[index] ?? plot,
    ),
    stats: {
      ...current.stats,
      reputationSpent: current.stats.reputationSpent + upgrade.costReputation,
    },
  });
  return {
    state: nextState,
    result: {
      title: upgrade.title,
      plotCount: upgrade.plotCount,
      costReputation: upgrade.costReputation,
    },
  };
}

export function claimFarmSpecialDelivery(
  state: FarmState,
  requestId: string,
): { state: FarmState; result: FarmSpecialDeliveryResult } {
  const request = getFarmSpecialDeliveryRequests().find(
    (item) => item.id === requestId,
  );
  if (!request) throw new FarmError("special_delivery_not_found");
  if (!hasFarmItems(state.inventory, request.requiredItems)) {
    throw new FarmError("not_enough_items");
  }
  const seedState = grantFarmSeeds(state, request.rewardSeeds);
  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory: spendFarmItems(seedState.inventory, request.requiredItems),
    stats: {
      ...seedState.stats,
      deliveries: seedState.stats.deliveries + 1,
      reputation: seedState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

export function claimFarmWeeklyDelivery(
  state: FarmState,
  requestId: string,
  now = Date.now(),
): { state: FarmState; result: FarmWeeklyDeliveryResult } {
  const weeklyState = normalizeFarmForDay(state, now);
  const request = getFarmWeeklyDeliveryRequests().find(
    (item) => item.id === requestId,
  );
  if (!request) throw new FarmError("weekly_delivery_not_found");
  if (weeklyState.weekly.claimedIds.includes(request.id)) {
    throw new FarmError("weekly_delivery_already_claimed");
  }
  if (!hasFarmItems(weeklyState.inventory, request.requiredItems)) {
    throw new FarmError("not_enough_items");
  }
  const seedState = grantFarmSeeds(weeklyState, request.rewardSeeds);
  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory: spendFarmItems(seedState.inventory, request.requiredItems),
    weekly: {
      ...seedState.weekly,
      claimedIds: [...seedState.weekly.claimedIds, request.id],
    },
    stats: {
      ...seedState.stats,
      deliveries: seedState.stats.deliveries + 1,
      reputation: seedState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

export function nextFarmPlotUpgrade(state: FarmState): FarmPlotUpgrade | null {
  const count = normalizeFarmPlotCount(state).plots.length;
  return (
    FARM_PLOT_UPGRADES.find((upgrade) => upgrade.plotCount > count) ?? null
  );
}

export function plantCrop(
  state: FarmState,
  plotId: string,
  cropId: FarmCropId,
  now = Date.now(),
  options: { learnedSkillIds?: Iterable<string> | null } = {},
): FarmState {
  const crop = FARM_CROPS[cropId];
  const found = state.plots.find((p) => p.id === plotId);
  if (!found) throw new FarmError("plot_not_found");
  if (found.cropId) throw new FarmError("plot_occupied");
  if (!canPlantFarmCrop(cropId, options.learnedSkillIds)) {
    throw new FarmError("crop_locked");
  }
  if ((state.seeds[cropId] ?? 0) <= 0) throw new FarmError("no_seed");
  const seeds = { ...state.seeds };
  setPositiveCount(seeds, cropId, (seeds[cropId] ?? 0) - 1);
  return {
    ...state,
    seeds,
    plots: state.plots.map((p) =>
      p.id === plotId
        ? {
            ...p,
            cropId,
            plantedAt: now,
            readyAt: now + crop.growMs,
          }
        : p,
    ),
  };
}

export function grantFarmSeeds(
  state: FarmState,
  reward: FarmSeedInventory,
): FarmState {
  const seeds = { ...state.seeds };
  for (const [cropId, count] of Object.entries(reward)) {
    if (isFarmCropId(cropId)) {
      setPositiveCount(seeds, cropId, (seeds[cropId] ?? 0) + nonNegativeInt(count));
    }
  }
  return { ...state, seeds };
}

export function claimFarmDelivery(
  state: FarmState,
  requestId: string,
  now = Date.now(),
): { state: FarmState; result: FarmDeliveryResult } {
  const dailyState = normalizeFarmForDay(state, now);
  const request = getFarmDeliveryRequests().find((item) => item.id === requestId);
  if (!request) throw new FarmError("delivery_not_found");
  if (dailyState.deliveries.claimedIds.includes(request.id)) {
    throw new FarmError("delivery_already_claimed");
  }
  if (dailyState.deliveries.claimedIds.length >= FARM_DAILY_DELIVERY_LIMIT) {
    throw new FarmError("delivery_daily_limit");
  }
  if ((dailyState.inventory[request.requiredItemId] ?? 0) < request.requiredQuantity) {
    throw new FarmError("not_enough_items");
  }

  const inventory = { ...dailyState.inventory };
  setPositiveCount(
    inventory,
    request.requiredItemId,
    (inventory[request.requiredItemId] ?? 0) - request.requiredQuantity,
  );
  const seedState = grantFarmSeeds(dailyState, request.rewardSeeds);

  const nextState = normalizeFarmPlotCount({
    ...seedState,
    inventory,
    deliveries: {
      ...dailyState.deliveries,
      claimedIds: [...dailyState.deliveries.claimedIds, request.id],
    },
    stats: {
      ...dailyState.stats,
      deliveries: dailyState.stats.deliveries + 1,
      reputation: dailyState.stats.reputation + request.rewardReputation,
    },
  });

  return {
    state: nextState,
    result: {
      requestId: request.id,
      title: request.title,
      rewardSeeds: request.rewardSeeds,
      rewardReputation: request.rewardReputation,
    },
  };
}

function normalizeFarmPlotCount(state: FarmState): FarmState {
  const expected = Math.max(
    FARM_PLOT_COUNT,
    Math.min(FARM_MAX_PLOT_COUNT, state.plots.length),
  );
  if (state.plots.length === expected) return state;
  const base = createFarmPlots(expected);
  return {
    ...state,
    plots: base.map((plot, index) => state.plots[index] ?? plot),
  };
}

function createFarmPlots(count: number): FarmPlot[] {
  const safeCount = Math.max(
    FARM_PLOT_COUNT,
    Math.min(FARM_MAX_PLOT_COUNT, nonNegativeInt(count)),
  );
  return Array.from({ length: safeCount }, (_, i) => ({
    id: `plot-${i + 1}`,
    cropId: null,
    plantedAt: null,
    readyAt: null,
  }));
}

export function harvestPlot(
  state: FarmState,
  plotId: string,
  now = Date.now(),
  rng = Math.random,
  options: FarmHarvestOptions = {},
): { state: FarmState; result: FarmHarvestResult } {
  const plot = state.plots.find((p) => p.id === plotId);
  if (!plot) throw new FarmError("plot_not_found");
  if (!plot.cropId || !plot.readyAt) throw new FarmError("plot_empty");
  if (plot.readyAt > now) throw new FarmError("not_ready");

  const crop = FARM_CROPS[plot.cropId];
  const baseQuantity =
    crop.yieldMin +
    Math.floor(rng() * (crop.yieldMax - crop.yieldMin + 1));
  const yieldBonusPct = Math.max(0, options.yieldBonusPct ?? 0);
  const quantity =
    baseQuantity +
    (yieldBonusPct > 0
      ? Math.max(1, Math.floor((baseQuantity * yieldBonusPct) / 100))
      : 0);
  const rareChance = Math.min(
    0.75,
    crop.rareChance + Math.max(0, options.rareChancePct ?? 0) / 100,
  );
  const gotRare = rng() < rareChance;
  const rareQuantity = gotRare ? 1 : 0;
  const inventory = { ...state.inventory };
  inventory[crop.itemId] = (inventory[crop.itemId] ?? 0) + quantity;
  if (gotRare) {
    inventory[crop.rareItemId] = (inventory[crop.rareItemId] ?? 0) + 1;
  }
  const farmingXpGained = farmCropMasteryGain(crop.id);
  const farmingXp = state.stats.farmingXp + farmingXpGained;
  const farmingLevel = farmingLevelForXp(farmingXp);

  return {
    state: {
      ...state,
      plots: state.plots.map((p) =>
        p.id === plotId
          ? { ...p, cropId: null, plantedAt: null, readyAt: null }
          : p,
      ),
      inventory,
      stats: {
        ...state.stats,
        harvests: state.stats.harvests + 1,
        rareHarvests: state.stats.rareHarvests + rareQuantity,
        farmingXp,
      },
    },
    result: {
      plotId,
      cropId: crop.id,
      itemId: crop.itemId,
      itemName: crop.itemName,
      quantity,
      rareItemId: gotRare ? crop.rareItemId : null,
      rareItemName: gotRare ? crop.rareItemName : null,
      rareQuantity,
      farmingXpGained,
      farmingXp,
      farmingLevel,
    },
  };
}

export class FarmError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export function isFarmCropId(value: unknown): value is FarmCropId {
  return typeof value === "string" && value in FARM_CROPS;
}

export function canPlantFarmCrop(
  cropId: FarmCropId,
  learnedSkillIds: Iterable<string> | null | undefined,
): boolean {
  const requiredSkillId = FARM_CROPS[cropId]?.requiredSkillId;
  if (!requiredSkillId) return true;
  return hasFarmCropRequiredSkill(learnedSkillIds, requiredSkillId);
}

export function hasFarmCropRequiredSkill(
  learnedSkillIds: Iterable<string> | null | undefined,
  requiredSkillId: string | undefined = FARM_CROP_REQUIRED_SKILL_ID,
): boolean {
  if (!requiredSkillId) return true;
  if (!learnedSkillIds) return false;
  for (const skillId of learnedSkillIds) {
    if (skillId === requiredSkillId) return true;
  }
  return false;
}

function parseInventory(raw: unknown): FarmItemInventory {
  if (!raw || typeof raw !== "object") return {};
  const out: Partial<Record<FarmItemId, number>> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isFarmItemId(key)) {
      const n = nonNegativeInt(value);
      if (n > 0) out[key] = n;
    }
  }
  return out;
}

function parseSeedInventory(raw: unknown): FarmSeedInventory {
  if (!raw || typeof raw !== "object") return {};
  const out: FarmSeedInventory = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isFarmCropId(key)) {
      const n = nonNegativeInt(value);
      if (n > 0) out[key] = n;
    }
  }
  return out;
}

function parseDeliveryState(raw: unknown): FarmState["deliveries"] {
  if (!raw || typeof raw !== "object") {
    return { dayKey: farmDayKey(), claimedIds: [] };
  }
  const value = raw as Partial<FarmState["deliveries"]>;
  const claimedIds = Array.isArray(value.claimedIds)
    ? value.claimedIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    dayKey: typeof value.dayKey === "string" ? value.dayKey : farmDayKey(),
    claimedIds,
  };
}

function parseWeeklyState(raw: unknown): FarmState["weekly"] {
  if (!raw || typeof raw !== "object") {
    return { weekKey: farmWeekKey(), claimedIds: [] };
  }
  const value = raw as Partial<FarmState["weekly"]>;
  const claimedIds = Array.isArray(value.claimedIds)
    ? value.claimedIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    weekKey: typeof value.weekKey === "string" ? value.weekKey : farmWeekKey(),
    claimedIds,
  };
}

function hasFarmItems(
  inventory: FarmItemInventory,
  requirements: FarmItemInventory,
): boolean {
  return Object.entries(requirements).every(([itemId, count]) => {
    if (!isFarmItemId(itemId)) return true;
    return (inventory[itemId] ?? 0) >= nonNegativeInt(count);
  });
}

function spendFarmItems(
  inventory: FarmItemInventory,
  requirements: FarmItemInventory,
): FarmItemInventory {
  const next = { ...inventory };
  for (const [itemId, count] of Object.entries(requirements)) {
    if (!isFarmItemId(itemId)) continue;
    setPositiveCount(next, itemId, (next[itemId] ?? 0) - nonNegativeInt(count));
  }
  return next;
}

function isFarmItemId(value: string): value is FarmItemId {
  return FARM_CROP_LIST.some(
    (crop) => crop.itemId === value || crop.rareItemId === value,
  );
}

function positiveNumberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function nonNegativeInt(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function setPositiveCount<T extends string>(
  record: Partial<Record<T, number>>,
  key: T,
  value: number,
) {
  if (value > 0) {
    record[key] = Math.floor(value);
  } else {
    delete record[key];
  }
}

function farmDayKey(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function farmWeekKey(now = Date.now()): string {
  const date = new Date(now + 9 * 60 * 60 * 1000);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}
