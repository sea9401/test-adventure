// 사냥 보상/회복 계산 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉·RNG 미사용).
import {
  applyNewbieExpBonusByBattles,
  XP_RATE_MULT,
} from "@/lib/leveling";
import { monsterGoldReward } from "@/adventure/v2/combat/monsterGold";
import type { Monster } from "@/adventure/data/monsters";
import type { RareMapInstance } from "@/adventure/data/v2/rareMaps";

/** 실제 전투 1회 승리 뒤 정산할 기존 희귀 탐사 보상 횟수. */
export function rareMapRewardRolls(
  activeRareMap: RareMapInstance | null,
  won: boolean,
): number {
  if (!activeRareMap || !won) return 1;
  return Math.max(1, Math.floor(activeRareMap.runsLeft));
}

/** 1회 확정 보상을 압축 정산 횟수만큼 합산한다. */
export function multiplyHuntReward(
  value: number,
  rewardRolls: number,
): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
  const safeRolls = Number.isFinite(rewardRolls)
    ? Math.max(1, Math.floor(rewardRolls))
    : 1;
  return safeValue * safeRolls;
}

/** 희귀 탐사는 저장된 배치 설정과 무관하게 실제 전투를 한 번만 해결한다. */
export function normalizeHuntBattleCount(
  requestedCount: number,
  rareMapIid: string | null,
): number {
  if (rareMapIid) return 1;
  return Number.isFinite(requestedCount)
    ? Math.max(1, Math.floor(requestedCount))
    : 1;
}

export function potionTargetAmount(
  maxHp: number,
  targetPct: number = 100,
): number {
  const safeMaxHp = Math.max(0, maxHp);
  const safeTargetPct = Number.isFinite(targetPct)
    ? Math.min(100, Math.max(0, targetPct))
    : 100;
  return Math.ceil((safeMaxHp * safeTargetPct) / 100);
}

// EXP/골드 gross — monster.exp → 신참 보너스(전적 ≤ 3만 ×2, EXP 전용) → 전역 배율 → 레어맵 배수.
//   라이브 battleClaim 과 같은 순서(newbie 먼저, 그 다음 배율). 신참 드롭 보너스는 폐지(EXP 전용).
export function computeBattleRewards(params: {
  won: boolean;
  enemyMonster: Pick<Monster, "exp">;
  battleCount: number;
  mapExpMult: number;
  mapGoldMult: number;
}): { expGained: number; goldGross: number } {
  const { won, enemyMonster, battleCount, mapExpMult, mapGoldMult } = params;
  const baseExp = won
    ? applyNewbieExpBonusByBattles(enemyMonster.exp, battleCount).gained
    : 0;
  const expGained = Math.round(baseExp * XP_RATE_MULT * mapExpMult);
  const goldGross = won
    ? Math.round(monsterGoldReward(enemyMonster) * mapGoldMult)
    : 0;
  return { expGained, goldGross };
}

// 충전식 회복약 소모 — 전투 후 HP/MP 부족분을 보유 충전량으로 채운다(1g=1충전).
//   옛 POTIONS 카탈로그(heal_s/m/l) 폐기 후 단순 카운터. 영속(inventory.v2 기록)은 라우트가 한다.
export function applyChargeRestore(params: {
  afterHp: number;
  afterMp: number;
  maxHp: number;
  maxMp: number;
  hpCharges: number;
  mpCharges: number;
  hpTargetPct?: number;
  mpTargetPct?: number;
}): { afterHp: number; afterMp: number; hpCharges: number; mpCharges: number } {
  let { afterHp, afterMp, hpCharges, mpCharges } = params;
  const { maxHp, maxMp } = params;
  const hpTarget = potionTargetAmount(maxHp, params.hpTargetPct);
  const mpTarget = potionTargetAmount(maxMp, params.mpTargetPct);
  // 설정한 목표 HP까지의 부족분만큼 hpCharges 차감.
  if (afterHp < hpTarget && hpCharges > 0) {
    const need = hpTarget - afterHp;
    const restore = Math.min(need, hpCharges);
    afterHp += restore;
    hpCharges -= restore;
  }
  // 설정한 목표 MP까지의 부족분만큼 mpCharges 차감.
  if (afterMp < mpTarget && mpCharges > 0) {
    const need = mpTarget - afterMp;
    const restore = Math.min(need, mpCharges);
    afterMp += restore;
    mpCharges -= restore;
  }
  return { afterHp, afterMp, hpCharges, mpCharges };
}
