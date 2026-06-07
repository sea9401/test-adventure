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
//
// 단일 무한 프론티어 모델 + 테마당 6깊이(THEME_DEPTH_SPAN): 깊이 1~6=들판(온보딩)·
//   7~12=깊은 산·13+=프론티어 밴드. depth 는 number 무한 — 함수가 임의 깊이를 산출(캡 없음).
//
// ⚠️ 들판 평탄화(2026-06-07): 들판이 깊이 1~6 전체인데 사다리 앵커는 깊이 2라, 평탄화 전엔
//   같은 들판 몹이 깊이 3~6 에서 ×1.36~×2.45 로 부풀어 "들판인데 27턴" 이 됐다. 설계 기준
//   "스타터(T1 상점 장비)로 들판 6까지 무난히 클리어" 에 맞춰 들판 구간만 ×1.0→×1.3 완만
//   램프로 고정. 실제 난이도 램프는 깊은 산(깊이 7)부터 — 깊이 7+ 스탯/def/exp/게이트는 전부
//   불변(프론티어 exp 페이싱·밴드 베이스 캘리브 보존).

const FLOOR1_POWER = 50; // 들판(깊이 1) — authored
export const LADDER_ANCHOR_DEPTH = 2; // 깊이 7+ 램프의 기준 깊이(power 110 divisor 의 짝)
export const LADDER_ANCHOR_POWER = 110; // 앵커 권장 파워 — 깊이 7+ 스탯 배율 divisor
export const LADDER_POWER_STEP = 40; // K=2 × power/루프 ~20 (깊이당 간격)

// 들판 = 깊이 1~6 온보딩 평탄 구간. 같은 들판 몹이라 깊이마다 부풀지 않게 완만하게만.
const ONBOARDING_END_DEPTH = 6;
const ONBOARDING_MAX_POWER = 95; // 들판 6 권장 파워(완만 — 표시 일관성)
export const ONBOARDING_MAX_STAT_MULT = 1.3; // 들판 6 스탯 배율 상한(깊이 1 대비)

// 들판 진행도 0..1 — 깊이 1→6 선형.
function onboardingT(depth: number): number {
  return (Math.max(1, depth) - 1) / (ONBOARDING_END_DEPTH - 1);
}

// 권장 파워 게이트(표시 전용 — 실제 진입 게이트는 frontierDepth). 들판(1~6)=50→95 완만,
// 7+ = 앵커 + (depth−2)×step 선형(무한).
export function floorPowerGate(depth: number): number {
  if (depth <= 1) return FLOOR1_POWER;
  if (depth <= ONBOARDING_END_DEPTH) {
    return Math.round(
      FLOOR1_POWER + onboardingT(depth) * (ONBOARDING_MAX_POWER - FLOOR1_POWER),
    );
  }
  return LADDER_ANCHOR_POWER + (depth - LADDER_ANCHOR_DEPTH) * LADDER_POWER_STEP;
}

// 스탯 배율(hp·atk). 들판(1~6) = ×1.0→×1.3 완만, 7+ = gate/앵커(불변). 무한 깊이.
export function floorStatMult(depth: number): number {
  if (depth <= 1) return 1;
  if (depth <= ONBOARDING_END_DEPTH) {
    return 1 + onboardingT(depth) * (ONBOARDING_MAX_STAT_MULT - 1);
  }
  return floorPowerGate(depth) / LADDER_ANCHOR_POWER;
}

// def 댐핑 — v2 는 관통 0 이라 def 가 hp/atk 따라 선형 오르면 데미지 절벽(floor-5 사고 교훈).
// 지수 < 1 로 def 가 더 천천히 오르게 → 플레이어 atk 가 항상 뚫는다. statMult 에서 파생.
export const LADDER_DEF_DAMP = 0.6;
export function floorDefMult(depth: number): number {
  if (depth <= 1) return 1;
  return Math.pow(floorStatMult(depth), LADDER_DEF_DAMP);
}

// exp 배율 — 램프(볼록) 후 플래토. 들판(1~6)은 난이도 따라 완만(낮음), 깊을수록 가속 →
// 상단 캡에서 수렴(프론티어 ~5일, 분단위 붕괴 방지). statMult 에서 파생.
export const LADDER_EXP_EXP = 2.0; // 볼록 지수
// 상단 캡(프론티어 cadence 고정). sim-v2-exp-pacing 캘리브(2026-06-05): 10→13 = 프론티어
// (플래토, 깊이 10+) 루프 ~5.1일(현 XP_RATE 4 유지). loop일수 ∝ 1/캡.
export const LADDER_EXP_PLATEAU = 13;
export function floorExpMult(depth: number): number {
  if (depth <= 1) return 1;
  return Math.min(
    Math.pow(floorStatMult(depth), LADDER_EXP_EXP),
    LADDER_EXP_PLATEAU,
  );
}
