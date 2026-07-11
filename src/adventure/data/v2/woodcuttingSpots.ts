export type WoodcuttingTreeTier = "common" | "uncommon" | "rare";

export type WoodcuttingTreeId =
  | "pine"
  | "fir"
  | "nut_pine"
  | "birch"
  | "maple"
  | "ash"
  | "oak"
  | "chestnut"
  | "zelkova"
  | "cedar"
  | "yew"
  | "old_cedar";

export type WoodcuttingTree = {
  id: WoodcuttingTreeId;
  name: string;
  tier: WoodcuttingTreeTier;
  durationMs: number;
  chops: number;
};

export const WOODCUTTING_TREES: Record<WoodcuttingTreeId, WoodcuttingTree> = {
  pine: { id: "pine", name: "소나무", tier: "common", durationMs: 3_000, chops: 5 },
  fir: { id: "fir", name: "전나무", tier: "uncommon", durationMs: 3_300, chops: 6 },
  nut_pine: { id: "nut_pine", name: "잣나무", tier: "rare", durationMs: 3_700, chops: 6 },
  birch: { id: "birch", name: "자작나무", tier: "common", durationMs: 3_100, chops: 5 },
  maple: { id: "maple", name: "단풍나무", tier: "uncommon", durationMs: 3_500, chops: 6 },
  ash: { id: "ash", name: "물푸레나무", tier: "rare", durationMs: 3_900, chops: 7 },
  oak: { id: "oak", name: "참나무", tier: "common", durationMs: 3_800, chops: 7 },
  chestnut: { id: "chestnut", name: "밤나무", tier: "uncommon", durationMs: 4_100, chops: 7 },
  zelkova: { id: "zelkova", name: "느티나무", tier: "rare", durationMs: 4_500, chops: 8 },
  cedar: { id: "cedar", name: "삼나무", tier: "common", durationMs: 4_000, chops: 7 },
  yew: { id: "yew", name: "주목", tier: "uncommon", durationMs: 4_600, chops: 8 },
  old_cedar: {
    id: "old_cedar",
    name: "고목 삼나무",
    tier: "rare",
    durationMs: 5_400,
    chops: 9,
  },
};

export type WoodcuttingSpotId =
  | "pine_grove"
  | "birch_grove"
  | "oak_grove"
  | "cedar_grove";

export type WoodcuttingSpotTree = {
  treeId: WoodcuttingTreeId;
  weight: number;
};

export type WoodcuttingSpot = {
  id: WoodcuttingSpotId;
  name: string;
  shortName: string;
  description: string;
  trees: readonly WoodcuttingSpotTree[];
};

export const DEFAULT_WOODCUTTING_SPOT_ID: WoodcuttingSpotId = "pine_grove";

export const WOODCUTTING_SPOTS: Record<WoodcuttingSpotId, WoodcuttingSpot> = {
  pine_grove: {
    id: "pine_grove",
    name: "솔바람 소나무숲",
    shortName: "소나무숲",
    description: "바람이 맑게 통하는 침엽수 숲. 가볍고 곧은 나무가 많다.",
    trees: [
      { treeId: "pine", weight: 60 },
      { treeId: "fir", weight: 30 },
      { treeId: "nut_pine", weight: 10 },
    ],
  },
  birch_grove: {
    id: "birch_grove",
    name: "은빛 자작나무숲",
    shortName: "자작나무숲",
    description: "흰 수피 사이로 햇빛이 드는 숲. 색과 결이 고운 나무가 자란다.",
    trees: [
      { treeId: "birch", weight: 55 },
      { treeId: "maple", weight: 30 },
      { treeId: "ash", weight: 15 },
    ],
  },
  oak_grove: {
    id: "oak_grove",
    name: "깊은 참나무숲",
    shortName: "참나무숲",
    description: "수관이 빽빽한 깊은 숲. 단단하고 묵직한 활엽수가 모여 있다.",
    trees: [
      { treeId: "oak", weight: 55 },
      { treeId: "chestnut", weight: 30 },
      { treeId: "zelkova", weight: 15 },
    ],
  },
  cedar_grove: {
    id: "cedar_grove",
    name: "고요한 삼나무숲",
    shortName: "삼나무숲",
    description: "오래된 안개가 머무는 숲. 수령이 긴 나무들이 조용히 서 있다.",
    trees: [
      { treeId: "cedar", weight: 60 },
      { treeId: "yew", weight: 30 },
      { treeId: "old_cedar", weight: 10 },
    ],
  },
};

export const WOODCUTTING_SPOT_IDS = Object.keys(WOODCUTTING_SPOTS) as WoodcuttingSpotId[];

export function isWoodcuttingSpotId(id: string): id is WoodcuttingSpotId {
  return Object.prototype.hasOwnProperty.call(WOODCUTTING_SPOTS, id);
}

export function woodcuttingTreeNames(spot: WoodcuttingSpot): string[] {
  return spot.trees.map(({ treeId }) => WOODCUTTING_TREES[treeId].name);
}
