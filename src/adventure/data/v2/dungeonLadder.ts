// v2 사냥터 사다리 제너레이터. 설계: docs/v2-prestige-reincarnation-plan.md §5·§5.1.
//
// 환생 루프 콘텐츠 = 무한 확장 사냥터. 손으로 깔면 "exp 높은데 쉬운" 칸이 생겨 스킵·폭주
// (페이싱 붕괴)하므로, 깊은 산(floor 2, 권장 파워 110)을 앵커로 **공식에서 자동 산출**한다.
//
// 페이싱(§5.1): K(사냥터당 루프)=2 → 게이트 간격 40(power/루프 ~20 가정). 루프 시간은
//   프론티어(최상위) 기준 ~5일, 저티어는 더뎌도 OK. exp 곡선 = 램프(볼록) 후 플래토
//   (프론티어 5일 수렴·분단위 붕괴 방지). 몹 스탯은 hp/atk 선형·def 댐핑(관통 0 절벽 회피).
//
// ⚠️ 계수(STEP·DEF_DAMP·EXP_EXP·EXP_PLATEAU)는 전부 임시 — sim-v2-exp-pacing /
//   sim-v2-progression 으로 "프론티어 = 5일" 역산해 캘리브할 대상.

import type { DungeonFloorId } from "./types";

const FLOOR1_POWER = 50; // 들판 — authored
export const LADDER_ANCHOR_FLOOR = 2; // 깊은 산 = 앵커
export const LADDER_ANCHOR_POWER = 110; // 깊은 산 권장 파워
export const LADDER_POWER_STEP = 40; // K=2 × power/루프 ~20 (게이트 간격)

// 권장 파워 게이트. floor 1·2 = 기존 authored, 3+ = 앵커 + (floor−2)×step 선형.
// (power 가 cumLevel 선형이라 선형 간격 = 일정 K/사냥터.)
export function floorPowerGate(floor: DungeonFloorId): number {
  if (floor <= 1) return FLOOR1_POWER;
  if (floor === LADDER_ANCHOR_FLOOR) return LADDER_ANCHOR_POWER;
  return (
    LADDER_ANCHOR_POWER + (floor - LADDER_ANCHOR_FLOOR) * LADDER_POWER_STEP
  );
}

// 스탯 배율 — 깊은 산 앵커 대비. floor 1·2 = ×1.0(authored 몹 그대로). 3+ = gate/anchor.
// hp·atk 에 선형 적용.
export function floorStatMult(floor: DungeonFloorId): number {
  if (floor <= LADDER_ANCHOR_FLOOR) return 1;
  return floorPowerGate(floor) / LADDER_ANCHOR_POWER;
}

// def 댐핑 — v2 는 관통 0 이라 def 가 hp/atk 따라 선형 오르면 데미지 절벽(floor-5 사고 교훈).
// 지수 < 1 로 def 가 더 천천히 오르게 → 플레이어 atk 가 항상 뚫는다.
export const LADDER_DEF_DAMP = 0.6;
export function floorDefMult(floor: DungeonFloorId): number {
  if (floor <= LADDER_ANCHOR_FLOOR) return 1;
  return Math.pow(floorStatMult(floor), LADDER_DEF_DAMP);
}

// exp 배율 — 램프(볼록) 후 플래토. 저티어 낮음(느림) → 상위로 갈수록 가속 → 상단 캡에서
// 수렴(프론티어 ~5일, 분단위 붕괴 방지). floor 1·2 = ×1.0.
export const LADDER_EXP_EXP = 2.0; // 볼록 지수
export const LADDER_EXP_PLATEAU = 10; // 상단 캡(프론티어 cadence 고정)
export function floorExpMult(floor: DungeonFloorId): number {
  if (floor <= LADDER_ANCHOR_FLOOR) return 1;
  return Math.min(
    Math.pow(floorStatMult(floor), LADDER_EXP_EXP),
    LADDER_EXP_PLATEAU,
  );
}
