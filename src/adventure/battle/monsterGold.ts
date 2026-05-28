import type { Monster } from "../data/monsters";

// 전투 킬당 기본 골드 — 몬스터 exp 비례. exp 가 이미 진행도/강함을 인코딩하므로 단일 계수
// 하나로 전 구간이 자동 스케일된다(데이터 몬스터별 골드 필드 불필요).
//
// 이 base 골드는 기존 `kind:"gold"` 드롭과 별개로 *모든 처치*에 부여된다. 각 경로에서 gold
// 드롭과 동일하게 후처리된다 — autoHunt/offlineSim 은 raw 누계 후 efficiency×paragon×부여,
// 단판(battleClaim)은 paragonRewardMult 곱.
//
// 2026-05-28: 0.01 → 0.1 (10×). 라이브 캘리브 (만렙 6h ~14k) 가 v2 staging 에는 너무 짠.
// 포션 가격 (heal_s shopPrice 150g) 대비 잡몹 1g 으로 보충 불가. 10× 로 exp 100 → 10g,
// ~15마리에 포션 1개 자연 페이싱. staging 측정 후 후속 튜닝.
export const BASE_GOLD_RATE = 0.1;

/** 한 마리 처치 시 부여되는 base 골드(부스트 전 raw). 최소 1 보장. */
export function monsterGoldReward(monster: Pick<Monster, "exp">): number {
  return Math.max(1, Math.round(monster.exp * BASE_GOLD_RATE));
}
