import {
  FARM_BOUNTIFUL_HAND_TITLE_ID,
  FARM_GOLDEN_FIELDS_OWNER_TITLE_ID,
  TITLES,
} from "@/adventure/data/titles";
import type { FarmState } from "./farm";
import { RANCH_PEN_DEFINITIONS } from "./ranch";

export type FarmEndgameShopReward =
  | { kind: "farmItem"; itemId: "compound_feed"; quantity: 5 }
  | { kind: "finishedItem"; itemId: "organic_fertilizer"; quantity: 3 }
  | { kind: "title"; titleId: string };

export type FarmEndgameShopItem = {
  id: string;
  title: string;
  note: string;
  rewardText: string;
  imageSrc?: string;
  costReputation: number;
  reward: FarmEndgameShopReward;
};

export type FarmEndgameShopProgress = {
  unlocked: boolean;
  plots: number;
  requiredPlots: 6;
  pens: number;
  requiredPens: 4;
};

export type FarmEndgameShopView = FarmEndgameShopProgress & {
  items: FarmEndgameShopItem[];
  ownedTitleIds: string[];
};

export type FarmEndgameShopPurchaseResult = {
  itemId: string;
  title: string;
  rewardText: string;
  costReputation: number;
};

export const FARM_ENDGAME_SHOP_TITLE_IDS = [
  FARM_BOUNTIFUL_HAND_TITLE_ID,
  FARM_GOLDEN_FIELDS_OWNER_TITLE_ID,
] as const;

export const FARM_ENDGAME_SHOP_ITEMS: readonly FarmEndgameShopItem[] = [
  {
    id: "ranch-feed-bundle",
    title: "목장 사료 꾸러미",
    note: "목장 운영에 필요한 배합 사료를 보충합니다.",
    rewardText: "배합 사료 5개",
    imageSrc: "/images/items/farm/compound_feed.webp",
    costReputation: 20,
    reward: { kind: "farmItem", itemId: "compound_feed", quantity: 5 },
  },
  {
    id: "fertilizer-bundle",
    title: "영농 거름 꾸러미",
    note: "재배 시간을 줄이는 유기질 거름을 보충합니다.",
    rewardText: "유기질 거름 3개",
    imageSrc: "/images/items/life-aids/organic_fertilizer.webp",
    costReputation: 24,
    reward: { kind: "finishedItem", itemId: "organic_fertilizer", quantity: 3 },
  },
  {
    id: "title-bountiful-hand",
    title: "풍요의 손",
    note: TITLES[FARM_BOUNTIFUL_HAND_TITLE_ID].description,
    rewardText: "칭호 ‘풍요의 손’",
    costReputation: 1_000,
    reward: { kind: "title", titleId: FARM_BOUNTIFUL_HAND_TITLE_ID },
  },
  {
    id: "title-golden-fields-owner",
    title: "황금 들판의 주인",
    note: TITLES[FARM_GOLDEN_FIELDS_OWNER_TITLE_ID].description,
    rewardText: "칭호 ‘황금 들판의 주인’",
    costReputation: 5_000,
    reward: { kind: "title", titleId: FARM_GOLDEN_FIELDS_OWNER_TITLE_ID },
  },
];

export function farmEndgameShopItem(itemId: string): FarmEndgameShopItem | null {
  return FARM_ENDGAME_SHOP_ITEMS.find((item) => item.id === itemId) ?? null;
}

export function farmEndgameShopProgress(farm: FarmState): FarmEndgameShopProgress {
  const requiredPens = RANCH_PEN_DEFINITIONS.filter(
    (definition) => definition.costReputation > 0,
  );
  const pens = requiredPens.filter((definition) => farm.ranch.pens[definition.id].unlocked)
    .length;
  const plots = farm.plots.length;

  return {
    unlocked: plots >= 6 && pens >= 4,
    plots,
    requiredPlots: 6,
    pens,
    requiredPens: 4,
  };
}

export function farmEndgameShopView(
  farm: FarmState,
  ownedTitleIds: readonly string[],
): FarmEndgameShopView {
  return {
    ...farmEndgameShopProgress(farm),
    items: FARM_ENDGAME_SHOP_ITEMS.map((item) => ({ ...item, reward: { ...item.reward } })),
    ownedTitleIds: FARM_ENDGAME_SHOP_TITLE_IDS.filter((titleId) =>
      ownedTitleIds.includes(titleId),
    ),
  };
}
