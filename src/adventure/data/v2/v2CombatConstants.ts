// v2 전투 상수 — character/skills.ts 에서 v2 전투가 실제로 쓰는 스칼라만 이관(2026-06-04).
// v1 25스킬 카탈로그는 v2 전투에서 미사용(死) → skills.ts 는 Stage 4 에서 삭제 예정.
// 여기 값들은 skills.ts 에서 verbatim 복사 — 동작 불변(골든 마스터 가드).

// 기본 명중 — 평타는 기본 90% 적중(= 10% 빗나감). 명중(accuracyPct)이 빗나감을 줄이고(상한 100%
//   적중 = 빗나감 0 도달 가능), 적 회피가 늘린다. 하한(빗나감 상한) 없음 — 고회피(PvP)는 그대로
//   유효(강제 회피 보존). 스킬 패치로 캐릭터 강해진 만큼 모드한 파워 다운 + 죽어있던 명중/DEX 축
//   부활(2026-06-06). 두 엔진은 combatShared 재노출로, UI(StatsPanel)는 여기서 직접 읽는다.
export const V2_BASE_MISS_PCT = 10;

export const POWER_ATTACK_TURN_INTERVAL = 3;
export const CRIT_MULT_BASE = 2.0;
export const BLEED_MAX_STACKS = 10;
export const POISON_MAX_STACKS = 10;
// 약점 노출(마도사) 마법취약 / 주문 중첩(워메이지) 누적 상한 — 무한 인플레 방지. PvE/PvP 공용.
export const MAGIC_VULN_STACK_CAP = 10;
export const SPELL_STACK_CAP = 10;
export const BLEED_ATK_COEF_PER_STACK = 0.08;
export const POISON_PCT_PER_POINT = 0.0004;
export const POISON_CAP_ATK_COEF = 0.6;
export const HEAVEN_DECREE_HP_PCT = 5;
export const RAMPAGE_START_TURN = 3;
export const ANALYSIS_PENALTY_CAP_PCT = 0.3;
export const GALE_CHAIN_MAX_PER_TURN = 3;
export const LUCKY_STAR_DAMAGE_MULT = 2;
export const IMPACT_WAVE_INTERVAL = 3;
export const ETERNAL_GALE_ABSOLUTE_CAP = 30;

// 자연 회복 — 매 BASELINE_REGEN_INTERVAL 플레이어 턴 종료 시 HP +max(1, floor(maxHp × pct)).
export const BASELINE_REGEN_INTERVAL = 5;
export const BASELINE_REGEN_HP_PCT = 0.02;

export function baselineRegenFor(maxHp: number): {
  interval: number;
  amount: number;
} {
  return {
    interval: BASELINE_REGEN_INTERVAL,
    amount: Math.max(1, Math.floor(maxHp * BASELINE_REGEN_HP_PCT)),
  };
}
