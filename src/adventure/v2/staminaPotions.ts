// 스태미나 포션 — 보관형 소비 아이템. 받아서 보관하다 필요할 때 사용(개당 스태미나 회복).
//
// 전용 세이브 키(stamina-potions.v1)에 총수량과 귀속 수량을 보관한다. inventory.v2/character.v2 파스가
// 미상 필드를 떨구는(carry-through 안 함) 문제를 피하려 격리 — fishing-wallet.v1 패턴.
// 관리자 지급·상점 구매분은 boundCount에 함께 누적하고, 보상·제작분은 비귀속으로 둔다.
// 사용 = POST /api/v2/me/use-stamina-potion.

export const STAMINA_POTIONS_KEY = "stamina-potions.v1";

// 1개 사용 시 회복량(다이얼). 비밀상점 "스태미나 회복약"과 동일하게 200.
export const STAMINA_POTION_RESTORE = 200;

export type StaminaPotions = { count: number; boundCount: number };

function nonNegativeInt(raw: unknown): number {
  return typeof raw === "number" && Number.isFinite(raw)
    ? Math.max(0, Math.floor(raw))
    : 0;
}

export function parseStaminaPotions(raw: unknown): StaminaPotions {
  if (!raw || typeof raw !== "object") return { count: 0, boundCount: 0 };
  const value = raw as { count?: unknown; boundCount?: unknown };
  const count = nonNegativeInt(value.count);
  return {
    count,
    // 레거시 저장값에는 boundCount가 없으므로 기존 보유분을 소급 귀속하지 않는다.
    boundCount: Math.min(count, nonNegativeInt(value.boundCount)),
  };
}

export function staminaPotionCount(raw: unknown): number {
  return parseStaminaPotions(raw).count;
}

export function grantStaminaPotions(
  raw: unknown,
  amount: number,
  options?: { bound?: boolean },
): StaminaPotions {
  const current = parseStaminaPotions(raw);
  const granted = nonNegativeInt(amount);
  return {
    count: current.count + granted,
    boundCount: current.boundCount + (options?.bound ? granted : 0),
  };
}

/** 귀속분을 먼저 사용해 비귀속 수량을 가능한 한 보존한다. */
export function consumeStaminaPotions(
  raw: unknown,
  amount: number,
): StaminaPotions {
  const current = parseStaminaPotions(raw);
  const consumed = Math.min(current.count, nonNegativeInt(amount));
  return {
    count: current.count - consumed,
    boundCount: Math.max(0, current.boundCount - consumed),
  };
}
