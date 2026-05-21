import { ITEMS, type ItemId } from "@/adventure/data/items";
import { MATERIALS, type MaterialId } from "@/adventure/data/materials";
import { getRecipeById } from "@/adventure/data/recipes";
import { TITLES } from "@/adventure/data/titles";
import {
  isStarlitRing,
  starlitRingStatsFromBonus,
} from "@/adventure/inventory/starlitRing";
import type { CoopClaimResponse } from "./useCoopBoss";

type Services = {
  /** inventory.v2 통째 교체 — 서버 mutation 후 받은 새 값. */
  replaceInventoryFromSaved: (raw: unknown) => void;
  /** crafting.v2 통째 교체. */
  replaceCraftingFromSaved: (raw: unknown) => void;
  /** adventure-log.v2 통째 교체. */
  replaceAdventureLogFromSaved: (raw: unknown) => void;
  /**
   * 칭호 부여 알림 + 컬렉션 체인 처리 — saves 교체와 별도로 토스트/잔영 체인을
   * 위해 grantTitle 도 호출. markTitleObtained 자체는 saves replace 가 처리하지만
   * grantTitle 안의 토스트 + starlit_quietener 컬렉션 체인 효과가 필요.
   */
  grantTitle: (titleId: string) => void;
};

/** 실제로 적용된 보상 요약 — 보스 카드의 보상 로그 표시에 사용. */
export type AppliedCoopReward = {
  materials: { id: MaterialId; name: string; count: number }[];
  recipes: { id: string; name: string }[];
  equipment: { id: ItemId; name: string }[];
  /** 롤 인스턴스 보상(별빛 고리) — 옵션 문자열 포함. equipment(스택형)와 별개로 표시. */
  rings: { instanceId: string; name: string; options: string }[];
  title?: { id: string; name: string };
};

/**
 * 협동 보스 claim 응답 처리 — 서버가 saves_kv 에 이미 적용한 상태.
 * 클라는 saves 를 통째 replace 하고 reward summary 를 빌드해 토스트로 보여준다.
 * applied=false (retry idempotent) 인 경우 saves 만 replace 하고 summary 는 빈 값으로
 * (이미 적용된 보상이라 표시할 게 없음).
 */
export function applyCoopReward(
  response: CoopClaimResponse,
  s: Services,
): AppliedCoopReward {
  // saves 가 있으면 통째 교체 — applied 여부와 무관 (retry 시 서버 latest 로 자가 수렴).
  if (response.saves["inventory.v2"] !== undefined) {
    s.replaceInventoryFromSaved(response.saves["inventory.v2"]);
  }
  if (response.saves["crafting.v2"] !== undefined) {
    s.replaceCraftingFromSaved(response.saves["crafting.v2"]);
  }
  if (response.saves["adventure-log.v2"] !== undefined) {
    s.replaceAdventureLogFromSaved(response.saves["adventure-log.v2"]);
  }

  const applied: AppliedCoopReward = {
    materials: [],
    recipes: [],
    equipment: [],
    rings: [],
  };

  // retry → 이미 적용된 보상이라 summary 비움. 토스트도 "이미 받음" 으로 호출 측이 처리.
  if (!response.applied) return applied;

  const reward = response.reward;
  for (const [id, n] of Object.entries(reward.materials)) {
    if (!n) continue;
    const mid = id as MaterialId;
    const def = MATERIALS[mid];
    applied.materials.push({ id: mid, name: def?.name ?? id, count: n });
  }
  for (const recipeId of reward.recipes) {
    const def = getRecipeById(recipeId);
    applied.recipes.push({ id: recipeId, name: def?.name ?? recipeId });
  }
  for (const itemIdStr of reward.equipment) {
    const itemId = itemIdStr as ItemId;
    const def = ITEMS[itemId as keyof typeof ITEMS];
    applied.equipment.push({ id: itemId, name: def?.name ?? itemIdStr });
  }
  // 롤 인스턴스(별빛 고리) — 서버가 inventory.equipmentInstances 에 이미 push 했고, 여기선
  // 토스트/로그 표시용 요약만 만든다. 옵션 문자열까지 보여 "뭐가 떨어졌는지" 바로 알게.
  for (const inst of reward.equipmentInstances ?? []) {
    const def = ITEMS[inst.itemId as keyof typeof ITEMS];
    const options =
      isStarlitRing(inst.itemId) && inst.rolledBonus
        ? starlitRingStatsFromBonus(inst.rolledBonus)
            .map((s) => `${s.label} ${s.value}`)
            .join(" · ")
        : "";
    applied.rings.push({
      instanceId: inst.instanceId,
      name: def?.name ?? inst.itemId,
      options,
    });
  }
  if (reward.titleId) {
    // grantTitle — 토스트 + 잔영 컬렉션 체인. adventureLog.titles 는 saves replace 가 이미 박았음.
    s.grantTitle(reward.titleId);
    const def = TITLES[reward.titleId];
    applied.title = { id: reward.titleId, name: def?.name ?? reward.titleId };
  }
  return applied;
}
