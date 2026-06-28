// v2 전투 상수 — character/skills.ts 에서 v2 전투가 실제로 쓰는 스칼라만 이관(2026-06-04).
// v1 25스킬 카탈로그는 v2 전투에서 미사용(死) → skills.ts 는 Stage 4 에서 삭제 예정.
// 여기 값들은 skills.ts 에서 verbatim 복사 — 동작 불변(골든 마스터 가드).

// 기본 명중 — 평타는 기본 90% 적중(= 10% 빗나감). 명중(accuracyPct)이 빗나감을 줄이고(상한 100%
//   적중 = 빗나감 0 도달 가능), 적 회피가 늘린다. 하한(빗나감 상한) 없음 — 고회피(PvP)는 그대로
//   유효(강제 회피 보존). 스킬 패치로 캐릭터 강해진 만큼 모드한 파워 다운 + 죽어있던 명중/DEX 축
//   부활(2026-06-06). 두 엔진은 combatShared 재노출로, UI(StatsPanel)는 여기서 직접 읽는다.
export const V2_BASE_MISS_PCT = 10;

// 회피 대결형(2026-06-21) — 절대%+하드캡(75) 폐기. 방어자 evaRating(캡 없는 raw)을 공격자
//   명중레이팅과 비율로 겨뤄 회피확률 산출. 점근선(절대 도달X)이라 포화·DEX 더블딥(공짜 4× EHP) 해소.
//   회피확률 = DODGE_MAX × evaR / (evaR + accR × DODGE_K). 파리티(균등) = DODGE_MAX/(1+K) ≈ 8%.
//   Slice 1 = PvE 몹→플레이어(enemyPhase·몹명중=floorAccuracy+몹 accuracy). Slice 2(2026-06-22) =
//   플레이어→몹·PvP 양방향 대칭(attackMissPct). docs/v2-evasion-rating-plan.md.
export const DODGE_MAX = 75; // 소프트 점근 천장(제거 금지 = 무적 꼬리)
export const DODGE_K = 8; // 명중이 회피 누르는 강도(클수록 회피↓)
export function dodgeChance(evaRating: number, accRating: number): number {
  const e = Math.max(0, evaRating);
  if (e <= 0) return 0;
  return (DODGE_MAX * e) / (e + Math.max(0, accRating) * DODGE_K);
}

// 공격 미스 확률(Slice 2) — 플레이어→몹·PvP 평타/스킬 4 호출처 공용. 두 항의 합:
//   ① 베이스미스 = max(0, V2_BASE_MISS_PCT − 명중레이팅) — 옛 모델(10+−명중)의 베이스 부분 보존.
//      명중 투자가 베이스를 깎아 0 까지(투자/엔드 빌드는 일반몹 미스 0% — 옛 느낌 유지·필드 무회귀).
//   ② 회피 대결 = dodgeChance(회피레이팅, 명중레이팅) — 회피몹/PvP 무적탱을 점근선 DODGE_MAX 로 완화.
//   방어자 evaRating 0(일반몹)이면 ②=0 → 미스=①(투자 0 이면 10%·투자하면 ↓). 명중레이팅은 derive 가
//   ACC_BASE_RATING 을 포함해 ② 의 퇴화(acc0→75%)를 막는다. apIgnoresEvasion 은 호출처에서 굴림 스킵.
//   🔑 2026-06-22 정정: 순수 플랫(명중 불가감) B안은 엔드 빌드(옛 명중→미스 0%)를 ~10% 너프해 필드
//   승률 −6~19pp·DEX 상대독주 악화(sim) → 명중이 베이스도 깎도록 환원(현 느낌·DEX아크 보존).
export function attackMissPct(defenderEvaRating: number, attackerAccRating: number): number {
  return (
    Math.max(0, V2_BASE_MISS_PCT - Math.max(0, attackerAccRating)) +
    dodgeChance(defenderEvaRating, attackerAccRating)
  );
}

export const POWER_ATTACK_TURN_INTERVAL = 3;
// 치명타 기본 배수 — 모든 크리가 받는 바닥값. 2.0→1.4 하향(2026-06-08): ×2 base 는 무투자
//   크리도 이미 큰 한방이라 크리가 지배적·스윙적(자동전투 원샷 압박)이었다. 1.4 로 낮춰 "무투자
//   크리=스파이크, 큰 크리=LUK 투자 보상"으로 교정. LUK 보전 위해 CRIT_DMG_PER_LUK 0.006→0.007
//   동반(derivePlayerCombatV2). (2026-06-21 PR-2: critMult 하드캡 5.0 폐기 → 점감 곡선 critMultCurve.)
export const CRIT_MULT_BASE = 1.4;
// 스킬(액티브) 치명타 배수 — 평타와 같은 크리 확률(min(critChancePct, CRIT_PCT_CAP))을 공유하되,
// 곱해지는 배수는 평타 critMult(점감 곡선 1.4~2.6×)와 분리한 별도 고정 다이얼. 스킬은 계수·발동이 평타보다
// 커서 평타 배수를 그대로 곱하면 폭주 → flat 으로 캡. 오버플로(캡
// 초과분 크리뎀)도 스킬엔 미적용(평타 전용) → 크리캡 75% 에 묶여 최대 스킬딜 +37.5% 로 상한.
// sim-v2-progression --skills 실측(2026-06-08, s=1.5): 현실 레벨대 스킬 의존 빌드 처치턴 −5~14%,
// 평타·다중공격 척추(LUK) 빌드 −1%(무영향)로 격차 압축. 약하면 1.75 까지 상향 여지(라이브 재캘리브).
export const SKILL_CRIT_MULT = 1.5;
export const BLEED_MAX_STACKS = 10;
export const POISON_MAX_STACKS = 10;
// 약점 노출(마도사) 마법취약 / 주문 중첩(워메이지) 누적 상한 — 무한 인플레 방지. PvE/PvP 공용.
export const MAGIC_VULN_STACK_CAP = 10;
export const SPELL_STACK_CAP = 10;
export const BLEED_ATK_COEF_PER_STACK = 0.12;
export const POISON_PCT_PER_POINT = 0.0005;
// 절초 — 누적 적중 N타째마다 마무리 강타. 구조적 주기(위력은 데이터 comboFinisherBonusPct).
// engine.ts 에서 이관(2026-06-12).
export const COMBO_FINISHER_PERIOD = 4;
export const POISON_CAP_ATK_COEF = 0.9;
export const HEAVEN_DECREE_HP_PCT = 5;
export const RAMPAGE_START_TURN = 3;
export const ANALYSIS_PENALTY_CAP_PCT = 0.3;
export const GALE_CHAIN_MAX_PER_TURN = 3;
export const LUCKY_STAR_DAMAGE_MULT = 2;
export const IMPACT_WAVE_INTERVAL = 3;
export const ETERNAL_GALE_ABSOLUTE_CAP = 30;
