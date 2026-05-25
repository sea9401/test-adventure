// v2 병사 시스템 — stone 으로 병사 모집, 영웅 전투에 atk/hp 보정.
//
// design doc: "영웅이 이기면 병사들의 스탯이 소폭 상승한 상태로 전쟁이 시작" —
// 본 병사 전쟁은 미래. 첫 단계로 병사 수가 영웅 일기토 자체의 stat 에 살짝
// 보정만 (영웅이 진두지휘하는 그림).

import type { PlayerCombat } from "../../battle/engine";

export const SOLDIER_COST_STONE = 10; // 1 병사 = 10 stone

// 1 병사당 영웅 보정. 만렙 영웅 atk ~80 / hp ~1000 기준 — 병사 100 명 ≈ +50 atk +500 hp.
// 의미 있는 보정이지만 영웅 strength 가 여전히 dominant.
export const SOLDIER_ATK_PER = 0.5;
export const SOLDIER_HP_PER = 5;

// 누적 상한 — upkeep/소모 없는 현 단계의 무한 인플레 차단용 다이얼.
// 200 ≈ +100 atk / +1000 hp (만렙 영웅의 +100%/+100%). 본 병사 전쟁 도입 시 재튜닝.
export const SOLDIER_MAX_TOTAL = 200;

// 영웅 PlayerCombat 에 병사 보정 적용. 순수 함수.
// soldiers <= 0 → 항등. maxHp 도 같이 올라가고 hp 도 비례.
export function applySoldierBoost(
  player: PlayerCombat,
  soldiers: number,
): PlayerCombat {
  if (soldiers <= 0) return player;
  const atkBonus = Math.floor(soldiers * SOLDIER_ATK_PER);
  const hpBonus = Math.floor(soldiers * SOLDIER_HP_PER);
  return {
    ...player,
    atk: player.atk + atkBonus,
    maxHp: player.maxHp + hpBonus,
    hp: Math.min(player.maxHp + hpBonus, player.hp + hpBonus),
  };
}
