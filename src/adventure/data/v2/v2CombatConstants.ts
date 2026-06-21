// v2 전투 상수 — character/skills.ts 에서 v2 전투가 실제로 쓰는 스칼라만 이관(2026-06-04).
// v1 25스킬 카탈로그는 v2 전투에서 미사용(死) → skills.ts 는 Stage 4 에서 삭제 예정.
// 여기 값들은 skills.ts 에서 verbatim 복사 — 동작 불변(골든 마스터 가드).

// 기본 명중 — 평타는 기본 90% 적중(= 10% 빗나감). 명중(accuracyPct)이 빗나감을 줄이고(상한 100%
//   적중 = 빗나감 0 도달 가능), 적 회피가 늘린다. 하한(빗나감 상한) 없음 — 고회피(PvP)는 그대로
//   유효(강제 회피 보존). 스킬 패치로 캐릭터 강해진 만큼 모드한 파워 다운 + 죽어있던 명중/DEX 축
//   부활(2026-06-06). 두 엔진은 combatShared 재노출로, UI(StatsPanel)는 여기서 직접 읽는다.
export const V2_BASE_MISS_PCT = 10;

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
export const BLEED_ATK_COEF_PER_STACK = 0.08;
export const POISON_PCT_PER_POINT = 0.0004;
// 절초 — 누적 적중 N타째마다 마무리 강타. 구조적 주기(위력은 데이터 comboFinisherBonusPct).
// engine.ts 에서 이관(2026-06-12).
export const COMBO_FINISHER_PERIOD = 4;
export const POISON_CAP_ATK_COEF = 0.6;
export const HEAVEN_DECREE_HP_PCT = 5;
export const RAMPAGE_START_TURN = 3;
export const ANALYSIS_PENALTY_CAP_PCT = 0.3;
export const GALE_CHAIN_MAX_PER_TURN = 3;
export const LUCKY_STAR_DAMAGE_MULT = 2;
export const IMPACT_WAVE_INTERVAL = 3;
export const ETERNAL_GALE_ABSOLUTE_CAP = 30;
