// 스태미나 포션 — 보관형 소비 아이템. 받아서 보관하다 필요할 때 사용(개당 스태미나 회복).
//
// 전용 세이브 키(stamina-potions.v1)에 개수만 보관한다. inventory.v2/character.v2 파스가
// 미상 필드를 떨구는(carry-through 안 함) 문제를 피하려 격리 — fishing-wallet.v1 패턴.
// 획득 = 퀘스트 일일/주간 마일스톤 보상. 사용 = POST /api/v2/me/use-stamina-potion.

export const STAMINA_POTIONS_KEY = "stamina-potions.v1";

// 1개 사용 시 회복량(다이얼). 비밀상점 "스태미나 회복약"과 동일하게 200.
export const STAMINA_POTION_RESTORE = 200;

export type StaminaPotions = { count: number };

export function parseStaminaPotions(raw: unknown): StaminaPotions {
  if (!raw || typeof raw !== "object") return { count: 0 };
  const c = (raw as { count?: unknown }).count;
  return {
    count:
      typeof c === "number" && Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0,
  };
}

export function staminaPotionCount(raw: unknown): number {
  return parseStaminaPotions(raw).count;
}
