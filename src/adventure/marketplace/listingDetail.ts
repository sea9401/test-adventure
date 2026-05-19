import { ITEMS, type ItemId } from "@/adventure/data/items";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { POTIONS } from "@/adventure/data/potions";
import { getRecipeById, resolveCraftedItem } from "@/adventure/data/recipes";
import {
  craftVarianceSummary,
  type CraftTier,
} from "@/adventure/data/craftQuality";
import {
  applyDropQuality,
  type DropQuality,
} from "@/adventure/data/dropQuality";
import { SKILL_BOOKS, type SkillBookId } from "@/adventure/data/skillBooks";
import type { Listing } from "./types";

// 변형 키(c±N) 가 있으면 recipes 의 variance 까지 반영한 stats. (dN) 이면 dropQuality 적용.
// base 면 변동 없음.
function resolveVariantEquip(itemId: ItemId, variantKey: string) {
  const base = ITEMS[itemId];
  if (
    variantKey === "c-2" ||
    variantKey === "c-1" ||
    variantKey === "c1" ||
    variantKey === "c2"
  ) {
    const tier = Number(variantKey.slice(1)) as CraftTier;
    // recipes 에서 variance 정의 찾기 — 못 찾으면 base 의 dropVariance 라도 사용 (fallback).
    return resolveCraftedItem(itemId, tier);
  }
  if (variantKey === "d1" || variantKey === "d2") {
    return applyDropQuality(base, Number(variantKey.slice(1)) as DropQuality);
  }
  // base — 변동 없음.
  return base;
}

// 매물 카드를 클릭하면 펼쳐 보여줄 상세 — 장비 옵션 / 제작서 결과 / 재료 설명.
export type ListingDetail = {
  title?: string;
  lines: { label: string; value: string }[];
  /** 제작 품질 변동 안내 ("공격력 +6~+10" 식). */
  variance?: string;
  description?: string;
};

export function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

export function listingDetail(item: Listing): ListingDetail | null {
  if (item.itemKind === "equip") {
    if (!hasOwn(ITEMS, item.itemId)) return null;
    // 등급 사본은 stats 가 다름 — variantKey 반영해서 표시.
    const resolved = resolveVariantEquip(item.itemId as ItemId, item.variantKey);
    return { lines: [...resolved.stats], description: resolved.description };
  }
  if (item.itemKind === "recipe") {
    const r = getRecipeById(item.itemId);
    if (!r) return null;
    if (r.result.kind === "equipment") {
      const def = ITEMS[r.result.itemId];
      return {
        title: `제작 결과: ${def.name}`,
        lines: [...def.stats],
        variance: craftVarianceSummary(def, r) ?? undefined,
        description: def.description,
      };
    }
    const p = POTIONS[r.result.potionId];
    const qty = r.result.quantity;
    return {
      title: `제작 결과: ${p.name}${qty > 1 ? ` ×${qty}` : ""}`,
      lines: [],
      description: p.description,
    };
  }
  if (item.itemKind === "material") {
    if (!hasOwn(MATERIALS, item.itemId)) return null;
    return { lines: [], description: MATERIALS[item.itemId as MaterialId].description };
  }
  if (item.itemKind === "skill_book") {
    if (!hasOwn(SKILL_BOOKS, item.itemId)) return null;
    return {
      lines: [],
      description: SKILL_BOOKS[item.itemId as SkillBookId].description,
    };
  }
  return null;
}
