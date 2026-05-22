// 고탑 층 스케일링 — 베이스 mob/보스 스탯에 층 함수를 곱해 실제 전투에 쓰이는 스탯을 산출.
// 공식 (메모 합의 / sim-tower.ts 프로필 A):
//   HP  × F^0.45
//   ATK × F^0.25
//   DEF × F^0.25
//   F   = 층 번호 (1, 2, 3, ...)
//
// 베이스는 풀 매핑(floorPools.ts) 의 entry 가 지정한 monsterName 의 MONSTERS 항목 + 옵션
// bossMultiplier. 결과는 정수로 반올림.

import type { Monster } from "@/adventure/data/monsters";
import type { TowerModifier } from "./modifiers";
import { TOWER_BOSS_INTERVAL } from "./types";

export const TOWER_HP_EXP = 0.1;
export const TOWER_ATK_EXP = 0.04;
export const TOWER_DEF_EXP = 0.12;

// 고탑 적 명중(accuracy) — 플레이어 유효 회피에서 %p 차감. 고회피(DEX) 빌드가 회피의
// 이진성으로 스케일링을 무시하고 벽을 우회하던 문제 견제. 실게임(apply.ts)·sim-tower 공용
// 단일 소스. 탑밖 전투는 Monster.accuracy 가 없어 0(무변화).
//
// START_FLOOR=90 의도: 현재 최고 도달층이 89(보스90 벽)이라, 90 이하는 명중 0 으로 두어
// **기존 플레이어 진행을 절대 깎지 않는다**(회피 빌드가 89에서 퇴보하지 않음). 명중은 아직
// 아무도 못 간 91+ 미답 구간에서만 ramp 해 우회를 견제. 보스는 배수로 더 정확.
// 절대 난이도 곡선(페이스롤→절벽) 재설계는 후속 PR — 거기서 명중·스케일 동반 튜닝.
export const TOWER_ACC_START_FLOOR = 90;
export const TOWER_ACC_PER_FLOOR = 1.15;
export const TOWER_ACC_BOSS_MULT = 1.5;

/** 해당 층 적의 명중(%p). isBoss 면 배수 적용. START_FLOOR 이하는 0. */
export function towerEnemyAccuracy(floor: number, isBoss: boolean): number {
  if (floor <= TOWER_ACC_START_FLOOR) return 0;
  const base = (floor - TOWER_ACC_START_FLOOR) * TOWER_ACC_PER_FLOOR;
  return Math.round(base * (isBoss ? TOWER_ACC_BOSS_MULT : 1));
}

/** 보스층 여부 — 10/20/30/... */
export function isBossFloor(floor: number): boolean {
  return floor > 0 && floor % TOWER_BOSS_INTERVAL === 0;
}

/** 보스층이면 그 보스의 슬롯 인덱스(0-based, 10층 → 0, 20층 → 1, ...) */
export function bossSlotForFloor(floor: number): number | null {
  if (!isBossFloor(floor)) return null;
  return Math.floor(floor / TOWER_BOSS_INTERVAL) - 1;
}

/** 가장 가까운(현재 층 이하) 보스층. 1~9 → 0, 10~19 → 10, ... */
export function lastBossFloorAtOrBelow(floor: number): number {
  if (floor <= 0) return 0;
  return Math.floor(floor / TOWER_BOSS_INTERVAL) * TOWER_BOSS_INTERVAL;
}

/** 클리어한 최고층 → 다음 시도 시작층. 첫 시도면 1. */
export function startFloorAfterCheckpoint(highestFloor: number): number {
  return lastBossFloorAtOrBelow(highestFloor) + 1;
}

/**
 * 선택 가능한 시작층 목록 — 체크포인트 선택제.
 * F1 은 항상 가능. 그리고 클리어한 각 보스층 다음 (F11, F21, …) 도 가능.
 *
 * 예:
 *  - highestFloor=0 → [1]
 *  - highestFloor=9 → [1] (보스 한 번도 못 깸)
 *  - highestFloor=10 → [1, 11]
 *  - highestFloor=35 → [1, 11, 21, 31]
 *  - highestFloor=100 → [1, 11, 21, 31, 41, 51, 61, 71, 81, 91, 101]
 *
 * 의도: 한계 보스를 못 깰 때 낮은 보스 다시 잡아 인장 파밍 가능하게 — PR-C1 의 "매 보스 클리어
 * 마다 토큰" 약속이 한계 정체 플레이어에게도 적용되도록.
 */
export function availableStartFloors(highestFloor: number): number[] {
  const lastBoss = lastBossFloorAtOrBelow(highestFloor);
  const floors: number[] = [1];
  for (let b = TOWER_BOSS_INTERVAL; b <= lastBoss; b += TOWER_BOSS_INTERVAL) {
    floors.push(b + 1);
  }
  return floors;
}

export type ScaledStats = {
  hp: number;
  atk: number;
  def: number;
  spd: number;
};

/**
 * 베이스 몬스터 + 층 + (옵션) 보스 배수 + (옵션) 주간 모디파이어 → 실제 전투 스탯.
 * 모디파이어 멀티플라이어 (enemyHpMult/AtkMult/DefMult/SpdMult) 가 마지막에 곱해진다.
 * SPD 는 층 스케일링은 없지만 모디파이어로는 변동 가능 (의도적으로 공개된 효과라 OK).
 */
export function scaledStats(
  base: Pick<Monster, "hp" | "atk" | "def" | "spd">,
  floor: number,
  bossMultiplier = 1,
  modifier?: TowerModifier,
): ScaledStats {
  const f = Math.max(1, floor);
  const m = bossMultiplier;
  const hpMult = modifier?.enemyHpMult ?? 1;
  const atkMult = modifier?.enemyAtkMult ?? 1;
  const defMult = modifier?.enemyDefMult ?? 1;
  const spdMult = modifier?.enemySpdMult ?? 1;
  return {
    hp: Math.max(1, Math.round(base.hp * m * Math.pow(f, TOWER_HP_EXP) * hpMult)),
    atk: Math.max(1, Math.round(base.atk * m * Math.pow(f, TOWER_ATK_EXP) * atkMult)),
    def: Math.max(0, Math.round(base.def * m * Math.pow(f, TOWER_DEF_EXP) * defMult)),
    spd: Math.max(1, Math.round(base.spd * spdMult)),
  };
}
