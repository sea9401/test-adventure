import {
  SETTLEMENT_MATERIAL_ID,
  SETTLEMENT_MATERIALS,
} from "./settlementMaterials";

export type WoodcuttingTreeId =
  | "pine"
  | "birch"
  | "oak"
  | "cedar"
  | "willow"
  | "cypress";

export type WoodcuttingTree = {
  id: WoodcuttingTreeId;
  name: string;
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  baseFailureRate: number;
  materialId: WoodcuttingMaterialId;
  durationMs: number;
  chops: number;
  xp: number;
};

export const WOODCUTTING_MATERIAL_ID = {
  pine: SETTLEMENT_MATERIAL_ID.timber,
  birch: "v2_birch_log",
  oak: "v2_oak_log",
  cedar: "v2_cedar_log",
  willow: "v2_willow_log",
  cypress: "v2_cypress_log",
} as const;

export type WoodcuttingMaterialId =
  (typeof WOODCUTTING_MATERIAL_ID)[keyof typeof WOODCUTTING_MATERIAL_ID];

export const WOODCUTTING_MATERIALS: Record<
  WoodcuttingMaterialId,
  { id: WoodcuttingMaterialId; name: string; description: string }
> = {
  [WOODCUTTING_MATERIAL_ID.pine]: {
    ...SETTLEMENT_MATERIALS[SETTLEMENT_MATERIAL_ID.timber],
  },
  [WOODCUTTING_MATERIAL_ID.birch]: {
    id: WOODCUTTING_MATERIAL_ID.birch,
    name: "자작나무 원목",
    description: "은빛 자작나무숲에서 얻는 밝고 가벼운 목재. 정교한 제작 재료로 쓰인다.",
  },
  [WOODCUTTING_MATERIAL_ID.oak]: {
    id: WOODCUTTING_MATERIAL_ID.oak,
    name: "참나무 원목",
    description: "깊은 참나무숲에서 얻는 단단한 목재. 튼튼한 장비 제작에 알맞다.",
  },
  [WOODCUTTING_MATERIAL_ID.cedar]: {
    id: WOODCUTTING_MATERIAL_ID.cedar,
    name: "삼나무 원목",
    description: "고요한 삼나무숲에서 얻는 향기로운 목재. 상급 제작 재료로 쓰인다.",
  },
  [WOODCUTTING_MATERIAL_ID.willow]: {
    id: WOODCUTTING_MATERIAL_ID.willow,
    name: "버드나무 원목",
    description: "물안개 버드나무숲에서 얻는 유연한 목재. 탄성이 필요한 제작에 알맞다.",
  },
  [WOODCUTTING_MATERIAL_ID.cypress]: {
    id: WOODCUTTING_MATERIAL_ID.cypress,
    name: "편백나무 원목",
    description: "바람재 편백나무숲에서 얻는 귀한 목재. 최고급 장비 제작에 쓰인다.",
  },
};

export const WOODCUTTING_TREES: Record<WoodcuttingTreeId, WoodcuttingTree> = {
  pine: {
    id: "pine",
    name: "소나무",
    grade: 1,
    baseFailureRate: 0.05,
    materialId: WOODCUTTING_MATERIAL_ID.pine,
    durationMs: 7_000,
    chops: 5,
    xp: 5,
  },
  birch: {
    id: "birch",
    name: "자작나무",
    grade: 2,
    baseFailureRate: 0.1,
    materialId: WOODCUTTING_MATERIAL_ID.birch,
    durationMs: 8_000,
    chops: 6,
    xp: 6,
  },
  oak: {
    id: "oak",
    name: "참나무",
    grade: 4,
    baseFailureRate: 0.22,
    materialId: WOODCUTTING_MATERIAL_ID.oak,
    durationMs: 12_000,
    chops: 8,
    xp: 10,
  },
  cedar: {
    id: "cedar",
    name: "삼나무",
    grade: 5,
    baseFailureRate: 0.3,
    materialId: WOODCUTTING_MATERIAL_ID.cedar,
    durationMs: 15_000,
    chops: 9,
    xp: 12,
  },
  willow: {
    id: "willow",
    name: "버드나무",
    grade: 3,
    baseFailureRate: 0.15,
    materialId: WOODCUTTING_MATERIAL_ID.willow,
    durationMs: 10_000,
    chops: 7,
    xp: 8,
  },
  cypress: {
    id: "cypress",
    name: "편백나무",
    grade: 6,
    baseFailureRate: 0.4,
    materialId: WOODCUTTING_MATERIAL_ID.cypress,
    durationMs: 18_000,
    chops: 10,
    xp: 15,
  },
};

export type WoodcuttingSpotId =
  | "pine_grove"
  | "birch_grove"
  | "oak_grove"
  | "cedar_grove"
  | "willow_grove"
  | "cypress_grove";

export type WoodcuttingSpot = {
  id: WoodcuttingSpotId;
  name: string;
  shortName: string;
  description: string;
  tags: string[];
  treeId: WoodcuttingTreeId;
};

export const DEFAULT_WOODCUTTING_SPOT_ID: WoodcuttingSpotId = "pine_grove";

export const WOODCUTTING_SPOTS: Record<WoodcuttingSpotId, WoodcuttingSpot> = {
  pine_grove: {
    id: "pine_grove",
    name: "솔바람 소나무숲",
    shortName: "소나무숲",
    description: "바람이 맑게 통하는 침엽수 숲. 이곳에서는 소나무를 벌목한다.",
    tags: ["침엽수", "솔바람", "소나무"],
    treeId: "pine",
  },
  birch_grove: {
    id: "birch_grove",
    name: "은빛 자작나무숲",
    shortName: "자작나무숲",
    description: "흰 수피 사이로 햇빛이 드는 숲. 이곳에서는 자작나무를 벌목한다.",
    tags: ["흰 수피", "은빛 숲", "자작나무"],
    treeId: "birch",
  },
  oak_grove: {
    id: "oak_grove",
    name: "깊은 참나무숲",
    shortName: "참나무숲",
    description: "수관이 빽빽한 깊은 숲. 이곳에서는 참나무를 벌목한다.",
    tags: ["활엽수", "깊은 숲", "참나무"],
    treeId: "oak",
  },
  cedar_grove: {
    id: "cedar_grove",
    name: "고요한 삼나무숲",
    shortName: "삼나무숲",
    description: "오래된 안개가 머무는 숲. 이곳에서는 삼나무를 벌목한다.",
    tags: ["안개", "향기로운 목재", "삼나무"],
    treeId: "cedar",
  },
  willow_grove: {
    id: "willow_grove",
    name: "물안개 버드나무숲",
    shortName: "버드나무숲",
    description: "얕은 물길을 따라 펼쳐진 축축한 숲. 이곳에서는 버드나무를 벌목한다.",
    tags: ["물안개", "습지", "버드나무"],
    treeId: "willow",
  },
  cypress_grove: {
    id: "cypress_grove",
    name: "바람재 편백나무숲",
    shortName: "편백나무숲",
    description: "높은 고갯바람을 견딘 산림. 이곳에서는 편백나무를 벌목한다.",
    tags: ["산림", "고갯바람", "편백나무"],
    treeId: "cypress",
  },
};

export const WOODCUTTING_SPOT_IDS: readonly WoodcuttingSpotId[] = [
  "pine_grove",
  "birch_grove",
  "willow_grove",
  "oak_grove",
  "cedar_grove",
  "cypress_grove",
];

export function isWoodcuttingSpotId(id: string): id is WoodcuttingSpotId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_SPOTS, id);
}

export function woodcuttingTreeForSpot(spot: WoodcuttingSpot): WoodcuttingTree {
  return WOODCUTTING_TREES[spot.treeId];
}
