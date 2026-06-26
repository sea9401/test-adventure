// 사냥 보상/회복 계산 — runOneHunt 에서 추출한 순수 헬퍼(DB 미접촉·RNG 미사용).
import {
  applyNewbieExpBonusByBattles,
  XP_RATE_MULT,
} from "@/lib/leveling";
import { monsterGoldReward } from "@/adventure/v2/combat/monsterGold";
import type { Monster } from "@/adventure/data/monsters";

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
}): { afterHp: number; afterMp: number; hpCharges: number; mpCharges: number } {
  let { afterHp, afterMp, hpCharges, mpCharges } = params;
  const { maxHp, maxMp } = params;
  // HP 부족분 만큼 hpCharges 차감.
  if (afterHp > 0 && afterHp < maxHp && hpCharges > 0) {
    const need = maxHp - afterHp;
    const restore = Math.min(need, hpCharges);
    afterHp += restore;
    hpCharges -= restore;
  }
  // MP 부족분 만큼 mpCharges 차감.
  if (afterMp < maxMp && mpCharges > 0) {
    const need = maxMp - afterMp;
    const restore = Math.min(need, mpCharges);
    afterMp += restore;
    mpCharges -= restore;
  }
  return { afterHp, afterMp, hpCharges, mpCharges };
}
