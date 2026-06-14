// 토벌 현상금/벌금 — 순수 상수 + 헬퍼. (docs/v2-war-redesign-plan.md PR-3)
//
// 점령 길드원이 침입자 토벌에 승리하면 침입자의 개인 골드에서 벌금을 떼어 토벌자 현상금으로
// 준다. 골드만 — 재료·장비·길드 골드는 건드리지 않는다(매운맛이되 회복 가능한 손실).
// 침입자 보유 골드가 적으면 가진 만큼만(음수 잔액 불가). 상한으로 한 번에 큰 손실은 막는다.
//
// 액수 = 정액(거점 tier 비례) + 보유 골드 소액 비례. tier 높은 거점일수록 벌금 큼.

export const EJECT_BOUNTY_BASE_GOLD = 50; // 다이얼
export const EJECT_BOUNTY_TIER_MULT: Record<number, number> = {
  1: 1,
  2: 1.4,
  3: 1.8,
  4: 2.5,
}; // 다이얼
export const EJECT_BOUNTY_TARGET_GOLD_PCT = 0.05; // 보유 골드의 5% 가산 (다이얼)
export const EJECT_BOUNTY_MAX_GOLD = 500; // 1회 상한 (다이얼)

// 토벌 승리 시 침입자에게서 떼는 골드(= 토벌자 현상금). 침입자 보유 골드와 상한이 한도.
export function ejectBountyGold(targetGold: number, tier: number): number {
  const g = Math.max(0, Math.floor(targetGold));
  if (g <= 0) return 0;
  const mult = EJECT_BOUNTY_TIER_MULT[tier] ?? 1;
  const raw = Math.round(
    EJECT_BOUNTY_BASE_GOLD * mult + g * EJECT_BOUNTY_TARGET_GOLD_PCT,
  );
  return Math.max(0, Math.min(raw, Math.min(g, EJECT_BOUNTY_MAX_GOLD)));
}
