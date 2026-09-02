// 지급/우편 첨부 드롭다운의 카탈로그 옵션 — BroadcastTab·V2GrantSection 공용
// (그동안 두 탭이 같은 useMemo 빌더를 각자 복붙). label = 드롭다운 표기, name = chip 표기.
import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2_MATERIALS } from "@/adventure/data/v2/dungeonDrops";
import {
  COOKING_PANTRY_ITEMS,
  COOKING_PROCESSING_RECIPES,
} from "@/adventure/v2/cooking/kitchen";
import { COOKING_FARM_INGREDIENT_IDS } from "@/adventure/v2/cooking/researchIngredients";
import { FARM_ITEMS } from "@/adventure/v2/farm";
import { FISHING_CATCH_ITEM_LIST } from "@/adventure/v2/fishingStock";
import {
  UNEXPLORED_BASE_DROP_MATERIALS,
  UNEXPLORED_BOSS_CORE_MATERIAL,
  UNEXPLORED_POOL_MATERIALS,
  UNEXPLORED_SUMMON_STONE_MATERIALS,
} from "@/adventure/data/v2/unexploredRewards";
import { UNEXPLORED_BOSSES } from "@/adventure/data/v2/unexploredBosses";
import { SETTLEMENT_MATERIALS } from "@/adventure/data/v2/settlementMaterials";
import { WOODCUTTING_MATERIALS } from "@/adventure/data/v2/woodcuttingSpots";
import { MINING_MATERIALS } from "@/adventure/data/v2/miningSpots";
import { LIFE_PROCESSED_MATERIALS } from "@/adventure/v2/lifeWorkshop";
import { GUILD_WORKSHOP_MATERIALS } from "@/adventure/data/v2/guildWorkshopMaterials";
import { MONSTER_CRAFT_MATERIALS } from "@/adventure/data/v2/monsterCraftMaterials";
import { SCAVENGED_CRAFT_MATERIALS } from "@/adventure/data/v2/scavengedCrafting";
import { COOP_REWARD_MATERIALS } from "@/adventure/data/v2/coopRewards";
import { SP_FRUIT_MATERIALS } from "@/adventure/data/v2/spFruit";
import { SUMMON_SCROLL_MATERIAL_ID } from "@/adventure/data/v2/coopBosses";
import { STORM_EXPEDITION_MATERIALS } from "@/adventure/data/v2/stormExpeditionRewards";
import { DANGEROUS_FISHING_MATERIALS } from "@/adventure/data/v2/dangerousFishing";

export type CatalogOption = { id: string; name: string; label: string };
export type CatalogOptionGroup = {
  id: string;
  label: string;
  options: CatalogOption[];
};

const EQUIP_SLOT_ORDER: readonly V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];

function equipSlotSortValue(slot: V2EquipSlot): number {
  const idx = EQUIP_SLOT_ORDER.indexOf(slot);
  return idx < 0 ? EQUIP_SLOT_ORDER.length : idx;
}

export function v2MaterialOptions(): CatalogOption[] {
  return Object.values(V2_MATERIALS).map((m) => ({
    id: m.id,
    name: m.name,
    label: m.name,
  }));
}

export function v2MaterialOptionGroups(): CatalogOptionGroup[] {
  const options = v2MaterialOptions();
  const lifeMaterialIds = new Set([
    ...Object.keys(SETTLEMENT_MATERIALS),
    ...Object.keys(WOODCUTTING_MATERIALS),
    ...Object.keys(MINING_MATERIALS),
    ...Object.keys(LIFE_PROCESSED_MATERIALS),
  ]);
  const craftingMaterialIds = new Set([
    ...Object.keys(GUILD_WORKSHOP_MATERIALS),
    ...Object.keys(MONSTER_CRAFT_MATERIALS),
    ...Object.keys(SCAVENGED_CRAFT_MATERIALS),
  ]);
  const coopMaterialIds = new Set([
    ...Object.keys(COOP_REWARD_MATERIALS),
    ...Object.keys(SP_FRUIT_MATERIALS),
    SUMMON_SCROLL_MATERIAL_ID,
  ]);
  const expeditionMaterialIds = new Set([
    ...Object.keys(STORM_EXPEDITION_MATERIALS),
    ...Object.keys(DANGEROUS_FISHING_MATERIALS),
  ]);
  const summonStoneIds = new Set(Object.keys(UNEXPLORED_SUMMON_STONE_MATERIALS));
  const bossMaterialIds = new Set([UNEXPLORED_BOSS_CORE_MATERIAL.id]);
  const unexploredMaterialIds = new Set([
    ...Object.keys(UNEXPLORED_BASE_DROP_MATERIALS),
    ...Object.keys(UNEXPLORED_POOL_MATERIALS),
  ]);
  const assigned = new Set([
    ...lifeMaterialIds,
    ...craftingMaterialIds,
    ...coopMaterialIds,
    ...expeditionMaterialIds,
    ...summonStoneIds,
    ...bossMaterialIds,
    ...unexploredMaterialIds,
  ]);
  const pick = (ids: ReadonlySet<string>) =>
    options.filter((option) => ids.has(option.id));

  return [
    {
      id: "general",
      label: "성장·강화·기타 재료",
      options: options.filter((option) => !assigned.has(option.id)),
    },
    {
      id: "life",
      label: "생활 재료",
      options: pick(lifeMaterialIds),
    },
    {
      id: "crafting",
      label: "제작 재료",
      options: pick(craftingMaterialIds),
    },
    {
      id: "coop",
      label: "협동 보스 보상",
      options: pick(coopMaterialIds),
    },
    {
      id: "expedition",
      label: "원정·위험 해역 재료",
      options: pick(expeditionMaterialIds),
    },
    {
      id: "unexplored-materials",
      label: "미개척지 재료",
      options: pick(unexploredMaterialIds),
    },
    {
      id: "unexplored-boss-materials",
      label: "미개척지 보스 재료",
      options: pick(bossMaterialIds),
    },
    {
      id: "unexplored-summon-stones",
      label: "미개척지 보스 소환석",
      options: pick(summonStoneIds),
    },
  ].filter((group) => group.options.length > 0);
}

export function cookingIngredientOptions(): CatalogOption[] {
  return [
    ...COOKING_FARM_INGREDIENT_IDS.map((itemId) => {
      const item = FARM_ITEMS[itemId];
      return {
        id: `farm:${itemId}`,
        name: item.name,
        label: `농장 · ${item.icon} ${item.name}`,
      };
    }),
    ...FISHING_CATCH_ITEM_LIST.map((item) => ({
      id: `fishing:${item.id}`,
      name: item.name,
      label: `낚시 · ${item.icon} ${item.name}`,
    })),
    ...COOKING_PANTRY_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      label: `상점 · ${item.name}`,
    })),
    ...COOKING_PROCESSING_RECIPES.map((recipe) => ({
      id: recipe.outputId,
      name: recipe.name,
      label: `가공 · ${recipe.name}`,
    })),
  ];
}

export function v2EquipmentOptions(): CatalogOption[] {
  return Object.values(V2_EQUIPMENT)
    .slice()
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        equipSlotSortValue(a.slot) - equipSlotSortValue(b.slot) ||
        a.name.localeCompare(b.name, "ko"),
    )
    .map((e) => ({
      id: e.id,
      name: e.name,
      label: `T${e.tier} · ${V2_SLOT_LABEL[e.slot]} · ${e.name}`,
    }));
}

export function v2EquipmentOptionGroups(): CatalogOptionGroup[] {
  const options = v2EquipmentOptions();
  const slotById: ReadonlyMap<string, V2EquipSlot> = new Map(
    Object.values(V2_EQUIPMENT).map((equipment) => [
      equipment.id,
      equipment.slot,
    ]),
  );
  const bossEquipmentIds = new Set<string>(
    Object.values(UNEXPLORED_BOSSES).flatMap((boss) =>
      boss.uniqueDrops.map((drop) => drop.equipmentId),
    ),
  );
  const pioneerEquipmentIds = new Set<string>(
    Object.values(V2_EQUIPMENT)
      .filter((equipment) =>
        (equipment.setTags ?? []).includes("unexplored_pioneer"),
      )
      .map((equipment) => equipment.id),
  );
  const unexploredCraftedIds = new Set<string>(
    Object.values(V2_EQUIPMENT)
      .filter(
        (equipment) =>
          equipment.id.startsWith("v2_unexplored_") &&
          !bossEquipmentIds.has(equipment.id),
      )
      .map((equipment) => equipment.id),
  );
  const unexploredIds = new Set<string>([
    ...bossEquipmentIds,
    ...pioneerEquipmentIds,
    ...unexploredCraftedIds,
  ]);
  const pick = (ids: ReadonlySet<string>) =>
    options.filter((option) => ids.has(option.id));

  return [
    ...EQUIP_SLOT_ORDER.map((slot) => ({
      id: `general-${slot}`,
      label: `일반 장비 · ${V2_SLOT_LABEL[slot]}`,
      options: options.filter(
        (option) =>
          !unexploredIds.has(option.id) && slotById.get(option.id) === slot,
      ),
    })),
    {
      id: "unexplored-pioneer",
      label: "미개척지 · 개척자 장비",
      options: pick(pioneerEquipmentIds),
    },
    {
      id: "unexplored-crafted",
      label: "미개척지 · 특화 제작 장비",
      options: pick(unexploredCraftedIds),
    },
    {
      id: "unexplored-boss",
      label: "미개척지 · 보스 고유 장비",
      options: pick(bossEquipmentIds),
    },
  ].filter((group) => group.options.length > 0);
}
