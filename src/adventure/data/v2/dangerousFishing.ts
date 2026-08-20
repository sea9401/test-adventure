export type DangerousZoneId =
  | "shattered_reef"
  | "storm_trench"
  | "abyssal_rift";
export type DangerousDepthId = "surface" | "midwater" | "deep";
export type DangerousFishId =
  | "razor_sardine"
  | "ironjaw_tuna"
  | "reef_maw_grouper"
  | "storm_mackerel"
  | "thunder_ray"
  | "tempest_swordfish"
  | "lantern_eel"
  | "voidfin_coelacanth"
  | "abyssal_crownfish";
export type DangerousGearKind = "rod" | "reel" | "line";
export type DangerousRodId = "starter_rod" | "breaker_rod" | "leviathan_rod";
export type DangerousReelId =
  | "starter_reel"
  | "current_reel"
  | "maelstrom_reel";
export type DangerousLineId =
  | "starter_line"
  | "braided_line"
  | "abyss_chain_line";
export type DangerousBaitId =
  | "basic_bait"
  | "reef_bait"
  | "blood_bait"
  | "luminous_bait"
  | "abyss_bait";
export type DangerousBossId = "tidal_colossus" | "abyss_kraken";
export type DangerousFishBehavior = "charge" | "thrash" | "turn" | "dive";
export type DangerousFishRarity = "common" | "rare" | "epic" | "legendary";

export type DangerousZone = {
  id: DangerousZoneId;
  imageSrc: string;
  name: string;
  description: string;
  unlockLevel: number;
  baseRisk: number;
};

export type DangerousDepth = {
  id: DangerousDepthId;
  name: string;
  description: string;
  riskBonus: number;
};

export type DangerousFish = {
  id: DangerousFishId;
  imageSrc: string;
  name: string;
  description: string;
  zoneId: DangerousZoneId;
  depthId: DangerousDepthId;
  rarity: DangerousFishRarity;
  behaviorPattern: readonly DangerousFishBehavior[];
  stamina: number;
  distance: number;
  baseTension: number;
  minSizeCm: number;
  maxSizeCm: number;
  cargoValue: number;
  fishingXp: number;
  fishingCoinReward: number;
  spawnWeight: number;
};

export type DangerousRod = {
  id: DangerousRodId;
  imageSrc: string;
  name: string;
  description: string;
  price: number;
  maxTensionBonus: number;
  staminaDamageBonus: number;
};

export type DangerousReel = {
  id: DangerousReelId;
  imageSrc: string;
  name: string;
  description: string;
  price: number;
  reelPowerBonus: number;
  tensionControlBonus: number;
};

export type DangerousLine = {
  id: DangerousLineId;
  imageSrc: string;
  name: string;
  description: string;
  price: number;
  maxTensionBonus: number;
  slackTolerance: number;
};

export type DangerousBait = {
  id: DangerousBaitId;
  imageSrc: string;
  name: string;
  description: string;
  price: number;
  packSize: number;
  unlimited: boolean;
  targetBehaviors: readonly DangerousFishBehavior[];
  rarityBonus: number;
};

export type DangerousBoss = {
  id: DangerousBossId;
  imageSrc: string;
  name: string;
  description: string;
  minRisk: number;
  eventStamina: number;
  attemptStamina: number;
  attemptDistance: number;
  baseTension: number;
  behaviorPattern: readonly DangerousFishBehavior[];
};

export const DANGEROUS_ZONES: Record<DangerousZoneId, DangerousZone> = {
  shattered_reef: {
    id: "shattered_reef",
    imageSrc: "/images/ui/dangerous-fishing-shattered-reef.webp",
    name: "파쇄 암초",
    description: "부서진 암초 사이로 빠른 어종이 몰려드는 초입 해역.",
    unlockLevel: 15,
    baseRisk: 0,
  },
  storm_trench: {
    id: "storm_trench",
    imageSrc: "/images/ui/dangerous-fishing-storm-trench.webp",
    name: "폭풍 해구",
    description: "급류와 낙뢰가 반복되어 한순간의 판단이 중요한 해역.",
    unlockLevel: 25,
    baseRisk: 2,
  },
  abyssal_rift: {
    id: "abyssal_rift",
    imageSrc: "/images/ui/dangerous-fishing-abyssal-rift.webp",
    name: "심연 균열",
    description: "빛이 닿지 않는 균열. 거대한 그림자가 줄을 노린다.",
    unlockLevel: 35,
    baseRisk: 3,
  },
};

export const DANGEROUS_DEPTHS: Record<DangerousDepthId, DangerousDepth> = {
  surface: {
    id: "surface",
    name: "표층",
    description: "시야가 확보되어 사고 위험이 낮다.",
    riskBonus: 0,
  },
  midwater: {
    id: "midwater",
    name: "중층",
    description: "급류가 교차해 어종의 움직임이 거칠어진다.",
    riskBonus: 1,
  },
  deep: {
    id: "deep",
    name: "심층",
    description: "귀환 위험을 감수하고 희귀 어종을 노리는 수심.",
    riskBonus: 2,
  },
};

export const DANGEROUS_FISH: Record<DangerousFishId, DangerousFish> = {
  razor_sardine: {
    id: "razor_sardine",
    imageSrc: "/images/fish/razor_sardine.webp",
    name: "칼날 정어리",
    description: "암초 가장자리를 떼 지어 돌진하는 은빛 어종.",
    zoneId: "shattered_reef",
    depthId: "surface",
    rarity: "common",
    behaviorPattern: ["charge", "turn", "charge", "thrash"],
    stamina: 42,
    distance: 42,
    baseTension: 36,
    minSizeCm: 32,
    maxSizeCm: 58,
    cargoValue: 80,
    fishingXp: 18,
    fishingCoinReward: 4,
    spawnWeight: 42,
  },
  ironjaw_tuna: {
    id: "ironjaw_tuna",
    imageSrc: "/images/fish/ironjaw_tuna.webp",
    name: "철턱 참치",
    description: "단단한 턱으로 바늘을 비틀며 갑자기 방향을 바꾼다.",
    zoneId: "shattered_reef",
    depthId: "midwater",
    rarity: "rare",
    behaviorPattern: ["turn", "charge", "thrash", "turn"],
    stamina: 66,
    distance: 58,
    baseTension: 42,
    minSizeCm: 96,
    maxSizeCm: 168,
    cargoValue: 210,
    fishingXp: 34,
    fishingCoinReward: 8,
    spawnWeight: 30,
  },
  reef_maw_grouper: {
    id: "reef_maw_grouper",
    imageSrc: "/images/fish/reef_maw_grouper.webp",
    name: "암초아귀 바리",
    description: "바위틈에 몸을 고정하고 거친 몸부림으로 줄을 긁는다.",
    zoneId: "shattered_reef",
    depthId: "deep",
    rarity: "epic",
    behaviorPattern: ["thrash", "dive", "thrash", "turn"],
    stamina: 92,
    distance: 74,
    baseTension: 48,
    minSizeCm: 180,
    maxSizeCm: 290,
    cargoValue: 430,
    fishingXp: 58,
    fishingCoinReward: 14,
    spawnWeight: 14,
  },
  storm_mackerel: {
    id: "storm_mackerel",
    imageSrc: "/images/fish/storm_mackerel.webp",
    name: "폭풍 고등어",
    description: "파도와 같은 방향으로 선회하며 낚싯줄을 교란한다.",
    zoneId: "storm_trench",
    depthId: "surface",
    rarity: "common",
    behaviorPattern: ["turn", "charge", "turn", "dive"],
    stamina: 58,
    distance: 54,
    baseTension: 40,
    minSizeCm: 54,
    maxSizeCm: 92,
    cargoValue: 150,
    fishingXp: 28,
    fishingCoinReward: 6,
    spawnWeight: 38,
  },
  thunder_ray: {
    id: "thunder_ray",
    imageSrc: "/images/fish/thunder_ray.webp",
    name: "뇌광 가오리",
    description: "날개를 크게 떨며 순간적으로 줄 전체에 충격을 보낸다.",
    zoneId: "storm_trench",
    depthId: "midwater",
    rarity: "rare",
    behaviorPattern: ["thrash", "turn", "charge", "thrash"],
    stamina: 86,
    distance: 68,
    baseTension: 47,
    minSizeCm: 150,
    maxSizeCm: 245,
    cargoValue: 330,
    fishingXp: 46,
    fishingCoinReward: 11,
    spawnWeight: 27,
  },
  tempest_swordfish: {
    id: "tempest_swordfish",
    imageSrc: "/images/fish/tempest_swordfish.webp",
    name: "태풍 황새치",
    description: "폭풍의 흐름을 타고 먼 거리에서 연속 돌진한다.",
    zoneId: "storm_trench",
    depthId: "deep",
    rarity: "epic",
    behaviorPattern: ["charge", "charge", "turn", "dive", "thrash"],
    stamina: 118,
    distance: 92,
    baseTension: 54,
    minSizeCm: 230,
    maxSizeCm: 390,
    cargoValue: 680,
    fishingXp: 76,
    fishingCoinReward: 20,
    spawnWeight: 12,
  },
  lantern_eel: {
    id: "lantern_eel",
    imageSrc: "/images/fish/lantern_eel.webp",
    name: "등불 장어",
    description: "희미한 빛을 남긴 채 수직으로 파고드는 심해 어종.",
    zoneId: "abyssal_rift",
    depthId: "surface",
    rarity: "rare",
    behaviorPattern: ["dive", "turn", "dive", "thrash"],
    stamina: 82,
    distance: 72,
    baseTension: 46,
    minSizeCm: 120,
    maxSizeCm: 210,
    cargoValue: 390,
    fishingXp: 52,
    fishingCoinReward: 13,
    spawnWeight: 32,
  },
  voidfin_coelacanth: {
    id: "voidfin_coelacanth",
    imageSrc: "/images/fish/voidfin_coelacanth.webp",
    name: "공허지느러미 실러캔스",
    description: "거대한 지느러미로 급류를 만들며 깊이를 수시로 바꾼다.",
    zoneId: "abyssal_rift",
    depthId: "midwater",
    rarity: "epic",
    behaviorPattern: ["dive", "thrash", "turn", "charge", "dive"],
    stamina: 126,
    distance: 96,
    baseTension: 56,
    minSizeCm: 260,
    maxSizeCm: 430,
    cargoValue: 790,
    fishingXp: 88,
    fishingCoinReward: 23,
    spawnWeight: 18,
  },
  abyssal_crownfish: {
    id: "abyssal_crownfish",
    imageSrc: "/images/fish/abyssal_crownfish.webp",
    name: "심연 왕관어",
    description: "네 가지 움직임을 변칙적으로 섞어 쓰는 위험 해역의 지배자.",
    zoneId: "abyssal_rift",
    depthId: "deep",
    rarity: "legendary",
    behaviorPattern: ["dive", "charge", "thrash", "turn", "charge", "dive"],
    stamina: 168,
    distance: 124,
    baseTension: 62,
    minSizeCm: 340,
    maxSizeCm: 620,
    cargoValue: 1_350,
    fishingXp: 130,
    fishingCoinReward: 36,
    spawnWeight: 7,
  },
};

export const DANGEROUS_RODS: Record<DangerousRodId, DangerousRod> = {
  starter_rod: {
    id: "starter_rod",
    imageSrc: "/images/items/fishing/dangerous/starter_rod.webp",
    name: "해역 입문 낚싯대",
    description: "위험 해역 출항 허가와 함께 지급되는 기본 낚싯대.",
    price: 0,
    maxTensionBonus: 0,
    staminaDamageBonus: 0,
  },
  breaker_rod: {
    id: "breaker_rod",
    imageSrc: "/images/items/fishing/dangerous/breaker_rod.webp",
    name: "파도 절단 낚싯대",
    description: "빠르게 제압하지만 장력 여유가 적은 공격형 낚싯대.",
    price: 25_000,
    maxTensionBonus: -3,
    staminaDamageBonus: 4,
  },
  leviathan_rod: {
    id: "leviathan_rod",
    imageSrc: "/images/items/fishing/dangerous/leviathan_rod.webp",
    name: "레비아탄 낚싯대",
    description: "거대어의 힘을 받아내도록 설계된 중량 낚싯대.",
    price: 120_000,
    maxTensionBonus: 12,
    staminaDamageBonus: 7,
  },
};

export const DANGEROUS_REELS: Record<DangerousReelId, DangerousReel> = {
  starter_reel: {
    id: "starter_reel",
    imageSrc: "/images/items/fishing/dangerous/starter_reel.webp",
    name: "해역 입문 릴",
    description: "기본적인 감기와 풀기를 지원하는 입문 릴.",
    price: 0,
    reelPowerBonus: 0,
    tensionControlBonus: 0,
  },
  current_reel: {
    id: "current_reel",
    imageSrc: "/images/items/fishing/dangerous/current_reel.webp",
    name: "순류 릴",
    description: "급류에서도 장력을 부드럽게 조절하는 안전형 릴.",
    price: 15_000,
    reelPowerBonus: 1,
    tensionControlBonus: 4,
  },
  maelstrom_reel: {
    id: "maelstrom_reel",
    imageSrc: "/images/items/fishing/dangerous/maelstrom_reel.webp",
    name: "대소용돌이 릴",
    description: "강한 회수력을 가진 고급 릴.",
    price: 65_000,
    reelPowerBonus: 5,
    tensionControlBonus: 2,
  },
};

export const DANGEROUS_LINES: Record<DangerousLineId, DangerousLine> = {
  starter_line: {
    id: "starter_line",
    imageSrc: "/images/items/fishing/dangerous/starter_line.webp",
    name: "해역 입문 낚싯줄",
    description: "위험 해역용으로 보강한 기본 낚싯줄.",
    price: 0,
    maxTensionBonus: 0,
    slackTolerance: 0,
  },
  braided_line: {
    id: "braided_line",
    imageSrc: "/images/items/fishing/dangerous/braided_line.webp",
    name: "삼중 합사줄",
    description: "팽팽한 장력을 오래 견디는 안정형 합사줄.",
    price: 32_000,
    maxTensionBonus: 9,
    slackTolerance: 0,
  },
  abyss_chain_line: {
    id: "abyss_chain_line",
    imageSrc: "/images/items/fishing/dangerous/abyss_chain_line.webp",
    name: "심연 사슬줄",
    description: "느슨해진 순간에도 한 차례 더 버틸 수 있는 최고급 줄.",
    price: 105_000,
    maxTensionBonus: 14,
    slackTolerance: 1,
  },
};

export const DANGEROUS_BAITS: Record<DangerousBaitId, DangerousBait> = {
  basic_bait: {
    id: "basic_bait",
    imageSrc: "/images/items/fishing/dangerous/basic_bait.webp",
    name: "해역용 기본 미끼",
    description: "출항자에게 무제한 제공되는 평범한 미끼.",
    price: 0,
    packSize: 0,
    unlimited: true,
    targetBehaviors: [],
    rarityBonus: 0,
  },
  reef_bait: {
    id: "reef_bait",
    imageSrc: "/images/items/fishing/dangerous/reef_bait.webp",
    name: "암초 향 미끼",
    description: "선회형 어종의 반응을 끌어내는 5개 묶음.",
    price: 500,
    packSize: 5,
    unlimited: false,
    targetBehaviors: ["turn"],
    rarityBonus: 0.02,
  },
  blood_bait: {
    id: "blood_bait",
    imageSrc: "/images/items/fishing/dangerous/blood_bait.webp",
    name: "핏빛 미끼",
    description: "돌진형 대형 어종을 유인하는 5개 묶음.",
    price: 1_000,
    packSize: 5,
    unlimited: false,
    targetBehaviors: ["charge", "thrash"],
    rarityBonus: 0.04,
  },
  luminous_bait: {
    id: "luminous_bait",
    imageSrc: "/images/items/fishing/dangerous/luminous_bait.webp",
    name: "발광 미끼",
    description: "어두운 수심의 잠수형 어종을 유인하는 5개 묶음.",
    price: 1_800,
    packSize: 5,
    unlimited: false,
    targetBehaviors: ["dive"],
    rarityBonus: 0.06,
  },
  abyss_bait: {
    id: "abyss_bait",
    imageSrc: "/images/items/fishing/dangerous/abyss_bait.webp",
    name: "심연 응축 미끼",
    description: "희귀한 심해 어종의 흔적을 좇는 5개 묶음.",
    price: 3_000,
    packSize: 5,
    unlimited: false,
    targetBehaviors: ["charge", "thrash", "turn", "dive"],
    rarityBonus: 0.1,
  },
};

export const DANGEROUS_BOSSES: Record<DangerousBossId, DangerousBoss> = {
  tidal_colossus: {
    id: "tidal_colossus",
    imageSrc: "/images/fish/tidal_colossus.webp",
    name: "해일의 거신",
    description: "등 위로 파도를 일으키며 해역 전체를 떠도는 거대어.",
    minRisk: 4,
    eventStamina: 18_000,
    attemptStamina: 240,
    attemptDistance: 150,
    baseTension: 58,
    behaviorPattern: ["charge", "thrash", "turn", "charge", "dive"],
  },
  abyss_kraken: {
    id: "abyss_kraken",
    imageSrc: "/images/fish/abyss_kraken.webp",
    name: "심연 크라켄",
    description: "균열 아래에서 여러 촉수로 낚싯줄을 휘감는 심연의 주인.",
    minRisk: 5,
    eventStamina: 32_000,
    attemptStamina: 320,
    attemptDistance: 180,
    baseTension: 64,
    behaviorPattern: ["dive", "thrash", "charge", "turn", "dive", "thrash"],
  },
};

export function dangerousCatchMaterialId(
  fishId: string,
): `danger_catch_${string}` {
  return `danger_catch_${fishId}`;
}

export function dangerousBossMaterialId(
  bossId: string,
): `danger_boss_${string}` {
  return `danger_boss_${bossId}`;
}

export const DANGEROUS_FISHING_MATERIALS: Record<
  string,
  { id: string; name: string; description: string }
> = {
  ...Object.fromEntries(
    Object.values(DANGEROUS_FISH).map((fish) => {
      const id = dangerousCatchMaterialId(fish.id);
      return [
        id,
        {
          id,
          name: fish.name,
          description: `${fish.description} 안전 귀환 후 위험 해역 교환이나 거래소에서 사용하는 어획물이다.`,
        },
      ];
    }),
  ),
  ...Object.fromEntries(
    Object.values(DANGEROUS_BOSSES).map((boss) => {
      const id = dangerousBossMaterialId(boss.id);
      return [
        id,
        {
          id,
          name: `${boss.name}의 증표`,
          description: `${boss.name} 공동 제압에 기여한 낚시꾼에게 주어지는 증표. 최상급 전용 장비와 한정 꾸미기 교환 또는 거래소에서 사용한다.`,
        },
      ];
    }),
  ),
};

function hasOwn(record: object, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, id);
}

export function isDangerousZoneId(id: unknown): id is DangerousZoneId {
  return typeof id === "string" && hasOwn(DANGEROUS_ZONES, id);
}

export function isDangerousDepthId(id: unknown): id is DangerousDepthId {
  return typeof id === "string" && hasOwn(DANGEROUS_DEPTHS, id);
}

export function isDangerousFishId(id: unknown): id is DangerousFishId {
  return typeof id === "string" && hasOwn(DANGEROUS_FISH, id);
}

export function isDangerousRodId(id: unknown): id is DangerousRodId {
  return typeof id === "string" && hasOwn(DANGEROUS_RODS, id);
}

export function isDangerousReelId(id: unknown): id is DangerousReelId {
  return typeof id === "string" && hasOwn(DANGEROUS_REELS, id);
}

export function isDangerousLineId(id: unknown): id is DangerousLineId {
  return typeof id === "string" && hasOwn(DANGEROUS_LINES, id);
}

export function isDangerousBaitId(id: unknown): id is DangerousBaitId {
  return typeof id === "string" && hasOwn(DANGEROUS_BAITS, id);
}

export function isDangerousBossId(id: unknown): id is DangerousBossId {
  return typeof id === "string" && hasOwn(DANGEROUS_BOSSES, id);
}

export function isDangerousCatchMaterialId(id: unknown): id is string {
  return typeof id === "string" && hasOwn(DANGEROUS_FISHING_MATERIALS, id);
}
