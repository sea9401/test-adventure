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
  durationMs: number;
  chops: number;
};

export const WOODCUTTING_TREES: Record<WoodcuttingTreeId, WoodcuttingTree> = {
  pine: { id: "pine", name: "소나무", durationMs: 3_000, chops: 5 },
  birch: { id: "birch", name: "자작나무", durationMs: 3_200, chops: 5 },
  oak: { id: "oak", name: "참나무", durationMs: 3_800, chops: 7 },
  cedar: { id: "cedar", name: "삼나무", durationMs: 4_000, chops: 7 },
  willow: { id: "willow", name: "버드나무", durationMs: 3_400, chops: 6 },
  cypress: { id: "cypress", name: "편백나무", durationMs: 4_100, chops: 7 },
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

export const WOODCUTTING_SPOT_IDS = Object.keys(WOODCUTTING_SPOTS) as WoodcuttingSpotId[];

export function isWoodcuttingSpotId(id: string): id is WoodcuttingSpotId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_SPOTS, id);
}

export function woodcuttingTreeForSpot(spot: WoodcuttingSpot): WoodcuttingTree {
  return WOODCUTTING_TREES[spot.treeId];
}
