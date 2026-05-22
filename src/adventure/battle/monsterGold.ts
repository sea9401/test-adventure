import type { Monster } from "../data/monsters";

// 전투 킬당 기본 골드 — 몬스터 exp 비례. exp 가 이미 진행도/강함을 인코딩하므로 단일 계수
// 하나로 전 구간이 자동 스케일된다(데이터 몬스터별 골드 필드 불필요). 만렙 6h 오토헌트
// ~14k/세션을 목표로 sim 캘리브레이션해 정한 값 (docs/gold-income-plan.md).
//
// 이 base 골드는 기존 `kind:"gold"` 드롭과 별개로 *모든 처치*에 부여된다. 각 경로에서 gold
// 드롭과 동일하게 후처리된다 — autoHunt/offlineSim 은 raw 누계 후 efficiency×paragon×부여,
// 단판(battleClaim)은 paragonRewardMult 곱.
export const BASE_GOLD_RATE = 0.01;

/** 한 마리 처치 시 부여되는 base 골드(부스트 전 raw). 최소 1 보장. */
export function monsterGoldReward(monster: Pick<Monster, "exp">): number {
  return Math.max(1, Math.round(monster.exp * BASE_GOLD_RATE));
}
