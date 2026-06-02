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

import type { V2EquipmentId } from "./v2Equipment";
import type { V2MaterialId } from "./dungeonDrops";

export type V2RecipeIngredient = { id: V2MaterialId; count: number };

export type V2Recipe = {
  result: V2EquipmentId;
  ingredients: V2RecipeIngredient[];
  /** 재료 외 추가 골드 비용. 재료가 주 게이트, 골드는 보조 싱크. */
  gold: number;
};

// 2026-06-03: 제작 시스템 **통째 보류** — 레시피 카탈로그를 비웠다(재료 보류와 연동,
// dungeonDrops.ts 참고). 대장간에 제작 가능 항목이 없어진다. 재료 계열 매핑·티어별 재료
// 템플릿·규칙 기반 생성 로직은 제거(필요 시 git 이력에서 복원). 아래 순수 헬퍼
// (recipeFor/craftShortfall/consumeIngredients/salvageYield)와 타입은 휴면으로 보존 —
// 빈 카탈로그에서 무해하게 동작하며, 제작 재설계 시 V2_RECIPES 채우면 바로 되살아난다.
export const V2_RECIPES: Partial<Record<V2EquipmentId, V2Recipe>> = {};

// 레시피 조회 — 유니크 등 비제작 장비는 undefined.
export function recipeFor(id: V2EquipmentId): V2Recipe | undefined {
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

// === 분해 (salvage) =================================================
// 장비를 재료로 되돌린다. 골드는 환수 안 함(골드는 싱크 방향) — 판매(골드)와 다른 통화라 공존.
// 유니크는 레시피가 없어 분해 불가(호출부가 recipe 부재로 가드).

// 환수율 — 레시피 재료의 이 비율(내림)만 돌려준다. 손실은 의도(무한 제작↔분해 무료 루프 방지).
export const SALVAGE_FRACTION = 0.5;

// 레시피 → 분해 시 돌려받는 재료(순수). 재료별 floor(count × SALVAGE_FRACTION), 0 은 생략.
export function salvageYield(
  recipe: V2Recipe,
): Partial<Record<V2MaterialId, number>> {
  const out: Partial<Record<V2MaterialId, number>> = {};
  for (const ing of recipe.ingredients) {
    const amt = Math.floor(ing.count * SALVAGE_FRACTION);
    if (amt > 0) out[ing.id] = (out[ing.id] ?? 0) + amt;
  }
  return out;
}
