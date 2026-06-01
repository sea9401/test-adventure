// v2 제작 레시피 — 재료 직접 제작 (재료 + 골드 → 완성 장비).
// docs/v2-item-crafting-plan.md 제작 척추 PR-2.
//
// "소비-업그레이드"(하위 장비 소모) 방식은 폐기 — 이전 장비를 먹지 않고 **재료만으로**
// 완성품을 만든다. 레시피는 전부 자동 보유(수집/게이팅 없음) — 재료 + 골드만 모으면 제작.
//
// 55종(V2_EQUIPMENT) 전부 레시피 보유. (슬롯/컨셉) → 재료 계열, 티어 → 재료 등급·수량·골드.
// 매핑은 규칙 기반 생성(아래) — 같은 티어라도 계열이 갈려 다른 재료를 쓴다(금속 vs 가죽 vs
// 마력). 수량·골드 배수는 sim 캘리브 다이얼.
//
// 이 PR 은 **데이터 + 순수 헬퍼만** — 실제 제작 실행(재료 소비·장비 grant)과 라우트/UI 는
// PR-3/PR-4. 여기엔 catalog + 조회/제작가능판정(순수)만 둔다.

import {
  V2_EQUIPMENT,
  shopPriceFor,
  type V2Equipment,
  type V2EquipConcept,
  type V2EquipmentId,
  type V2EquipSlot,
  type V2EquipTier,
} from "./v2Equipment";
import type { V2MaterialId } from "./dungeonDrops";

export type V2RecipeIngredient = { id: V2MaterialId; count: number };

export type V2Recipe = {
  result: V2EquipmentId;
  ingredients: V2RecipeIngredient[];
  /** 재료 외 추가 골드 비용. 재료가 주 게이트, 골드는 보조 싱크. */
  gold: number;
};

// 재료 계열 — 슬롯/컨셉이 어느 계열 재료를 쓰나.
//   금속(metal): 검(str) · 중갑(heavy 방어 3슬롯)
//   가죽/직물(leather): 활(dex) · 경갑(light 방어 3슬롯)
//   마력(magic): 지팡이(int) · 반지(luck) · 목걸이(mana)
type Family = "metal" | "leather" | "magic";

// 계열별 [저, 중, 고] 등급 재료. 티어에 따라 골라 쓴다 (드랍 층 게이팅과 정렬).
const FAMILY_MATERIALS: Record<
  Family,
  readonly [V2MaterialId, V2MaterialId, V2MaterialId]
> = {
  metal: ["v2_rough_ore", "v2_steel_ingot", "v2_mithril_ore"],
  leather: ["v2_tough_hide", "v2_silk_thread", "v2_windweave_cloth"],
  magic: ["v2_mana_dust", "v2_rune_shard", "v2_arcane_crystal"],
};

function familyOf(slot: V2EquipSlot, concept: V2EquipConcept): Family {
  if (slot === "weapon") {
    if (concept === "str") return "metal";
    if (concept === "dex") return "leather";
    return "magic"; // int 지팡이
  }
  if (slot === "ring" || slot === "necklace") return "magic";
  // armor / gloves / boots — heavy=금속, light=가죽
  return concept === "heavy" ? "metal" : "leather";
}

// 골드 비용 = 상점 구매가 × 분율 (사는 것보다 싸게 — 제작이 정규 경로). sim 다이얼.
const CRAFT_GOLD_FRACTION = 0.3;

// 티어별 재료 템플릿. fam[0/1/2] = 계열 저/중/고. 공용은 티어별로 고정
// (T1 약초 → T2 슬라임조각 → T3 뼛조각 → T4 짐승힘줄 → T5 별빛가루 + 짐승힘줄).
// 고티어일수록 상위 계열 재료·수량↑. 고등급 계열 재료(고)·별빛가루는 깊은 층 게이트.
function ingredientsFor(
  family: Family,
  tier: V2EquipTier,
): V2RecipeIngredient[] {
  const fam = FAMILY_MATERIALS[family];
  switch (tier) {
    case 1:
      return [
        { id: fam[0], count: 2 },
        { id: "v2_herb", count: 2 },
      ];
    case 2:
      return [
        { id: fam[0], count: 3 },
        { id: fam[1], count: 1 },
        { id: "v2_slime_shard", count: 2 },
      ];
    case 3:
      return [
        { id: fam[1], count: 3 },
        { id: "v2_bone_fragment", count: 2 },
      ];
    case 4:
      return [
        { id: fam[1], count: 2 },
        { id: fam[2], count: 2 },
        { id: "v2_beast_sinew", count: 2 },
      ];
    case 5:
      return [
        { id: fam[2], count: 4 },
        { id: "v2_starlit_dust", count: 2 },
        { id: "v2_beast_sinew", count: 2 },
      ];
    default:
      // 티어는 1~5(V2EquipTier) — 도달 불가. 컴파일 타임 exhaustiveness(아래) +
      // 런타임 방어(데이터 오염 시 잘못된 레시피 대신 즉시 실패).
      return assertNever(tier);
  }
}

// 도달 불가 경로 가드 — x 가 never 가 아니면(티어 추가 등) 컴파일 에러, 동시에 런타임 throw.
function assertNever(x: never): never {
  throw new Error(`v2Recipes: 예상치 못한 티어 ${JSON.stringify(x)}`);
}

function buildRecipe(item: V2Equipment): V2Recipe {
  const shopPrice = shopPriceFor(item.tier, item.slot) ?? 0;
  return {
    result: item.id,
    ingredients: ingredientsFor(familyOf(item.slot, item.concept), item.tier),
    gold: Math.max(1, Math.round(shopPrice * CRAFT_GOLD_FRACTION)),
  };
}

// V2_RECIPES — V2_EQUIPMENT 와 1:1 (전 55종). result == key.
export const V2_RECIPES: Record<V2EquipmentId, V2Recipe> = (() => {
  const out = {} as Record<V2EquipmentId, V2Recipe>;
  for (const id of Object.keys(V2_EQUIPMENT) as V2EquipmentId[]) {
    out[id] = buildRecipe(V2_EQUIPMENT[id]);
  }
  return out;
})();

export function recipeFor(id: V2EquipmentId): V2Recipe {
  return V2_RECIPES[id];
}

// === 제작 가능 판정 (순수) =========================================
// 보유 재료/골드로 이 레시피를 만들 수 있나. UI(부족 표시)·엔진(실행 전 검증) 공용.
// materials 는 손상 입력 허용(객체 아님 → 빈 것으로 간주).

export type CraftShortfall = {
  ok: boolean;
  missingMaterials: { id: V2MaterialId; need: number; have: number }[];
  goldShort: number;
};

export function craftShortfall(
  recipe: V2Recipe,
  materials: unknown,
  gold: number,
): CraftShortfall {
  const have = (
    materials && typeof materials === "object" ? materials : {}
  ) as Record<string, unknown>;
  // 같은 재료 id 가 여러 줄에 있어도 필요량 합산(현 카탈로그엔 중복 없지만 헬퍼 계약 견고화).
  // 등장 순서 보존(첫 등장 순).
  const required = new Map<V2MaterialId, number>();
  for (const ing of recipe.ingredients) {
    required.set(ing.id, (required.get(ing.id) ?? 0) + ing.count);
  }
  const missingMaterials: { id: V2MaterialId; need: number; have: number }[] =
    [];
  for (const [id, need] of required) {
    const raw = have[id];
    const owned =
      typeof raw === "number" && Number.isFinite(raw)
        ? Math.max(0, Math.floor(raw))
        : 0;
    if (owned < need) {
      missingMaterials.push({ id, need, have: owned });
    }
  }
  const goldShort = Math.max(0, recipe.gold - Math.max(0, Math.floor(gold)));
  return {
    ok: missingMaterials.length === 0 && goldShort === 0,
    missingMaterials,
    goldShort,
  };
}

// 레시피 재료를 보유 맵에서 차감한 **새 맵** 반환(순수, 입력 불변). 0 이하가 된 키는 제거.
// 사전조건: craftShortfall(...).ok === true (충분함이 이미 검증됨) — 음수 보유는 안 만든다.
// 레시피 무관 재료는 그대로 보존. 같은 id 가 여러 줄이어도 순차 차감이라 누적 소비된다.
export function consumeIngredients(
  materials: Record<string, number>,
  recipe: V2Recipe,
): Record<string, number> {
  const next: Record<string, number> = { ...materials };
  for (const ing of recipe.ingredients) {
    const remaining = (next[ing.id] ?? 0) - ing.count;
    if (remaining > 0) next[ing.id] = remaining;
    else delete next[ing.id];
  }
  return next;
}
