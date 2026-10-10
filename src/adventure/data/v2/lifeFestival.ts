import type { CookingEffectTag } from "@/adventure/v2/cooking/types";
import { FARM_ITEMS } from "@/adventure/v2/farm";
import {
  LIFE_CRAFTING_RECIPES,
  type LifeFinishedItemId,
} from "@/adventure/v2/lifeCrafting";
import {
  LIFE_PROCESSED_MATERIAL_ID,
  LIFE_PROCESSED_MATERIALS,
  type LifeProcessedMaterialId,
} from "@/adventure/v2/lifeWorkshopMaterials";
import type { RanchProductItemId } from "@/adventure/v2/ranch";
import {
  LIFE_FESTIVAL_LEGEND_TITLE_ID,
  LIFE_FESTIVAL_MASTER_TITLE_ID,
  LIFE_FESTIVAL_REGULAR_TITLE_ID,
} from "@/adventure/data/titles";
import { GUILD_WORKSHOP_MATERIAL_ID } from "./guildWorkshopMaterials";

export type LifeFestivalThemeId =
  | "harvest"
  | "forest"
  | "vein"
  | "fishing"
  | "feast";

export type LifeFestivalActivity =
  | "farming"
  | "woodcutting"
  | "mining"
  | "fishing"
  | "cooking";

export type LifeFestivalTheme = {
  id: LifeFestivalThemeId;
  name: string;
  activity: LifeFestivalActivity;
  activityName: string;
  /** 활동별 산출 보너스. 농사는 수확량 %, 나머지는 확률 %p. */
  chancePct: number;
  xpPct: number;
  effectText: string;
};

// 순서가 곧 주간 순환 순서다. 바꾸면 이미 지난 주차의 테마 기록이 달라진다.
export const LIFE_FESTIVAL_THEMES: readonly LifeFestivalTheme[] = [
  { id: "harvest", name: "수확제", activity: "farming", activityName: "농사", chancePct: 10, xpPct: 25, effectText: "수확량 +10% · 농사 경험치 +25%" },
  { id: "forest", name: "숲의 축제", activity: "woodcutting", activityName: "벌목", chancePct: 10, xpPct: 25, effectText: "추가 원목 확률 +10%p · 벌목 경험치 +25%" },
  { id: "vein", name: "광맥제", activity: "mining", activityName: "채광", chancePct: 10, xpPct: 25, effectText: "추가 광석 확률 +10%p · 채광 경험치 +25%" },
  { id: "fishing", name: "풍어제", activity: "fishing", activityName: "낚시", chancePct: 2, xpPct: 25, effectText: "특수 어종 가중치 +2%p · 낚시 경험치 +25%" },
  { id: "feast", name: "미식제", activity: "cooking", activityName: "요리", chancePct: 5, xpPct: 25, effectText: "걸작 확률 +5%p · 요리 경험치 +25%" },
];

export const LIFE_FESTIVAL_THEME_EPOCH_MONDAY = "2026-01-05";

export type LifeFestivalDishRequirement = {
  kind: "dish";
  quantity: number;
  minTier: 1 | 2 | 3 | 4 | 5;
  tag?: CookingEffectTag;
  minQuality?: "careful" | "masterpiece";
};

export type LifeFestivalRequirement =
  | { kind: "processed"; itemId: LifeProcessedMaterialId; quantity: number }
  | { kind: "aid"; itemId: LifeFinishedItemId; quantity: number }
  | { kind: "ranch"; itemId: RanchProductItemId; quantity: number }
  | LifeFestivalDishRequirement;

export type LifeFestivalOrder = {
  id: string;
  pool: LifeFestivalThemeId | "general";
  requirement: LifeFestivalRequirement;
  baseTokens: number;
};

const P = LIFE_PROCESSED_MATERIAL_ID;

export const LIFE_FESTIVAL_ORDERS: readonly LifeFestivalOrder[] = [
  { id: "harvest_egg", pool: "harvest", requirement: { kind: "ranch", itemId: "egg", quantity: 10 }, baseTokens: 4 },
  { id: "harvest_milk", pool: "harvest", requirement: { kind: "ranch", itemId: "milk", quantity: 6 }, baseTokens: 5 },
  { id: "harvest_fertilizer", pool: "harvest", requirement: { kind: "aid", itemId: "organic_fertilizer", quantity: 2 }, baseTokens: 6 },
  { id: "harvest_recovery_dish", pool: "harvest", requirement: { kind: "dish", quantity: 3, minTier: 2, tag: "recovery" }, baseTokens: 6 },

  { id: "forest_softwood", pool: "forest", requirement: { kind: "processed", itemId: P.softwood, quantity: 5 }, baseTokens: 4 },
  { id: "forest_hardwood", pool: "forest", requirement: { kind: "processed", itemId: P.hardwood, quantity: 3 }, baseTokens: 6 },
  { id: "forest_masterwood", pool: "forest", requirement: { kind: "processed", itemId: P.masterwood, quantity: 1 }, baseTokens: 8 },
  { id: "forest_wedge", pool: "forest", requirement: { kind: "aid", itemId: "logging_wedge_basic", quantity: 2 }, baseTokens: 5 },

  { id: "vein_basic_ingot", pool: "vein", requirement: { kind: "processed", itemId: P.basicIngot, quantity: 5 }, baseTokens: 4 },
  { id: "vein_precious_ingot", pool: "vein", requirement: { kind: "processed", itemId: P.preciousIngot, quantity: 3 }, baseTokens: 6 },
  { id: "vein_arcane_alloy", pool: "vein", requirement: { kind: "processed", itemId: P.arcaneAlloy, quantity: 1 }, baseTokens: 8 },
  { id: "vein_probe", pool: "vein", requirement: { kind: "aid", itemId: "mining_probe_basic", quantity: 2 }, baseTokens: 5 },

  { id: "fishing_bait_box", pool: "fishing", requirement: { kind: "aid", itemId: "tidy_bait_box", quantity: 2 }, baseTokens: 5 },
  { id: "fishing_tier3_dish", pool: "fishing", requirement: { kind: "dish", quantity: 2, minTier: 3 }, baseTokens: 6 },
  { id: "fishing_prep_set", pool: "fishing", requirement: { kind: "aid", itemId: "cooking_prep_set", quantity: 1 }, baseTokens: 5 },
  { id: "fishing_pork", pool: "fishing", requirement: { kind: "ranch", itemId: "pork", quantity: 3 }, baseTokens: 6 },

  { id: "feast_any_dish", pool: "feast", requirement: { kind: "dish", quantity: 5, minTier: 1 }, baseTokens: 4 },
  { id: "feast_careful_dish", pool: "feast", requirement: { kind: "dish", quantity: 2, minTier: 3, minQuality: "careful" }, baseTokens: 8 },
  { id: "feast_masterpiece_dish", pool: "feast", requirement: { kind: "dish", quantity: 1, minTier: 2, minQuality: "masterpiece" }, baseTokens: 8 },
  { id: "feast_prep_set", pool: "feast", requirement: { kind: "aid", itemId: "cooking_prep_set", quantity: 2 }, baseTokens: 6 },

  { id: "general_offense_dish", pool: "general", requirement: { kind: "dish", quantity: 3, minTier: 2, tag: "offense" }, baseTokens: 6 },
  { id: "general_defense_dish", pool: "general", requirement: { kind: "dish", quantity: 3, minTier: 2, tag: "defense" }, baseTokens: 6 },
  { id: "general_basic_ingot", pool: "general", requirement: { kind: "processed", itemId: P.basicIngot, quantity: 5 }, baseTokens: 4 },
  { id: "general_softwood", pool: "general", requirement: { kind: "processed", itemId: P.softwood, quantity: 5 }, baseTokens: 4 },
  { id: "general_milk", pool: "general", requirement: { kind: "ranch", itemId: "milk", quantity: 6 }, baseTokens: 5 },
  { id: "general_egg", pool: "general", requirement: { kind: "ranch", itemId: "egg", quantity: 10 }, baseTokens: 4 },
  { id: "general_hunt_exp_dish", pool: "general", requirement: { kind: "dish", quantity: 2, minTier: 3, tag: "hunt_exp" }, baseTokens: 7 },
  { id: "general_hunt_gold_dish", pool: "general", requirement: { kind: "dish", quantity: 2, minTier: 3, tag: "hunt_gold" }, baseTokens: 7 },
];

export const LIFE_FESTIVAL_ORDER_BY_ID = new Map(
  LIFE_FESTIVAL_ORDERS.map((order) => [order.id, order]),
);

const DISH_TAG_LABEL: Record<CookingEffectTag, string> = {
  offense: "공격",
  defense: "방어",
  recovery: "회복",
  hunt_exp: "사냥 경험치",
  hunt_gold: "사냥 골드",
  life: "생활",
};

function finishedItemName(itemId: LifeFinishedItemId): string {
  return (
    LIFE_CRAFTING_RECIPES.find((recipe) => recipe.id === itemId)?.name ??
    LIFE_CRAFTING_RECIPES.find((recipe) => recipe.outputId === itemId)?.name ??
    itemId
  );
}

export function lifeFestivalRequirementItemName(
  requirement: LifeFestivalRequirement,
): string {
  switch (requirement.kind) {
    case "processed":
      return LIFE_PROCESSED_MATERIALS[requirement.itemId].name;
    case "aid":
      return finishedItemName(requirement.itemId);
    case "ranch":
      return FARM_ITEMS[requirement.itemId].name;
    case "dish": {
      const quality =
        requirement.minQuality === "masterpiece"
          ? "걸작 "
          : requirement.minQuality === "careful"
            ? "정성작 이상 "
            : "";
      const tag = requirement.tag ? `${DISH_TAG_LABEL[requirement.tag]} ` : "";
      return `${quality}${tag}요리 (${requirement.minTier}등급 이상)`;
    }
  }
}

export function lifeFestivalRequirementLabel(
  requirement: LifeFestivalRequirement,
): string {
  return `${lifeFestivalRequirementItemName(requirement)} ${requirement.quantity}개`;
}

export type LifeFestivalShopOutput =
  | { kind: "finished"; itemId: LifeFinishedItemId; count: number }
  | { kind: "farm"; itemId: "compound_feed"; count: number }
  | { kind: "mastery_certificate"; count: number }
  | { kind: "stamina_potion"; count: number }
  | { kind: "material"; materialId: string; count: number }
  | { kind: "title"; titleId: string };

export type LifeFestivalShopItem = {
  id: string;
  name: string;
  description: string;
  tokenCost: number;
  /** null = 계정당 1회 상품(칭호). */
  weeklyLimit: number | null;
  output: LifeFestivalShopOutput;
};


export const LIFE_FESTIVAL_SHOP_ITEMS: readonly LifeFestivalShopItem[] = [
  { id: "fertilizer_bundle", name: "유기질 거름 3개", description: "밭의 재배 시간을 줄이고 수확량을 1개 늘립니다.", tokenCost: 15, weeklyLimit: 5, output: { kind: "finished", itemId: "organic_fertilizer", count: 3 } },
  { id: "feed_bundle", name: "배합 사료 5개", description: "목장 동물에게 먹이는 사료입니다.", tokenCost: 12, weeklyLimit: 5, output: { kind: "farm", itemId: "compound_feed", count: 5 } },
  { id: "wedge_advanced", name: "중급 벌목 쐐기", description: "3~4등급 벌목의 추가 원목 획득률을 높입니다.", tokenCost: 20, weeklyLimit: 3, output: { kind: "finished", itemId: "logging_wedge_advanced", count: 1 } },
  { id: "probe_advanced", name: "중급 광맥 탐침", description: "3~4등급 채광의 추가 광물과 부산물 확률을 높입니다.", tokenCost: 20, weeklyLimit: 3, output: { kind: "finished", itemId: "mining_probe_advanced", count: 1 } },
  { id: "mastery_certificate", name: "숙련 증서 10개", description: "직업 숙련도나 공용 숙달 포인트로 바꿀 수 있습니다.", tokenCost: 40, weeklyLimit: 3, output: { kind: "mastery_certificate", count: 10 } },
  { id: "stamina_potion", name: "스태미나 포션", description: "보관했다가 스태미나 200을 회복할 수 있습니다.", tokenCost: 50, weeklyLimit: 2, output: { kind: "stamina_potion", count: 1 } },
  { id: "mithril_shard", name: "미스릴 조각", description: "중상급 제작 장비에 필요한 희귀 금속 조각입니다.", tokenCost: 80, weeklyLimit: 2, output: { kind: "material", materialId: GUILD_WORKSHOP_MATERIAL_ID.mithrilShard, count: 1 } },
  { id: "title_regular", name: "칭호 ‘축제 단골’", description: "생활 축제에 꾸준히 참여한 모험가의 칭호입니다.", tokenCost: 200, weeklyLimit: null, output: { kind: "title", titleId: LIFE_FESTIVAL_REGULAR_TITLE_ID } },
  { id: "title_master", name: "칭호 ‘축제 명인’", description: "생활 축제를 이끈 숙련 모험가의 칭호입니다.", tokenCost: 1_000, weeklyLimit: null, output: { kind: "title", titleId: LIFE_FESTIVAL_MASTER_TITLE_ID } },
  { id: "title_legend", name: "칭호 ‘축제의 전설’", description: "생활 축제의 전설로 남은 모험가의 칭호입니다.", tokenCost: 3_000, weeklyLimit: null, output: { kind: "title", titleId: LIFE_FESTIVAL_LEGEND_TITLE_ID } },
];

export const LIFE_FESTIVAL_SHOP_ITEM_BY_ID = new Map(
  LIFE_FESTIVAL_SHOP_ITEMS.map((item) => [item.id, item]),
);

export const LIFE_FESTIVAL_RANK_REWARDS: readonly { maxRank: number; tokens: number }[] = [
  { maxRank: 1, tokens: 100 },
  { maxRank: 3, tokens: 60 },
  { maxRank: 10, tokens: 30 },
  { maxRank: 30, tokens: 10 },
];

export const LIFE_FESTIVAL_RANKING_SIZE = 30;
export const LIFE_FESTIVAL_DELIVERY_TIMES_MAX = 20;
