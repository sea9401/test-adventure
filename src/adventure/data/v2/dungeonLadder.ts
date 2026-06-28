// v2 사냥터 사다리 제너레이터. 설계: docs/v2-prestige-reincarnation-plan.md §5·§5.1.
//
// 환생 루프 콘텐츠 = 무한 확장 사냥터. 손으로 깔면 "exp 높은데 쉬운" 칸이 생겨 스킵·폭주
// (페이싱 붕괴)하므로, 들판 끝(깊이 6·권장 파워 95)을 기점으로 **공식에서 자동 산출**한다.
//
// 페이싱(§5.1): K(사냥터당 루프)=2 → 게이트 간격 40(power/루프 ~20 가정). 루프 시간은
//   프론티어(최상위) 기준 ~5일, 저티어는 더뎌도 OK. exp 곡선 = 램프(볼록) 후 소프트캡에서
//   선형 우상향(깊을수록 보상↑·분단위 붕괴 방지). 몹 스탯은 hp/atk 선형·def 댐핑(관통 0 절벽 회피).
//
// ⚠️ 계수(STEP·DEF_DAMP·EXP_EXP·EXP_SOFTCAP·EXP_POST_SLOPE)는 전부 임시 — sim-v2-exp-pacing /
//   sim-v2-progression 으로 "프론티어 = 5일" 역산해 캘리브할 대상.
//
// 단일 무한 프론티어 모델 + 테마당 6깊이(THEME_DEPTH_SPAN): 깊이 1~6=들판(온보딩)·
//   7+=프론티어 밴드(마른 협곡부터). depth 는 number 무한 — 함수가 임의 깊이를 산출(캡 없음).
//
// ⚠️ 전곡선 평탄화(2026-06-07): 옛 모델은 들판(1~6)만 ×1.0→×1.3 완만이고 깊이 7부터 앵커
//   사다리(110+(d−2)×40)로 점프해, 들판6→깊이7 경계에서 statMult 1.3→2.82·exp 1.69→7.94
//   (×4.7) 절벽이 났다("경험치 차이 너무 큼"). 들판 끝(1.3)에서 깊이당 +LADDER_STAT_STEP 단일
//   램프로 통합 — 들판~프론티어 전 구간 곡선·exp 가 절벽 없이 매끄럽게 이어진다. exp 소프트캡
//   (LADDER_EXP_SOFTCAP)까지 cadence 보존 — 단 그 이후는 평평(plateau)이 아니라 깊이 따라
//   계속 우상향한다(2026-06-09, "깊을수록 보상↑". floorExpMult 참고).

const FLOOR1_POWER = 50; // 들판(깊이 1) — authored

// 들판 = 깊이 1~6 온보딩 평탄 구간. 같은 들판 몹이라 깊이마다 부풀지 않게 완만하게만.
const ONBOARDING_END_DEPTH = 6;
const ONBOARDING_MAX_POWER = 95; // 들판 6 권장 파워(완만 — 표시 일관성)
export const ONBOARDING_MAX_STAT_MULT = 1.3; // 들판 6 스탯 배율 상한(깊이 1 대비)

// 깊이 7+ 램프 — 들판 끝(statMult 1.3·power 95)에서 이어지는 단일 완만 선형(2026-06-07 전곡선
//   평탄화). 옛 앵커 점프(깊이7 statMult 1.3→2.82·exp 1.69→7.94 절벽) 제거 → 들판~프론티어
//   전 구간 곡선·exp 가 매끄럽게 이어진다. statMult 가 1차 동인, powerGate(=권장파워, 매칭레벨)는
//   비례 파생(난이도 ↔ 레벨 균형 유지). def/exp 도 statMult 파생. exp 는 소프트캡까지 동일
//   cadence·이후 깊이 따라 우상향(깊을수록 보상↑). ← 튜닝 다이얼.
// 2026-06-19: 0.6→0.52 완화 — 장비 정리(무기 ×0.8·종류 통합)로 낮아진 유저 전투력에 맞춰
//   사냥터 난이도 곡선 하향(중간 완화·깊을수록 완화폭↑: d12 -10%·d24 -12%). 들판(1~6)은 불변.
export const LADDER_STAT_STEP = 0.52; // 깊이당 statMult 증가(들판 0.06 대비 완만 램프)

// 엔드 확장 램프(43+) — 1~42 는 기존 곡선을 유지하고, 새 사냥터부터 권장 전투력을
// 1500 전후로 끌어올린다. 기존 후반 평가는 "성장 대비 너무 쉬움"이라 43에서 의도적으로 한 번
// 단차를 만들고, 이후 깊이당 증가 폭도 기존 0.52보다 높게 둔다.
export const END_EXTENSION_START_DEPTH = 43;
export const END_EXTENSION_START_STAT_MULT = 30;
export const END_EXTENSION_STAT_STEP = 1.0;

// 엔드게임 난이도 완화(2026-06-18, 밸런스) — 깊을수록 몬스터 hp+atk 을 점감(scaleMonsterForFloor
// 에서 sMult 에 곱). 🔑 floorPowerGate(권장파워/레벨)에는 안 들어가 진척·exp 곡선과 **분리** —
// "권장 레벨로 맞춘 빌드"가 엔드에서 DEX 외엔 다 못 깨던 문제(sim: d50 STR51·INT33·VIT0·DEX100)를,
// DEX(캡 100)는 그대로 두고 floor 빌드를 끌어올리는 단일 레버. d20 까지 1.0(무변), 이후 점감해
// d50≈0.85 에서 plateau(최대 15% 완화). sim 캘리브: STR51→90·INT33→75·LUK/BAL~40·DEX 100 유지.
// ⚠️ 부작용=엔드 절대 난이도 소폭↓(의도). 다이얼=아래 3상수.
export const ENDGAME_SOFTEN_START_DEPTH = 20; // 이 깊이까지 완화 0(중반 균형 유지)
export const ENDGAME_SOFTEN_SLOPE = 0.005; // 깊이당 완화량
export const ENDGAME_SOFTEN_MIN = 0.85; // 완화 하한(=최대 15% 약화·deep frontier plateau)
export function endgameSoften(depth: number): number {
  if (depth <= ENDGAME_SOFTEN_START_DEPTH) return 1;
  return Math.max(
    ENDGAME_SOFTEN_MIN,
    1 - (depth - ENDGAME_SOFTEN_START_DEPTH) * ENDGAME_SOFTEN_SLOPE,
  );
}

// 프론티어 진입 완화(2026-06-22, 밸런스) — 들판(d1~6, statMult step 0.06)→마른협곡(d7~, step 0.52)
//   경계의 난이도 절벽 완화. sim(권장레벨 기준 풀승률): 들판 d5~6=100% → 마른협곡 d7~9=80%(전 직군
//   동반 하락) → d10 회복. 첫 프론티어 step 이 온보딩 step 의 ~8배라 경계 한 칸이 갑자기 단단함.
//   🔑 endgameSoften 과 동일 패턴 = 몹 hp+atk 레이어에만(scaleMonsterForFloor), floorPowerGate/exp 미접촉.
//   floorStatMult 직접 완화는 게이트→권장레벨이 같이 내려가 sim 자기정규화로 무효(#826 교훈)이므로 몹
//   레이어 단독 완화로 진입장벽만 낮춘다. d7 최대완화 → d12 에서 1.0 복귀(경계만·중심층 불변). 들판 불변.
//   다이얼 2상수. coop(softenEndgame=false)은 제외(앵커 d12·완화 이미 0).
// 딥 코어(d7~9)는 풀 완화(MIN), 이후 d10~11 선형 페이드 → d12 에서 1.0. 절벽이 d7~9 균일 80%
//   (sim)이라 페이드형은 d9(딥 최저)에 완화가 가장 약하게 닿아 비효율 → 코어 평탄이 맞다.
export const FRONTIER_ONSET_FULL_DEPTH = 9; // d7~9 = 풀 완화(절벽 코어)
export const FRONTIER_ONSET_END_DEPTH = 12; // 이 깊이에서 완화 0 복귀(경계 한정)
export const FRONTIER_ONSET_MIN = 0.85; // d7~9 완화 하한(최대 15% 약화 — 풀승률 ~90% 완만 밸리 목표)
export function frontierOnsetSoften(depth: number): number {
  if (depth <= ONBOARDING_END_DEPTH || depth >= FRONTIER_ONSET_END_DEPTH) return 1;
  if (depth <= FRONTIER_ONSET_FULL_DEPTH) return FRONTIER_ONSET_MIN;
  // d10, d11 → 1.0 으로 선형 페이드(d10 회복 구간이라 빠르게 거둠).
  const span = FRONTIER_ONSET_END_DEPTH - FRONTIER_ONSET_FULL_DEPTH; // 12 − 9 = 3
  const t = (depth - FRONTIER_ONSET_FULL_DEPTH) / span; // d10:1/3 → d11:2/3
  return FRONTIER_ONSET_MIN + (1 - FRONTIER_ONSET_MIN) * t;
}

// 크리 HP 상쇄(2026-06-21 PR-2) — 크리 배율 점감 곡선(derivePlayerCombatV2.critMultCurve)이 엔드
//   크리 딜을 ~40% 줄여 권장레벨 빌드가 깊은 사냥터를 못 깨게 됨. 크리 압축은 고스탯(=깊이)일수록
//   커서, 몹 HP 를 깊이 비례로 상쇄한다(HP 만 — atk/def/exp/권장파워 무관, 들판 1~6 불변). endgameSoften
//   과 별개 레버(저건 floor 빌드 생존, 이건 크리딜 손실 보전). sim 캘리브: d10~0.96·d20~0.87·d50~0.66
//   로 PR-1(VIT/INT 부양) win-rate 프로파일 복원. docs/v2-dex-rebalance-plan.md. ⚠️ 크리 곡선과 짝 다이얼.
export const CRIT_HP_COMP_SLOPE = 0.0095; // 깊이당 HP 감소량
export const CRIT_HP_COMP_MIN = 0.66; // 하한(deep frontier plateau)
export function floorCritHpComp(depth: number): number {
  if (depth <= ONBOARDING_END_DEPTH) return 1;
  return Math.max(
    CRIT_HP_COMP_MIN,
    1 - (depth - ONBOARDING_END_DEPTH) * CRIT_HP_COMP_SLOPE,
  );
}

// 회피 대결형(2026-06-21 Slice 1) — 몹 명중레이팅. 플레이어 evaRating 이 깊이 따라(dex/luk 성장)
//   커지는 만큼 몹 명중도 floorStatMult 로 키워, 회피%가 깊이 무관 일정(콘텐츠 자동 추종). enemyPhase
//   가 dodgeChance(evaR, 몹명중)에 씀. scaleMonsterForFloor 가 몹 accuracy 에 합산. docs/v2-evasion-rating-plan.md.
// 몹 명중 = MOB_ACC_BASE × floorStatMult(depth). win-rate 캘리브(2026-06-21): 회피%-only 캘리브 1.05는
//   필드 회귀(STR 94→73 — 회피 누르면 느린 빌드만 죽음), 0.3 이라야 PR-2 무회귀 + DEX dodge 75→56%(EHP ×4→×2.3).
export const MOB_ACC_BASE = 0.3;
export function floorAccuracy(depth: number): number {
  return MOB_ACC_BASE * floorStatMult(depth);
}
// 권장파워 = statMult^GATE_DAMP × 110. 옛 모델(statMult 선형 비례)은 후반에서 과대 —
// 플레이어 파워(누적레벨 floor 감쇠 + 밴드 장비 flat)는 깊이 statMult(선형)만큼 못 자라는데
// 전투 실효(크리·회피·spd·def 댐핑)는 파워 점수에 다 안 잡혀, 깊이 48 권장 2915 vs 실측
// 파워 ~1,370 빌드가 풀 승률 90%+ 라는 괴리가 났다(2026-06-11). def 댐핑과 같은 패턴으로
// 지수 감쇠 — sim-v2-power-gate(풀 승률 90% 달성 빌드의 파워 실측, 깊이 7~60 함의 지수
// 0.65~0.79·최소자승 0.768)로 캘리브. 게이트는 표시 전용(진입은 frontierDepth)이라 안전.
const POWER_PER_STAT = 110;
export const LADDER_GATE_DAMP = 0.77;

// 들판 진행도 0..1 — 깊이 1→6 선형.
function onboardingT(depth: number): number {
  return (Math.max(1, depth) - 1) / (ONBOARDING_END_DEPTH - 1);
}

// 스탯 배율(hp·atk). 들판(1~6)=×1.0→×1.3 완만, 7+=1.3 에서 깊이당 +STEP 단일 램프(무한·절벽 없음).
export function floorStatMult(depth: number): number {
  if (depth <= 1) return 1;
  if (depth <= ONBOARDING_END_DEPTH) {
    return 1 + onboardingT(depth) * (ONBOARDING_MAX_STAT_MULT - 1);
  }
  if (depth >= END_EXTENSION_START_DEPTH) {
    return (
      END_EXTENSION_START_STAT_MULT +
      (depth - END_EXTENSION_START_DEPTH) * END_EXTENSION_STAT_STEP
    );
  }
  return (
    ONBOARDING_MAX_STAT_MULT + (depth - ONBOARDING_END_DEPTH) * LADDER_STAT_STEP
  );
}

// 권장 파워 게이트(표시 전용 — 실제 진입 게이트는 frontierDepth). 들판(1~6)=50→95 완만,
// 7+ = statMult 비례(난이도=레벨 균형). 무한 깊이.
export function floorPowerGate(depth: number): number {
  if (depth <= 1) return FLOOR1_POWER;
  if (depth <= ONBOARDING_END_DEPTH) {
    return Math.round(
      FLOOR1_POWER + onboardingT(depth) * (ONBOARDING_MAX_POWER - FLOOR1_POWER),
    );
  }
  return Math.round(
    Math.pow(floorStatMult(depth), LADDER_GATE_DAMP) * POWER_PER_STAT,
  );
}

// def 댐핑 — v2 는 관통 0 이라 def 가 hp/atk 따라 선형 오르면 데미지 절벽(floor-5 사고 교훈).
// 지수 < 1 로 def 가 더 천천히 오르게 → 플레이어 atk 가 항상 뚫는다. statMult 에서 파생.
export const LADDER_DEF_DAMP = 0.6;
export function floorDefMult(depth: number): number {
  if (depth <= 1) return 1;
  return Math.pow(floorStatMult(depth), LADDER_DEF_DAMP);
}

// exp 배율 — 초반 볼록 램프 후 소프트캡에서 선형 우상향(평평 아님). 들판(1~6)은 완만(낮음),
// 깊을수록 가속해 소프트캡 도달 후엔 깊이 따라 계속 오른다(깊을수록 보상↑). statMult 에서 파생.
export const LADDER_EXP_EXP = 2.0; // 볼록 지수 (초반 램프)
// 소프트캡 — 볼록 램프(들판→깊이~10)가 여기서 "선형 우상향"으로 꺾인다. 옛날엔 여기서 평평하게
// 캡(plateau)이라 밴드 A~F 보상이 전부 같았다(깊이=보상 동기 없음·깊을수록 시간당 보상↓).
// 2026-06-09: 캡 대신, 소프트캡 이후 깊이 따라 계속 오르게 해 "깊을수록 보상↑"(난이도 비례).
// 소프트캡 값 13 유지 → 거기까지 cadence 동일(sim-v2-exp-pacing 캘리브 보존). 이후 기울기=POST_SLOPE.
export const LADDER_EXP_SOFTCAP = 13;
// 소프트캡 이후 statMult 1 증가당 추가되는 exp 배율(선형, 상한 없음). statMult 는 깊이당 +0.6(STEP)
// 이라 깊이당 ≈ +(POST_SLOPE×0.6) exp배율. 0 이면 옛 플래토(평평)와 동일, 키우면 깊이 보상 가팔라짐.
// gold = 몹 exp×4 라 이 다이얼이 깊이별 골드 곡선도 함께 결정. ⚠️프론티어 cadence 다이얼 — 라이브/sim 재캘리브.
export const LADDER_EXP_POST_SLOPE = 1.0;
// 리자드 늪지(31+)부터 EXP/골드 증가폭을 낮춘다. gold 는 monster.exp 기반이라 이 곡선이 골드도
// 함께 누른다. 난이도는 43+에서 크게 올리되 보상은 별도 완만 램프로 분리해 무한 인플레를 막는다.
// 당분간 엔드 보상 배율은 30 을 넘기지 않는다. 이 상한을 올릴 때는 신규 사냥터 보상 페이싱을
// 별도로 다시 캘리브해야 한다.
export const REWARD_SLOWDOWN_START_DEPTH = 31;
export const REWARD_SLOWDOWN_ANCHOR_DEPTH = REWARD_SLOWDOWN_START_DEPTH - 1;
export const REWARD_SLOWDOWN_EXP_STEP = 0.15;
export const REWARD_EXP_MULT_CAP = 30;
export function floorExpMult(depth: number): number {
  if (depth <= 1) return 1;
  if (depth >= REWARD_SLOWDOWN_START_DEPTH) {
    return Math.min(
      REWARD_EXP_MULT_CAP,
      floorExpMult(REWARD_SLOWDOWN_ANCHOR_DEPTH) +
        (depth - REWARD_SLOWDOWN_ANCHOR_DEPTH) * REWARD_SLOWDOWN_EXP_STEP,
    );
  }
  const sMult = floorStatMult(depth);
  const convex = Math.pow(sMult, LADDER_EXP_EXP);
  if (convex <= LADDER_EXP_SOFTCAP) return convex; // 소프트캡 전 — 기존과 동일(byte-exact)
  // 소프트캡 이후 — statMult 에 선형 비례해 계속 우상향(평평하지 않음).
  const sMultAtCap = Math.pow(LADDER_EXP_SOFTCAP, 1 / LADDER_EXP_EXP); // √13 ≈ 3.606
  return LADDER_EXP_SOFTCAP + (sMult - sMultAtCap) * LADDER_EXP_POST_SLOPE;
}
