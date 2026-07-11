import {
  SETTLEMENT_MATERIAL_ID,
  SETTLEMENT_MATERIALS,
} from "./settlementMaterials";

export type MiningNodeId =
  | "iron"
  | "copper"
  | "silver"
  | "gold"
  | "mythril"
  | "adamantite";

export const MINING_MATERIAL_ID = {
  iron: SETTLEMENT_MATERIAL_ID.ironOre,
  copper: "v2_copper_ore",
  silver: "v2_silver_ore",
  gold: "v2_gold_ore",
  mythril: "v2_mythril_ore",
  adamantite: "v2_adamantite_ore",
  stone: "v2_mining_stone",
  coal: "v2_coal",
  roughGem: "v2_rough_gem",
} as const;

export type MiningMaterialId =
  (typeof MINING_MATERIAL_ID)[keyof typeof MINING_MATERIAL_ID];

export const MINING_MATERIALS: Record<
  MiningMaterialId,
  { id: MiningMaterialId; name: string; description: string }
> = {
  [MINING_MATERIAL_ID.iron]: {
    ...SETTLEMENT_MATERIALS[SETTLEMENT_MATERIAL_ID.ironOre],
    description:
      "거친 철광맥에서 캐낸 기초 금속 광석. 정착지 발전과 수리 키트 제작에 쓴다.",
  },
  [MINING_MATERIAL_ID.copper]: {
    id: MINING_MATERIAL_ID.copper,
    name: "구리광석",
    description: "붉은 구리 광맥에서 캐낸 다루기 쉬운 광석. 생활 도구와 금속 부품 재료다.",
  },
  [MINING_MATERIAL_ID.silver]: {
    id: MINING_MATERIAL_ID.silver,
    name: "은광석",
    description: "서늘한 은빛 동굴에서 캐낸 광석. 정교한 장식과 마력 전도 재료로 쓰인다.",
  },
  [MINING_MATERIAL_ID.gold]: {
    id: MINING_MATERIAL_ID.gold,
    name: "금광석",
    description: "깊은 금빛 광산에서 캐낸 귀금속 광석. 상급 장비와 장식 제작에 알맞다.",
  },
  [MINING_MATERIAL_ID.mythril]: {
    id: MINING_MATERIAL_ID.mythril,
    name: "미스릴 원석",
    description: "푸른빛이 맺힌 심층 광맥의 원석. 가볍고 강한 상급 합금 재료다.",
  },
  [MINING_MATERIAL_ID.adamantite]: {
    id: MINING_MATERIAL_ID.adamantite,
    name: "아다만타이트 원석",
    description: "붉은 심연 광맥에서 드물게 얻는 최고급 원석. 전설급 제작 재료로 쓰인다.",
  },
  [MINING_MATERIAL_ID.stone]: {
    id: MINING_MATERIAL_ID.stone,
    name: "단단한 돌",
    description: "광맥을 깨는 과정에서 함께 떨어져 나온 건축용 석재다.",
  },
  [MINING_MATERIAL_ID.coal]: {
    id: MINING_MATERIAL_ID.coal,
    name: "석탄",
    description: "광석 제련에 열을 더하는 검은 연료. 광맥 곳곳에서 부산물로 발견된다.",
  },
  [MINING_MATERIAL_ID.roughGem]: {
    id: MINING_MATERIAL_ID.roughGem,
    name: "원석 보석",
    description: "아직 세공하지 않은 보석 결정. 상위 광맥일수록 발견할 가능성이 높다.",
  },
};

export type MiningByproductRule = {
  materialId: MiningMaterialId;
  chance: number;
};

export type MiningNode = {
  id: MiningNodeId;
  name: string;
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  baseFailureRate: number;
  materialId: MiningMaterialId;
  durationMs: number;
  strikes: number;
  xp: number;
  byproducts: readonly MiningByproductRule[];
};

export const MINING_NODES: Record<MiningNodeId, MiningNode> = {
  iron: {
    id: "iron",
    name: "철 광맥",
    grade: 1,
    baseFailureRate: 0.1,
    materialId: MINING_MATERIAL_ID.iron,
    durationMs: 7_000,
    strikes: 5,
    xp: 5,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.stone, chance: 0.12 },
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.03 },
    ],
  },
  copper: {
    id: "copper",
    name: "구리 광맥",
    grade: 2,
    baseFailureRate: 0.2,
    materialId: MINING_MATERIAL_ID.copper,
    durationMs: 8_000,
    strikes: 6,
    xp: 6,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.stone, chance: 0.1 },
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.04 },
    ],
  },
  silver: {
    id: "silver",
    name: "은 광맥",
    grade: 3,
    baseFailureRate: 0.35,
    materialId: MINING_MATERIAL_ID.silver,
    durationMs: 10_000,
    strikes: 7,
    xp: 8,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.stone, chance: 0.08 },
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.05 },
      { materialId: MINING_MATERIAL_ID.roughGem, chance: 0.015 },
    ],
  },
  gold: {
    id: "gold",
    name: "금 광맥",
    grade: 4,
    baseFailureRate: 0.5,
    materialId: MINING_MATERIAL_ID.gold,
    durationMs: 12_000,
    strikes: 8,
    xp: 10,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.stone, chance: 0.07 },
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.06 },
      { materialId: MINING_MATERIAL_ID.roughGem, chance: 0.03 },
    ],
  },
  mythril: {
    id: "mythril",
    name: "미스릴 광맥",
    grade: 5,
    baseFailureRate: 0.6,
    materialId: MINING_MATERIAL_ID.mythril,
    durationMs: 15_000,
    strikes: 9,
    xp: 12,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.07 },
      { materialId: MINING_MATERIAL_ID.roughGem, chance: 0.06 },
    ],
  },
  adamantite: {
    id: "adamantite",
    name: "아다만타이트 광맥",
    grade: 6,
    baseFailureRate: 0.7,
    materialId: MINING_MATERIAL_ID.adamantite,
    durationMs: 18_000,
    strikes: 10,
    xp: 15,
    byproducts: [
      { materialId: MINING_MATERIAL_ID.coal, chance: 0.08 },
      { materialId: MINING_MATERIAL_ID.roughGem, chance: 0.1 },
    ],
  },
};

export type MiningSpotId =
  | "iron_quarry"
  | "copper_gallery"
  | "silver_cavern"
  | "gold_mine"
  | "mythril_depths"
  | "adamantite_chasm";

export type MiningSpot = {
  id: MiningSpotId;
  name: string;
  shortName: string;
  description: string;
  tags: string[];
  nodeId: MiningNodeId;
};

export const DEFAULT_MINING_SPOT_ID: MiningSpotId = "iron_quarry";

export const MINING_SPOTS: Record<MiningSpotId, MiningSpot> = {
  iron_quarry: {
    id: "iron_quarry",
    name: "회색바위 철 채석장",
    shortName: "철 채석장",
    description: "낮은 절벽을 따라 철맥이 드러난 채석장. 기초 채광을 익히기 좋다.",
    tags: ["채석장", "기초 광맥", "철광석"],
    nodeId: "iron",
  },
  copper_gallery: {
    id: "copper_gallery",
    name: "붉은등 구리 갱도",
    shortName: "구리 갱도",
    description: "붉은 광물이 등불처럼 번지는 완만한 갱도. 구리 광맥이 이어진다.",
    tags: ["갱도", "붉은 광맥", "구리광석"],
    nodeId: "copper",
  },
  silver_cavern: {
    id: "silver_cavern",
    name: "서리빛 은 동굴",
    shortName: "은 동굴",
    description: "차가운 결정 사이로 은빛 광맥이 비치는 동굴. 단단한 암반이 많다.",
    tags: ["결정 동굴", "은빛", "은광석"],
    nodeId: "silver",
  },
  gold_mine: {
    id: "gold_mine",
    name: "황금메아리 광산",
    shortName: "금 광산",
    description: "깊은 곳에서 금빛이 메아리치는 오래된 광산. 숙련된 채광이 필요하다.",
    tags: ["심층 광산", "금빛", "금광석"],
    nodeId: "gold",
  },
  mythril_depths: {
    id: "mythril_depths",
    name: "푸른별 미스릴 심층",
    shortName: "미스릴 심층",
    description: "별빛 같은 푸른 결정이 암벽을 밝히는 심층부. 미스릴 원석이 잠들어 있다.",
    tags: ["심층부", "푸른 결정", "미스릴"],
    nodeId: "mythril",
  },
  adamantite_chasm: {
    id: "adamantite_chasm",
    name: "붉은심연 아다만타이트 균열",
    shortName: "심연 균열",
    description: "붉은 결정과 검은 암반이 맞물린 위험한 균열. 최고급 원석이 드물게 보인다.",
    tags: ["심연", "최고급 광맥", "아다만타이트"],
    nodeId: "adamantite",
  },
};

export const MINING_SPOT_IDS = Object.keys(MINING_SPOTS) as MiningSpotId[];

export function isMiningSpotId(id: string): id is MiningSpotId {
  return Object.prototype.hasOwnProperty.call(MINING_SPOTS, id);
}

export function miningNodeForSpot(spot: MiningSpot): MiningNode {
  return MINING_NODES[spot.nodeId];
}

export function rollMiningByproducts(
  node: MiningNode,
  rng: () => number = Math.random,
): Partial<Record<MiningMaterialId, number>> {
  const drops: Partial<Record<MiningMaterialId, number>> = {};
  for (const rule of node.byproducts) {
    if (rng() < rule.chance) drops[rule.materialId] = 1;
  }
  return drops;
}
