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

export type CatalogOption = { id: string; name: string; label: string };

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

export function cookingIngredientOptions(): CatalogOption[] {
  return [
    ...COOKING_PANTRY_ITEMS.map((item) => ({
      id: item.id,
      name: item.name,
      label: `상점 · ${item.icon} ${item.name}`,
    })),
    ...COOKING_PROCESSING_RECIPES.map((recipe) => ({
      id: recipe.outputId,
      name: recipe.name,
      label: `가공 · ${recipe.icon} ${recipe.name}`,
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
