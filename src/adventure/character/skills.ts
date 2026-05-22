import { STAT_KEYS, type StatKey } from "@/adventure/data/stats";
import type { Skill } from "./types";

// 기본 일반 스킬 슬롯 수 (해금 전). 동적 슬롯 수는 skillLayout() 참조.
export const SKILL_SLOT_COUNT = 3;
export const BASE_NORMAL_SLOTS = SKILL_SLOT_COUNT;

// ── 스킬 슬롯 해금 ───────────────────────────────────────────────────────
// 4번째 = 특기 전용 슬롯 (Lv40 또는 운봉의 거인 처치 — 먼저 만족 시).
// 5번째 = 일반 슬롯 (Lv65 그리고 화산의 심장 처치 — 둘 다).
// 6번째 = 일반 슬롯 (Lv90 그리고 만렙 컨텐츠 최종 보스 처치 — 둘 다).
// 7번째 = 두 번째 특기 슬롯 (Lv90 그리고 만렙 컨텐츠 최종 보스 처치 — 6번째 일반과 동일).
//         두 특기를 동시 장착해 빌드 다양성 강화. FLAG 는 PR-E 신규 보스 추가 시 셋.
// "처치" 플래그(*_defeated) 는 협동 보스의 경우 킬샷 친 1명 + silver+ 기여자 전원에게
// 서버가 부여한다 (src/lib/server/coop/attack.ts) — 킬샷 운에 좌우되지 않게.
export const SKILL_SLOT_UNLOCK = {
  FEAT_SLOT_LEVEL: 40,
  FEAT_SLOT_FLAG: "peak_giant_defeated",
  FIFTH_NORMAL_LEVEL: 65,
  FIFTH_NORMAL_FLAG: "volcano_heart_defeated",
  SIXTH_NORMAL_LEVEL: 90,
  SIXTH_NORMAL_FLAG: "endgame_apex_defeated",
  SECOND_FEAT_LEVEL: 90,
  SECOND_FEAT_FLAG: "endgame_apex_defeated",
} as const;

export type SkillSlotContext = {
  level: number;
  hasFlag: (id: string) => boolean;
};
export type SkillLayout = {
  /** 일반 스킬 슬롯 수 (3, 4, 또는 5). */
  normalSlots: number;
  /** 특기 전용 슬롯 수 (0, 1, 또는 2). 1: 첫 번째 슬롯만 / 2: 두 번째까지 해금. */
  featSlots: number;
};

export function skillLayout(ctx: SkillSlotContext): SkillLayout {
  const fifthNormal =
    ctx.level >= SKILL_SLOT_UNLOCK.FIFTH_NORMAL_LEVEL &&
    ctx.hasFlag(SKILL_SLOT_UNLOCK.FIFTH_NORMAL_FLAG);
  // 6번째는 5번째 해금이 선행되어야 — normalSlots 가 단조 증가하도록.
  const sixthNormal =
    fifthNormal &&
    ctx.level >= SKILL_SLOT_UNLOCK.SIXTH_NORMAL_LEVEL &&
    ctx.hasFlag(SKILL_SLOT_UNLOCK.SIXTH_NORMAL_FLAG);
  const firstFeat =
    ctx.level >= SKILL_SLOT_UNLOCK.FEAT_SLOT_LEVEL ||
    ctx.hasFlag(SKILL_SLOT_UNLOCK.FEAT_SLOT_FLAG);
  // 두 번째 특기는 첫 번째 해금이 선행되어야 — featSlots 도 단조 증가.
  const secondFeat =
    firstFeat &&
    ctx.level >= SKILL_SLOT_UNLOCK.SECOND_FEAT_LEVEL &&
    ctx.hasFlag(SKILL_SLOT_UNLOCK.SECOND_FEAT_FLAG);
  return {
    normalSlots: BASE_NORMAL_SLOTS + (fifthNormal ? 1 : 0) + (sixthNormal ? 1 : 0),
    featSlots: (firstFeat ? 1 : 0) + (secondFeat ? 1 : 0),
  };
}

// 스킬 이름 상수 — UI/엔진에서 모두 같은 키 사용.
export const SKILL_NAMES = {
  POWER_ATTACK: "강공격",
  CRUSH: "분쇄",
  EVADE: "회피 강화",
  COUNTER: "반격",
  GUARD: "가드",
  REGEN: "재생",
  DOUBLE_STRIKE: "연타",
  VANGUARD: "기습",
  CRIT: "크리티컬",
  DOUBLE_LUCK: "이중 행운",
  EXECUTION: "처형",
  PRECISION: "정확",
  ENDURANCE: "불굴",
  LIGHTSPEED: "광속",
  BLOOM: "만개",
  // 4티어 (각 스탯 50 도달).
  BLOODLET: "출혈",
  SHADOW_CLONE: "그림자 분신",
  BULWARK: "철벽",
  FLURRY: "무피해 난무",
  HEAVEN_DECREE: "천명",
  // 5티어 (각 스탯 65 도달) — 만렙 확장 패키지.
  RAMPAGE: "막다른 격노",
  ANALYSIS: "약점 분석",
  BRAMBLE: "가시 갑옷",
  GALE_CHAIN: "풍사슬",
  LUCKY_STAR: "행운의 별",
  // 6티어 (각 스탯 85 도달) — 만렙 확장 패키지.
  IMPACT_WAVE: "충돌파",
  SHADOW_LEGION: "그림자 군단",
  BLOODFEAST_ARMOR: "흡혈 갑옷",
  ETERNAL_GALE: "무한 풍사슬",
  UNIVERSAL_LUCK: "만물 행운",
} as const;

// 강공격 — 힘 10 도달 시 획득.
// 효과: POWER_ATTACK_TURN_INTERVAL 턴마다 자동 발동 — 그 턴의 첫 공격이 ATK +(2 + floor(STR/8)) 데미지.
// STR 비례라 후반에도 의미가 남는다 (STR 10=+3 / 35=+6 / 70=+10). 분쇄 트리거도 겸함.
export const POWER_ATTACK_STR_THRESHOLD = 10;
export const POWER_ATTACK_BASE_BONUS = 2;
export const POWER_ATTACK_STR_DIVISOR = 8;
export const POWER_ATTACK_TURN_INTERVAL = 3;

// 분쇄 — 힘 20 도달 시 획득.
// 효과: 강공격 발동 턴, 그 공격이 적 방어력 -floor(STR × CRUSH_DEF_PER_STR) 으로 계산 (최소 0).
// STR 비례라 후반에도 유효 — STR 20=-10 / 40=-20 / 70=-35.
export const CRUSH_STR_THRESHOLD = 20;
export const CRUSH_DEF_PER_STR = 0.5;

// 회피 강화 — 민첩 10 도달 시 획득.
// 전투 시작 시 "보장 회피" (1 + floor(DEX/40))회 적립 + 그 전투 동안 회피 확률 +EVADE_BONUS_PCT%.
export const EVADE_DEX_THRESHOLD = 10;
export const EVADE_GUARANTEED_BASE = 1;
export const EVADE_GUARANTEED_DEX_DIVISOR = 40;
export const EVADE_BONUS_PCT = 5;

// 반격 — 민첩 20 도달 시 획득.
// 효과: 회피 성공 시 즉시 카운터 1회 — ATK +floor(DEX/COUNTER_ATK_DEX_DIVISOR) (DEX 비례, 후반에도 유효).
export const COUNTER_DEX_THRESHOLD = 20;
export const COUNTER_ATK_DEX_DIVISOR = 5;

// 가드 — 활력 10 도달 시 획득.
// 전투 시작 후 첫 GUARD_TURNS 적 페이즈 동안 받는 피해 -max(1, floor(VIT/8)) (최소 0).
// 몬스터 다대시 도입 후 per-hit 흡수가 더 중요해져서 divisor 10 → 8 로 상향.
export const GUARD_VIT_THRESHOLD = 10;
export const GUARD_TURNS = 4;
export const GUARD_REDUCTION_VIT_DIVISOR = 8;

// 재생 — 활력 20 도달 시 획득.
// 효과: 매 REGEN_INTERVAL 플레이어 턴 종료 시 HP +floor(VIT × REGEN_HP_PER_VIT).
// VIT 비례라 후반에도 유효 — VIT 20=+10 / 40=+20 / 70=+35.
export const REGEN_VIT_THRESHOLD = 20;
export const REGEN_INTERVAL = 4;
export const REGEN_HP_PER_VIT = 0.5;

// 자연회복 — 모든 빌드에 적용되는 상시 baseline. 스킬 슬롯/스탯 불필요.
// 매 BASELINE_REGEN_INTERVAL 플레이어 턴 종료 시 HP +max(1, floor(maxHp × BASELINE_REGEN_HP_PCT)).
// 비-VIT 빌드 (글래스캐논) 의 유지력 보전 목적 — VIT 빌드는 위 재생 스킬이 별도로 누적.
export const BASELINE_REGEN_INTERVAL = 5;
export const BASELINE_REGEN_HP_PCT = 0.02;

// 연타 — 속도 10 도달 시 획득.
// DOUBLE_STRIKE_INTERVAL 턴마다 그 턴의 마지막 공격 후 추가 1회 공격.
export const DOUBLE_STRIKE_SPD_THRESHOLD = 10;
export const DOUBLE_STRIKE_INTERVAL = 3;

// 기습 — 속도 20 도달 시 획득.
// 효과: 전투 첫 플레이어 턴, 추가 공격 (1 + floor(SPD/50))회.
export const VANGUARD_SPD_THRESHOLD = 20;
export const VANGUARD_BONUS_BASE = 1;
export const VANGUARD_BONUS_SPD_DIVISOR = 50;

// 크리티컬 — 행운 10 도달 시 획득.
// 스킬 효과: 크리티컬 확률 +CRIT_CHANCE_PCT% 추가 (luk 1pt 당 +0.5% 기본과 누적).
// 발동 시 데미지 ×critMult (강공격 보너스 후에 곱해짐). critMult 는 luk 비례 — 아래 critMultFor.
export const CRIT_LUK_THRESHOLD = 10;
export const CRIT_CHANCE_PCT = 5;
// 크리티컬 데미지 배수 — luk 0 일 때의 기본 + luk 1pt 당 추가.
// luk 20 = 2.5 (이전 고정값과 동일), luk 50 = 3.25. 스킬 미장착에도 적용 (크리티컬 자체가 luk 1pt 당 +0.5% 라 어차피 luk 빌드용).
export const CRIT_MULT_BASE = 2.0;
export const CRIT_MULT_PER_LUK = 0.025;
// luk 1pt 당 추가되는 기본 크리티컬 확률(%). 스킬 미장착 상태에서도 적용.
export const CRIT_CHANCE_PER_LUK = 0.5;

// 이중 행운 — 행운 20 도달 시 획득.
// 효과: 크리티컬 발동 시 그 전투 동안 회피 +floor(LUK/4)%, 크리티컬 +floor(LUK/4)% (누적 X). LUK 비례.
export const DOUBLE_LUCK_LUK_THRESHOLD = 20;
export const DOUBLE_LUCK_PCT_LUK_DIVISOR = 4;

// 처형 — 힘 35 도달 시 획득.
// 효과: 적 HP 가 EXECUTION_HP_FRACTION 미만일 때 모든 공격 데미지 ×EXECUTION_DAMAGE_MULT.
// 강공격/분쇄와 누적되며, 크리티컬은 처형 후 데미지에 곱해진다.
export const EXECUTION_STR_THRESHOLD = 35;
export const EXECUTION_HP_FRACTION = 0.3;
export const EXECUTION_DAMAGE_MULT = 1.5;

// 정확 — 민첩 35 도달 시 획득.
// 효과 1) 모든 공격에 대해 적 evasion ×PRECISION_EVASION_MULT (절반). 회피 무력화가 아닌 비례 감소.
// 효과 2) 플레이어의 모든 공격이 적 방어력의 (DEX × PRECISION_PIERCE_PER_DEX)% 를 무시 (PRECISION_PIERCE_CAP 캡).
//   "약점을 노린다" — DEX 비례라 후반에도 유효하고, 고방어 보스에 대한 DEX 빌드의 답.
//   2026-05-23: 방어 무시 과잉 정리로 캡 60%→30% (모든 방어 관통을 DEF_IGNORE_FRACTION 0.3 으로 통일).
//   DEX 35=24.5% / 43+=30%(캡). 분쇄(고정 감산)는 이 비례 관통 뒤에 적용.
export const PRECISION_DEX_THRESHOLD = 35;
export const PRECISION_EVASION_MULT = 0.5;
// DEX 1pt 당 무시하는 적 DEF 비율(0~1). 0.007 = pt당 0.7%.
export const PRECISION_PIERCE_PER_DEX = 0.007;
// 캡 0.3 — engine.ts DEF_IGNORE_FRACTION 과 동일(모든 방어 관통 통일). DEX 43 에서 도달.
export const PRECISION_PIERCE_CAP = 0.3;

// 불굴 — 활력 35 도달 시 획득.
// 효과 1) 전투당 1회, HP 가 0 이 되는 데미지 받으면 HP 1 로 버틴다.
// 효과 2) max HP +ENDURANCE_MAX_HP_BONUS_PCT% (계산은 호출 측에서 vit 보너스 위에 곱).
export const ENDURANCE_VIT_THRESHOLD = 35;
export const ENDURANCE_MAX_HP_BONUS_PCT = 10;

// 광속 — 속도 35 도달 시 획득.
// 효과: 매 턴 마지막 공격 후 min(25, floor(SPD/4))% 확률로 추가 1회 공격 (SPD 비례 — 35=8% / 50=12% / 70=17% / 100=25%캡).
// 연타와 별개 발동 — 연타 슬롯이 없어도 단독으로 작동, 둘 다 슬롯 시 한 턴에 +2 공격까지 가능.
// SPD 기본 추가타 확률(EXTRA_ATTACK_PCT_CAP) 캡으로 줄어든 후반 SPD 투자 가치를 여기서 보상.
export const LIGHTSPEED_SPD_THRESHOLD = 35;
export const LIGHTSPEED_PCT_SPD_DIVISOR = 4;
export const LIGHTSPEED_PCT_CAP = 25;

// 만개 — 행운 35 도달 시 획득.
// 효과 1) 크리티컬 데미지 배수 +BLOOM_CRIT_MULT_BONUS (현재 luk 비례 위에 누적).
// 효과 2) 크리티컬 확률 +BLOOM_CRIT_CHANCE_BONUS_PCT% (luk×0.5 + 크리티컬 슬롯 5% 위에 누적).
export const BLOOM_LUK_THRESHOLD = 35;
export const BLOOM_CRIT_MULT_BONUS = 0.5;
export const BLOOM_CRIT_CHANCE_BONUS_PCT = 3;

// ── 4티어 (각 스탯 50 도달) — 전부 자체 완결, 새 메커니즘 ─────────────────
// 출혈(BLOODLET) — 적중 시 출혈 1스택(중첩, 최대 BLEED_MAX_STACKS). 매 적 턴마다 스택당
// floor(STR × BLOODLET_DMG_PER_STR) 고정 피해(DEF 무시). 컨셉: "기본 DoT" — 타깃 HP 와 무관한
// 신뢰성 있는 고정 피해.
export const BLOODLET_STR_THRESHOLD = 50;
export const BLOODLET_DMG_PER_STR = 0.1;
// 출혈 스택 상한 — 무한 누적(긴 전투에서 보스 단독 녹임) 방지. 출혈·독공이 공유하는 스택에 적용.
export const BLEED_MAX_STACKS = 10;
// 독공(venom 부여) — 컨셉: "체력% DoT". 같은 출혈 스택을 공유하되, 스택당 피해는 적 최대HP 비례
// (venom 강도 × 이 계수). 고HP 보스를 녹이는 스케일 축은 기본 출혈이 아니라 엔드게임 부여(독공)에 둔다.
// venom 강도(enchantVenomDmgPerStack, affix range 5~15 합산)당 적 최대HP 의 이 비율.
export const VENOM_PCT_HP_PER_POINT = 0.0001;
// 그림자 분신 — 매 플레이어 턴 종료 시 분신이 추가 공격 1회 (ATK의 SHADOW_CLONE_ATK_PCT%).
export const SHADOW_CLONE_DEX_THRESHOLD = 50;
export const SHADOW_CLONE_ATK_PCT = 65;
// 철벽 — 전투 시작 시 floor(VIT × BULWARK_SHIELD_PER_VIT) 보호막. 데미지 우선 흡수, 회복 안 됨.
export const BULWARK_VIT_THRESHOLD = 50;
export const BULWARK_SHIELD_PER_VIT = 0.6;
// 무피해 난무 — 매 플레이어 턴 종료 시, 그 전투에서 받은 누적 피해가 0이면 추가 공격 floor(SPD / FLURRY_SPD_DIVISOR)회.
export const FLURRY_SPD_THRESHOLD = 50;
export const FLURRY_SPD_DIVISOR = 25;
// 천명 — 모든 공격에 (LUK × HEAVEN_DECREE_CHANCE_PER_LUK)% 확률로 적 현재 HP의 HEAVEN_DECREE_HP_PCT% 추가 고정 피해.
export const HEAVEN_DECREE_LUK_THRESHOLD = 50;
export const HEAVEN_DECREE_CHANCE_PER_LUK = 0.3;
export const HEAVEN_DECREE_HP_PCT = 5;

// ── 5티어 (각 스탯 65 도달) — 만렙 확장 패키지 ─────────────────────────
// 막다른 격노 — 전투 RAMPAGE_START_TURN 턴 경과 후, 매 플레이어 턴 종료 시 ATK 영구 누적 +floor(STR/RAMPAGE_ATK_STR_DIVISOR).
// 그 전투 동안 유지 (다음 전투 리셋). 장기전(보스) 보상.
export const RAMPAGE_STR_THRESHOLD = 65;
export const RAMPAGE_START_TURN = 3;
export const RAMPAGE_ATK_STR_DIVISOR = 12;
// 약점 분석 — 매 플레이어 턴 종료 시 적 ATK·DEF 각각 -floor(DEX/ANALYSIS_DEX_DIVISOR) (최소 0 클램프, 누적).
export const ANALYSIS_DEX_THRESHOLD = 65;
export const ANALYSIS_DEX_DIVISOR = 30;
// 가시 갑옷 — 적이 넣은 피해(가드/굳건/철벽 감산 전, heavyBlow 반영)의 floor(VIT/BRAMBLE_VIT_DIVISOR)% 반사.
// 특성 반사 갑주와 별도로 누적.
export const BRAMBLE_VIT_THRESHOLD = 65;
export const BRAMBLE_VIT_DIVISOR = 6;
// 풍사슬 — 추가 공격(연타·광속·난무·기습 등) 발동 후 SPD/GALE_CHAIN_PCT_SPD_DIVISOR% 확률로 1회 더 (체인). 한 턴 최대 GALE_CHAIN_MAX_PER_TURN 회.
export const GALE_CHAIN_SPD_THRESHOLD = 65;
export const GALE_CHAIN_PCT_SPD_DIVISOR = 4;
export const GALE_CHAIN_MAX_PER_TURN = 3;
// 행운의 별 — 모든 공격이 (LUK × LUCKY_STAR_CHANCE_PER_LUK)% 확률로 데미지 ×LUCKY_STAR_DAMAGE_MULT (크리티컬과 별개·중첩).
export const LUCKY_STAR_LUK_THRESHOLD = 65;
export const LUCKY_STAR_CHANCE_PER_LUK = 0.3;
export const LUCKY_STAR_DAMAGE_MULT = 2;

// ── 6티어 (각 스탯 85 도달) — 만렙 확장 패키지 ─────────────────────────
// 충돌파 — 매 IMPACT_WAVE_INTERVAL 플레이어 턴마다 본타에 적 현재 HP 의 floor(STR/IMPACT_WAVE_HP_DIVISOR)% 추가 고정 피해 (DEF 무시).
// POWER_ATTACK 과 동일 주기(3턴)라 강공격 턴에 함께 발동.
export const IMPACT_WAVE_STR_THRESHOLD = 85;
export const IMPACT_WAVE_INTERVAL = 3;
export const IMPACT_WAVE_HP_DIVISOR = 10;
// 그림자 군단 — 4티어 분신을 SHADOW_LEGION_EXTRA_CLONES 회 더 (둘 다 보유 시 매 턴 분신 1+2=3회).
// 6티어 단독 보유 시도 분신 데미지 활성 (atkPct = SHADOW_CLONE_ATK_PCT) + 2회. 즉 군단만 있으면 매 턴 2회.
export const SHADOW_LEGION_DEX_THRESHOLD = 85;
export const SHADOW_LEGION_EXTRA_CLONES = 2;
// 흡혈 갑옷 — 받은 HP 피해의 floor(VIT/BLOODFEAST_VIT_DIVISOR)% HP 회복 (HP 0 으로 죽은 후엔 미발동, 불굴로 버틴 후엔 발동).
export const BLOODFEAST_VIT_THRESHOLD = 85;
export const BLOODFEAST_VIT_DIVISOR = 3;
// 무한 풍사슬 — 5티어 풍사슬 확률 +(SPD/ETERNAL_GALE_PCT_SPD_DIVISOR)% + 한 턴 캡 해제. 5티어 슬롯 같이 장착해야 의미.
// 절대 캡 — "캡 해제" 라도 무한 루프 방지를 위한 안전장치. 정상 게임 확률(<=50%)에선 통계적으로 도달 거의 불가.
export const ETERNAL_GALE_SPD_THRESHOLD = 85;
export const ETERNAL_GALE_PCT_SPD_DIVISOR = 4;
export const ETERNAL_GALE_ABSOLUTE_CAP = 30;
// 만물 행운 — 회피·크리·추가타 확률 모두 +floor(LUK/UNIVERSAL_LUCK_LUK_DIVISOR)%.
export const UNIVERSAL_LUCK_LUK_THRESHOLD = 85;
export const UNIVERSAL_LUCK_LUK_DIVISOR = 10;

// 스탯 → 그 스탯이 주는 스킬 티어들 (낮은 임계 → 높은 임계 순). 도감 노출 / 발동 판정 모두 이 매핑을 사용.
// 1차 티어는 STAT_SKILL_INFO_THRESHOLD(5) 도달 시 도감 공개,
// 2차 티어는 STAT_REVEAL_THRESHOLD(15) 도달 시 도감 공개,
// 3차 티어는 STAT_TIER3_REVEAL_THRESHOLD(30) 도달 시 도감 공개. 발동 임계는 1차 10, 2차 20, 3차 35.
export type StatSkillInfo = {
  name: string;
  description: string;
  activationThreshold: number;
};

export const STAT_SKILL: Record<StatKey, StatSkillInfo[]> = {
  str: [
    {
      name: SKILL_NAMES.POWER_ATTACK,
      description: `${POWER_ATTACK_TURN_INTERVAL}턴마다 자동 발동 — 첫 공격이 ATK +(${POWER_ATTACK_BASE_BONUS} + STR/${POWER_ATTACK_STR_DIVISOR}) 데미지 (STR 35=+6)`,
      activationThreshold: POWER_ATTACK_STR_THRESHOLD,
    },
    {
      name: SKILL_NAMES.CRUSH,
      description: `강공격 발동 턴, 그 공격이 적 방어력 -(STR × ${CRUSH_DEF_PER_STR}) 으로 계산 — STR 20=-10`,
      activationThreshold: CRUSH_STR_THRESHOLD,
    },
    {
      name: SKILL_NAMES.EXECUTION,
      description: `적 HP ${Math.round(EXECUTION_HP_FRACTION * 100)}% 미만일 때 모든 공격 데미지 ×${EXECUTION_DAMAGE_MULT}`,
      activationThreshold: EXECUTION_STR_THRESHOLD,
    },
    {
      name: SKILL_NAMES.BLOODLET,
      description: `적중 시 출혈 1스택(중첩, 최대 ${BLEED_MAX_STACKS}) — 매 적 턴마다 스택당 STR × ${BLOODLET_DMG_PER_STR} 고정 피해 (DEF 무시)`,
      activationThreshold: BLOODLET_STR_THRESHOLD,
    },
    {
      name: SKILL_NAMES.RAMPAGE,
      description: `전투 ${RAMPAGE_START_TURN}턴 경과 후, 매 플레이어 턴 종료 시 ATK 영구 +(STR/${RAMPAGE_ATK_STR_DIVISOR}) 누적 — STR 65=+5/턴`,
      activationThreshold: RAMPAGE_STR_THRESHOLD,
    },
    {
      name: SKILL_NAMES.IMPACT_WAVE,
      description: `매 ${IMPACT_WAVE_INTERVAL}턴마다 본타에 적 현재 HP의 (STR/${IMPACT_WAVE_HP_DIVISOR})% 추가 고정 피해 (DEF 무시) — STR 85=8%`,
      activationThreshold: IMPACT_WAVE_STR_THRESHOLD,
    },
  ],
  dex: [
    {
      name: SKILL_NAMES.EVADE,
      description: `전투당 첫 (${EVADE_GUARANTEED_BASE} + DEX/${EVADE_GUARANTEED_DEX_DIVISOR})회 피격을 무조건 회피 + 회피 +${EVADE_BONUS_PCT}%`,
      activationThreshold: EVADE_DEX_THRESHOLD,
    },
    {
      name: SKILL_NAMES.COUNTER,
      description: `회피 성공 시 즉시 카운터 1회 — ATK +(DEX/${COUNTER_ATK_DEX_DIVISOR}) (DEX 35=+7)`,
      activationThreshold: COUNTER_DEX_THRESHOLD,
    },
    {
      name: SKILL_NAMES.PRECISION,
      description: `모든 공격에 대해 적 회피 ×${PRECISION_EVASION_MULT} (비례 절반) + 적 방어력 (DEX × ${(PRECISION_PIERCE_PER_DEX * 100).toFixed(1)})% 무시 — DEX 35=24.5% (최대 ${Math.round(PRECISION_PIERCE_CAP * 100)}%)`,
      activationThreshold: PRECISION_DEX_THRESHOLD,
    },
    {
      name: SKILL_NAMES.SHADOW_CLONE,
      description: `매 플레이어 턴 종료 시 분신이 추가 공격 1회 (ATK의 ${SHADOW_CLONE_ATK_PCT}%)`,
      activationThreshold: SHADOW_CLONE_DEX_THRESHOLD,
    },
    {
      name: SKILL_NAMES.ANALYSIS,
      description: `매 플레이어 턴 종료 시 적 ATK·DEF 각각 -(DEX/${ANALYSIS_DEX_DIVISOR}) 누적 (최소 0) — DEX 65=-2/턴`,
      activationThreshold: ANALYSIS_DEX_THRESHOLD,
    },
    {
      name: SKILL_NAMES.SHADOW_LEGION,
      description: `매 플레이어 턴 종료 시 분신이 ${SHADOW_LEGION_EXTRA_CLONES}회 더 추가타 (4티어 분신과 누적 시 매 턴 ${1 + SHADOW_LEGION_EXTRA_CLONES}회)`,
      activationThreshold: SHADOW_LEGION_DEX_THRESHOLD,
    },
  ],
  vit: [
    {
      name: SKILL_NAMES.GUARD,
      description: `전투 시작 후 첫 ${GUARD_TURNS}턴 동안 받는 피해 -(VIT/${GUARD_REDUCTION_VIT_DIVISOR}) (최소 1) — VIT 40=-5`,
      activationThreshold: GUARD_VIT_THRESHOLD,
    },
    {
      name: SKILL_NAMES.REGEN,
      description: `${REGEN_INTERVAL}턴마다 HP +(VIT × ${REGEN_HP_PER_VIT}) 회복 — VIT 20=+10`,
      activationThreshold: REGEN_VIT_THRESHOLD,
    },
    {
      name: SKILL_NAMES.ENDURANCE,
      description: `전투당 1회, HP 0 이 되는 데미지를 HP 1 로 버틴다 + 최대 HP +${ENDURANCE_MAX_HP_BONUS_PCT}%`,
      activationThreshold: ENDURANCE_VIT_THRESHOLD,
    },
    {
      name: SKILL_NAMES.BULWARK,
      description: `전투 시작 시 (VIT × ${BULWARK_SHIELD_PER_VIT}) 만큼 보호막 — 받는 피해를 먼저 흡수 (회복 안 됨)`,
      activationThreshold: BULWARK_VIT_THRESHOLD,
    },
    {
      name: SKILL_NAMES.BRAMBLE,
      description: `적이 넣은 피해(감산 전)의 (VIT/${BRAMBLE_VIT_DIVISOR})% 적에게 반사 (반사 갑주와 별도 누적) — VIT 66=11%`,
      activationThreshold: BRAMBLE_VIT_THRESHOLD,
    },
    {
      name: SKILL_NAMES.BLOODFEAST_ARMOR,
      description: `피격 시 받은 HP 피해의 (VIT/${BLOODFEAST_VIT_DIVISOR})% HP 회복 — VIT 85=28%`,
      activationThreshold: BLOODFEAST_VIT_THRESHOLD,
    },
  ],
  spd: [
    {
      name: SKILL_NAMES.DOUBLE_STRIKE,
      description: `${DOUBLE_STRIKE_INTERVAL}턴마다 자동 발동 — 그 턴 마지막 공격 후 추가 1회 공격`,
      activationThreshold: DOUBLE_STRIKE_SPD_THRESHOLD,
    },
    {
      name: SKILL_NAMES.VANGUARD,
      description: `전투 첫 턴 추가 공격 (${VANGUARD_BONUS_BASE} + SPD/${VANGUARD_BONUS_SPD_DIVISOR})회`,
      activationThreshold: VANGUARD_SPD_THRESHOLD,
    },
    {
      name: SKILL_NAMES.LIGHTSPEED,
      description: `매 턴 마지막 공격 후 (SPD/${LIGHTSPEED_PCT_SPD_DIVISOR})% 확률로 추가 1회 공격 — SPD 50=12%, 100=25% (최대 ${LIGHTSPEED_PCT_CAP}%)`,
      activationThreshold: LIGHTSPEED_SPD_THRESHOLD,
    },
    {
      name: SKILL_NAMES.FLURRY,
      description: `매 플레이어 턴 종료 시, 그 전투에서 받은 피해가 0이면 추가 공격 (SPD / ${FLURRY_SPD_DIVISOR})회`,
      activationThreshold: FLURRY_SPD_THRESHOLD,
    },
    {
      name: SKILL_NAMES.GALE_CHAIN,
      description: `추가 공격(연타·광속·난무·기습 등) 발동 후 SPD/${GALE_CHAIN_PCT_SPD_DIVISOR}% 확률로 1회 더 (체인) — 한 턴 최대 ${GALE_CHAIN_MAX_PER_TURN}회`,
      activationThreshold: GALE_CHAIN_SPD_THRESHOLD,
    },
    {
      name: SKILL_NAMES.ETERNAL_GALE,
      description: `5티어 풍사슬 강화 — 확률 +(SPD/${ETERNAL_GALE_PCT_SPD_DIVISOR})% + 한 턴 캡 해제 (풍사슬 슬롯 함께 장착 필요)`,
      activationThreshold: ETERNAL_GALE_SPD_THRESHOLD,
    },
  ],
  luk: [
    {
      name: SKILL_NAMES.CRIT,
      description: `크리티컬 확률 +${CRIT_CHANCE_PCT}% 추가, 발동 시 데미지 ×(${CRIT_MULT_BASE} + luk × ${CRIT_MULT_PER_LUK}) — luk 20=×2.5`,
      activationThreshold: CRIT_LUK_THRESHOLD,
    },
    {
      name: SKILL_NAMES.DOUBLE_LUCK,
      description: `크리티컬 발동 시 그 전투 동안 회피 +(LUK/${DOUBLE_LUCK_PCT_LUK_DIVISOR})%, 크리티컬 +(LUK/${DOUBLE_LUCK_PCT_LUK_DIVISOR})% (누적 X) — LUK 20=+5`,
      activationThreshold: DOUBLE_LUCK_LUK_THRESHOLD,
    },
    {
      name: SKILL_NAMES.BLOOM,
      description: `크리티컬 데미지 배수 +${BLOOM_CRIT_MULT_BONUS} + 크리티컬 확률 +${BLOOM_CRIT_CHANCE_BONUS_PCT}%`,
      activationThreshold: BLOOM_LUK_THRESHOLD,
    },
    {
      name: SKILL_NAMES.HEAVEN_DECREE,
      description: `모든 공격에 (LUK × ${HEAVEN_DECREE_CHANCE_PER_LUK})% 확률로 적 현재 HP의 ${HEAVEN_DECREE_HP_PCT}% 추가 고정 피해`,
      activationThreshold: HEAVEN_DECREE_LUK_THRESHOLD,
    },
    {
      name: SKILL_NAMES.LUCKY_STAR,
      description: `모든 공격이 (LUK × ${LUCKY_STAR_CHANCE_PER_LUK})% 확률로 데미지 ×${LUCKY_STAR_DAMAGE_MULT} (크리티컬과 별개·중첩) — LUK 65=19%`,
      activationThreshold: LUCKY_STAR_LUK_THRESHOLD,
    },
    {
      name: SKILL_NAMES.UNIVERSAL_LUCK,
      description: `회피·크리·추가타 확률 모두 +(LUK/${UNIVERSAL_LUCK_LUK_DIVISOR})% — LUK 85=+8%`,
      activationThreshold: UNIVERSAL_LUCK_LUK_THRESHOLD,
    },
  ],
};

// 스킬 이름 → 소속 스탯 매핑. STAT_SKILL 의 역인덱스. 표시(도감·SkillsView 그룹핑) 전용.
// 모듈 로드 시 한 번만 빌드 — STAT_SKILL 은 immutable.
const SKILL_NAME_TO_STAT: ReadonlyMap<string, StatKey> = (() => {
  const m = new Map<string, StatKey>();
  for (const k of STAT_KEYS) {
    for (const tier of STAT_SKILL[k]) m.set(tier.name, k);
  }
  return m;
})();

// 스킬 이름이 어느 스탯에 속하는지. 알 수 없으면 null (FEAT 등 다른 카테고리).
export function statOfSkill(name: string): StatKey | null {
  return SKILL_NAME_TO_STAT.get(name) ?? null;
}

// 현재 스탯에서 보유(획득) 스킬 목록 도출. 스킬은 별도 저장 없이 스탯에서 파생.
// "보유" ≠ "장착" — 보유한 스킬 중 일반 슬롯 수만큼만 effective.
// 1차 → 2차 → 3차 → 4차 → 5차 → 6차 순으로 묶어 반환 — 자동 슬롯 채움 시 낮은 티어가 우선되도록.
export function deriveSkills(stats: Record<StatKey, number>): Skill[] {
  const buckets: Skill[][] = [[], [], [], [], [], []];
  for (const k of STAT_KEYS) {
    const tiers = STAT_SKILL[k];
    for (let t = 0; t < buckets.length; t += 1) {
      const tier = tiers[t];
      if (tier && stats[k] >= tier.activationThreshold) {
        buckets[t].push({ name: tier.name, description: tier.description });
      }
    }
  }
  return buckets.flat();
}

// 보유 스킬 + 사용자 명시 선택 → 실제 발동될 스킬 이름 (일반 슬롯).
// stored 가 undefined 면 첫 slots 개 자동 장착 (신규/마이그레이션).
// stored 가 설정돼 있으면 그 값 그대로 (보유 안 한 스킬은 필터). 빈 슬롯은 빈 채로.
// slots 미지정 시 기본 슬롯 수 — 해금 반영하려면 skillLayout().normalSlots 전달.
//
// AP 스킬 인지: learnedAPSkillNames 가 주어지면 그 안의 이름도 "보유" 로 간주해 슬롯 자리를
// 차지한다. 호출 측이 별도로 stat / AP 분리 추출 필요 (engine 의 fire 로직 분기 때문).
export function effectiveSkillNames(
  available: Skill[],
  stored: string[] | undefined,
  slots: number = BASE_NORMAL_SLOTS,
  learnedAPSkillNames?: ReadonlySet<string>,
): string[] {
  const availableNames = available.map((s) => s.name);
  if (stored === undefined) {
    return availableNames.slice(0, slots);
  }
  const availableSet = new Set(availableNames);
  return stored
    .filter((n) => availableSet.has(n) || learnedAPSkillNames?.has(n) === true)
    .slice(0, slots);
}

// ── 특기 (두 스탯 동시 요구) ─────────────────────────────────────────────
// STAT_SKILL(스탯당 3~4티어)과 별개 카테고리. 두 요구 스탯이 모두 FEAT_STAT_THRESHOLD
// 이상이면 보유 — 특기 전용 슬롯(skillLayout().hasFeatSlot)에 1개만 장착 가능.
export const FEAT_STAT_THRESHOLD = 25;

export const FEAT_NAMES = {
  LIFESTEAL: "흡혈",
  ACROBAT: "곡예",
  BALANCE: "천칭",
  LUCKY_SHIELD: "행운의 방패",
  BERSERKER: "광전사",
  ASSASSINATE: "암살",
  GUST_BLADE: "질풍검",
  RIPOSTE: "연참",
  SKIRMISH: "유격",
  THORN_ARMOR: "반사 갑주",
} as const;

// 흡혈 (DEX & LUK) — 크리티컬로 준 피해의 N%만큼 HP 회복.
export const LIFESTEAL_CRIT_HEAL_PCT = 30;
// 곡예 (DEX & VIT) — 회피 성공 시 HP +floor(VIT × N) 회복.
export const ACROBAT_HEAL_PER_VIT = 0.4;
// 천칭 (SPD & LUK) — 내 SPD 가 적보다 높으면 그 전투 크리티컬 확률 +floor((내SPD-적SPD) × N)%.
export const BALANCE_CRIT_PCT_PER_SPD_DIFF = 0.5;
// 행운의 방패 (VIT & LUK) — 피격당할 때마다 (LUK × N)% 확률로 그 피해를 0으로.
export const LUCKY_SHIELD_BLOCK_PCT_PER_LUK = 0.5;
// 광전사 (STR & VIT) — 잃은 HP 1%당 ATK +N%.
export const BERSERKER_ATK_PCT_PER_LOST_HP_PCT = 0.5;
// 암살 (STR & DEX) — 전투 첫 공격: 적 DEF 무시 + 데미지 ×N.
export const ASSASSINATE_DMG_MULT = 2;
// 질풍검 (STR & SPD) — 매 턴 첫 공격이 (그 턴 공격 횟수 × N) 만큼 ATK 보너스.
export const GUST_BLADE_ATK_PER_ATTACK = 1;
// 연참 (STR & LUK) — 그 턴 크리티컬 발동 시 추가 공격 N회 (턴당 1회 한정).
export const RIPOSTE_EXTRA_ATTACKS = 1;
// 유격 (DEX & SPD) — 회피 성공 시 다음 플레이어 턴 공격 횟수 +N.
export const SKIRMISH_NEXT_TURN_BONUS = 1;
// 반사 갑주 (VIT & SPD) — 피격 시 적이 넣은 피해(가드/굳건/철벽 감산 전, heavyBlow 반영)의
// floor((VIT+SPD)/N)% 를 적에게 반사.
export const THORN_ARMOR_STAT_DIVISOR = 20;

export type FeatSkillInfo = {
  name: string;
  description: string;
  /** 둘 다 FEAT_STAT_THRESHOLD 이상이어야 보유. */
  req: readonly [StatKey, StatKey];
};

// 현재 엔진에 wiring 된 특기만 등재 (Phase 2/3 에서 나머지 6종 추가).
// 미구현 특기를 등재하면 장착은 되는데 효과가 없는 상태가 되므로 금지.
export const FEAT_SKILL: FeatSkillInfo[] = [
  {
    name: FEAT_NAMES.LIFESTEAL,
    description: `크리티컬로 준 피해의 ${LIFESTEAL_CRIT_HEAL_PCT}%만큼 HP 회복`,
    req: ["dex", "luk"],
  },
  {
    name: FEAT_NAMES.ACROBAT,
    description: `회피 성공 시 HP +(VIT × ${ACROBAT_HEAL_PER_VIT}) 회복 — VIT 30=+12`,
    req: ["dex", "vit"],
  },
  {
    name: FEAT_NAMES.BALANCE,
    description: `내 속도가 적보다 빠르면 그 전투 크리티컬 확률 +((내SPD−적SPD) × ${BALANCE_CRIT_PCT_PER_SPD_DIFF})%`,
    req: ["spd", "luk"],
  },
  {
    name: FEAT_NAMES.LUCKY_SHIELD,
    description: `피격당할 때마다 (LUK × ${LUCKY_SHIELD_BLOCK_PCT_PER_LUK})% 확률로 그 피해를 0으로`,
    req: ["vit", "luk"],
  },
  {
    name: FEAT_NAMES.BERSERKER,
    description: `잃은 HP 1%당 ATK +${BERSERKER_ATK_PCT_PER_LOST_HP_PCT}% (HP 절반=+25%)`,
    req: ["str", "vit"],
  },
  {
    name: FEAT_NAMES.ASSASSINATE,
    description: `전투 첫 공격 — 적 방어력 30% 무시 + 데미지 ×${ASSASSINATE_DMG_MULT}`,
    req: ["str", "dex"],
  },
  {
    name: FEAT_NAMES.GUST_BLADE,
    description: `매 턴 첫 공격이 그 턴 공격 횟수만큼 ATK 보너스 (3회 턴=+3)`,
    req: ["str", "spd"],
  },
  {
    name: FEAT_NAMES.RIPOSTE,
    description: `그 턴 크리티컬 발동 시 추가 공격 ${RIPOSTE_EXTRA_ATTACKS}회 (턴당 1회)`,
    req: ["str", "luk"],
  },
  {
    name: FEAT_NAMES.SKIRMISH,
    description: `회피 성공 시 다음 턴 공격 횟수 +${SKIRMISH_NEXT_TURN_BONUS}`,
    req: ["dex", "spd"],
  },
  {
    name: FEAT_NAMES.THORN_ARMOR,
    description: `피격 시 적이 넣은 피해(감산 전)의 ((VIT+SPD)/${THORN_ARMOR_STAT_DIVISOR})% 를 적에게 반사 — VIT+SPD 100=5%`,
    req: ["vit", "spd"],
  },
];

// 보유 특기 — 기본(임계 25) + 2티어(임계 50) 두 카탈로그 합쳐 반환.
// 같은 스탯쌍의 기본+2티어가 둘 다 보유 상태가 될 수 있고, 두 특기 슬롯에 동시 장착 가능.
export function deriveFeats(stats: Record<StatKey, number>): Skill[] {
  const base = FEAT_SKILL.filter((f) =>
    f.req.every((k) => stats[k] >= FEAT_STAT_THRESHOLD),
  );
  const tier2 = FEAT_TIER2_SKILL.filter((f) =>
    f.req.every((k) => stats[k] >= FEAT_TIER2_STAT_THRESHOLD),
  );
  return [...base, ...tier2].map((f) => ({
    name: f.name,
    description: f.description,
  }));
}

// 장착 특기 이름들 — 슬롯 인덱스를 보존해 반환. 결과 길이는 항상 featSlots.
// 빈 슬롯·미보유·중복(앞 슬롯에 같은 이름)은 null 로 채운다.
// 2026-05-19: 이전 버전은 compact 한 string[] 을 반환했고, UI 가 슬롯 0 이 비고 슬롯 1
// 에만 장착된 상태를 슬롯 0 에 그려버리는 위치 어긋남 버그가 있었다 ("특기 슬롯 하나가
// 잠겨 보임"). 결과 자체가 위치를 보존하도록 수정.
export function effectiveFeatNames(
  availableFeats: Skill[],
  stored: ReadonlyArray<string | null | undefined>,
  featSlots: number,
): (string | null)[] {
  if (featSlots <= 0) return [];
  const result: (string | null)[] = new Array(featSlots).fill(null);
  const seen = new Set<string>();
  for (let i = 0; i < featSlots; i += 1) {
    const name = stored[i];
    if (!name) continue;
    if (seen.has(name)) continue;
    if (!availableFeats.some((f) => f.name === name)) continue;
    seen.add(name);
    result[i] = name;
  }
  return result;
}

function featActive(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
  name: string,
  req: readonly [StatKey, StatKey],
): boolean {
  return (
    equipped.has(name) && req.every((k) => stats[k] >= FEAT_STAT_THRESHOLD)
  );
}

// 흡혈 — 크리티컬 데미지의 % 만큼 HP 회복. 미장착 시 0.
export function lifestealCritHealPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.LIFESTEAL, ["dex", "luk"])
    ? LIFESTEAL_CRIT_HEAL_PCT
    : 0;
}

// 곡예 — 회피 성공 시 회복할 HP 절대량. 미장착 시 0.
export function acrobatEvadeHealFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.ACROBAT, ["dex", "vit"])
    ? Math.floor(stats.vit * ACROBAT_HEAL_PER_VIT)
    : 0;
}

// 천칭 — (내SPD - 적SPD) 1당 추가되는 크리티컬 확률(%). 엔진이 적 SPD 와 비교해 적용. 미장착 시 0.
export function balanceCritPctPerSpdDiffFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.BALANCE, ["spd", "luk"])
    ? BALANCE_CRIT_PCT_PER_SPD_DIFF
    : 0;
}

// 행운의 방패 — 피격 무효화 확률(%). 미장착 시 0.
export function luckyShieldBlockPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.LUCKY_SHIELD, ["vit", "luk"])
    ? stats.luk * LUCKY_SHIELD_BLOCK_PCT_PER_LUK
    : 0;
}

// 광전사 — 잃은 HP 1%당 추가되는 ATK 비율(%). 엔진이 현재 HP 비율로 계산. 미장착 시 0.
export function berserkerAtkPctPerLostHpPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.BERSERKER, ["str", "vit"])
    ? BERSERKER_ATK_PCT_PER_LOST_HP_PCT
    : 0;
}

// 암살 — 전투 첫 공격의 데미지 배수 (DEF 무시 동반). 0/미장착 = 미발동.
export function assassinateDmgMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.ASSASSINATE, ["str", "dex"])
    ? ASSASSINATE_DMG_MULT
    : 0;
}

// 질풍검 — 턴 첫 공격에 (공격 횟수 × N) ATK 보너스. 미장착 시 0.
export function gustAtkPerAttackFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.GUST_BLADE, ["str", "spd"])
    ? GUST_BLADE_ATK_PER_ATTACK
    : 0;
}

// 연참 — 크리 발동 턴 추가 공격 횟수. 미장착 시 0.
export function riposteExtraAttacksFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.RIPOSTE, ["str", "luk"])
    ? RIPOSTE_EXTRA_ATTACKS
    : 0;
}

// 유격 — 회피 성공 시 다음 턴 공격 횟수 보너스. 미장착 시 0.
export function skirmishNextTurnBonusFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.SKIRMISH, ["dex", "spd"])
    ? SKIRMISH_NEXT_TURN_BONUS
    : 0;
}

// 반사 갑주 — 적이 넣은 피해(감산 전, heavyBlow 반영)의 % 를 적에게 반사. 미장착 시 0.
export function thornsPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featActive(stats, equipped, FEAT_NAMES.THORN_ARMOR, ["vit", "spd"])
    ? Math.floor((stats.vit + stats.spd) / THORN_ARMOR_STAT_DIVISOR)
    : 0;
}

// ── 2티어 특기 (두 요구 스탯 모두 50 도달) ────────────────────────────────
// 기본 특기와 같은 스탯쌍을 공유하되 임계를 2배로 올린 강화/다른 방향 효과.
// 슬롯은 기존 특기 슬롯(featSlots) 을 공유 — 같은 스탯쌍의 기본+2티어 둘 다 장착도 가능.
export const FEAT_TIER2_STAT_THRESHOLD = 50;

export const FEAT_TIER2_NAMES = {
  ENDURING_STRIKE: "불굴의 일격", // STR+VIT
  WEAKPOINT_HIT: "약점 적중",     // STR+DEX
  LIGHT_HAND: "광속 격투",        // STR+SPD
  FATED_CHAIN: "연쇄 운명",       // STR+LUK
  REFLEX_EVADE: "반사 회피",      // DEX+VIT
  SHADOW_STEP: "그림자 보법",     // DEX+SPD
  LUCKY_LIFESTEAL: "행운의 흡혈", // DEX+LUK
  INFINITE_THORNS: "무한 가시",   // VIT+SPD
  STEADFAST_WILL: "굳건한 의지",  // VIT+LUK
  CYCLING_CHI: "회전 운기",       // SPD+LUK
} as const;

// 불굴의 일격 (STR+VIT) — 매 턴 첫 공격(본타)에 (이번 전투 누적 받은 피해 × N) 추가.
export const ENDURING_STRIKE_MULT = 0.25;
// 약점 적중 (STR+DEX) — 크리티컬 발동 시 그 턴에 한해 추가 공격 1회 + DEF 무시. 턴당 1회.
export const WEAKPOINT_EXTRA_ATTACKS = 1;
// 광속 격투 (STR+SPD) — 매 턴 기본 공격 횟수 +N.
export const LIGHT_HAND_EXTRA_ATTACK = 1;
// 연쇄 운명 (STR+LUK) — 크리티컬 발동 시 그 전투의 다음 공격 1회 크리 100% 보장. 턴당 1회.
// (실제 발동은 "다음 공격" 1회로 한정 — 트리거 자체는 턴당 1회.)
// 연쇄 운명은 상수 없음 (boolean 활성 여부만).
// 반사 회피 (DEX+VIT) — 회피 성공 시 받았을 피해의 N 비율을 적에게 반사.
export const REFLEX_EVADE_MULT = 0.5;
// 그림자 보법 (DEX+SPD) — 매 적 턴 시작 시 (DEX+SPD)/N % 확률로 그 턴 무피격.
export const SHADOW_STEP_STAT_DIVISOR = 10;
// 행운의 흡혈 (DEX+LUK) — 모든 공격(크리 외도) 피해의 (LUK/N)% HP 회복.
export const LUCKY_LIFESTEAL_LUK_DIVISOR = 8;
// 무한 가시 (VIT+SPD) — 매 적 공격에 적 ATK 의 (VIT/N)% 반사 (회피/피격 무관).
export const INFINITE_THORNS_VIT_DIVISOR = 4;
// 굳건한 의지 (VIT+LUK) — 받은 피해 평탄 -(LUK/N).
export const STEADFAST_WILL_LUK_DIVISOR = 3;
// 회전 운기 (SPD+LUK) — 매 플레이어 턴 시작 시 회피/크리 확률 +(LUK/N)% 누적.
export const CYCLING_CHI_LUK_DIVISOR = 10;

// 2티어 특기는 같은 카탈로그(FeatSkillInfo) 로 deriveFeats 에서 함께 반환되도록 한다.
// req 임계가 다르므로 항목별 threshold 를 두는 대신 별도 배열로 보관하고
// deriveFeats 가 두 배열을 모두 검사한다.
export const FEAT_TIER2_SKILL: FeatSkillInfo[] = [
  {
    name: FEAT_TIER2_NAMES.ENDURING_STRIKE,
    description: `매 턴 본타(첫 공격) 데미지에 이번 전투 누적 피해 × ${ENDURING_STRIKE_MULT} 추가`,
    req: ["str", "vit"],
  },
  {
    name: FEAT_TIER2_NAMES.WEAKPOINT_HIT,
    description: `크리티컬 발동 시 그 턴 즉시 추가 공격 ${WEAKPOINT_EXTRA_ATTACKS}회 + 적 DEF 30% 무시 (턴당 1회)`,
    req: ["str", "dex"],
  },
  {
    name: FEAT_TIER2_NAMES.LIGHT_HAND,
    description: `매 턴 기본 공격 횟수 +${LIGHT_HAND_EXTRA_ATTACK}`,
    req: ["str", "spd"],
  },
  {
    name: FEAT_TIER2_NAMES.FATED_CHAIN,
    description: `크리티컬 발동 시 다음 공격 1회 크리 100% 보장 (턴당 1회)`,
    req: ["str", "luk"],
  },
  {
    name: FEAT_TIER2_NAMES.REFLEX_EVADE,
    description: `회피 성공 시 받았을 피해의 ${Math.round(REFLEX_EVADE_MULT * 100)}% 를 적에게 반사`,
    req: ["dex", "vit"],
  },
  {
    name: FEAT_TIER2_NAMES.SHADOW_STEP,
    description: `매 적 턴 시작 시 ((DEX+SPD)/${SHADOW_STEP_STAT_DIVISOR})% 확률로 그 턴 모든 적 공격 무효`,
    req: ["dex", "spd"],
  },
  {
    name: FEAT_TIER2_NAMES.LUCKY_LIFESTEAL,
    description: `모든 공격 피해의 (LUK/${LUCKY_LIFESTEAL_LUK_DIVISOR})% HP 회복 — LUK 50=6%`,
    req: ["dex", "luk"],
  },
  {
    name: FEAT_TIER2_NAMES.INFINITE_THORNS,
    description: `매 적 공격에 적 ATK 의 (VIT/${INFINITE_THORNS_VIT_DIVISOR})% 반사 (회피/피격 무관) — VIT 50=12%`,
    req: ["vit", "spd"],
  },
  {
    name: FEAT_TIER2_NAMES.STEADFAST_WILL,
    description: `받은 피해 평탄 -(LUK/${STEADFAST_WILL_LUK_DIVISOR}) 감소 — LUK 51=-17`,
    req: ["vit", "luk"],
  },
  {
    name: FEAT_TIER2_NAMES.CYCLING_CHI,
    description: `매 플레이어 턴 시작 시 회피·크리 확률 +(LUK/${CYCLING_CHI_LUK_DIVISOR})% 누적 — LUK 50=+5%/턴`,
    req: ["spd", "luk"],
  },
];

function featTier2Active(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
  name: string,
  req: readonly [StatKey, StatKey],
): boolean {
  return (
    equipped.has(name) && req.every((k) => stats[k] >= FEAT_TIER2_STAT_THRESHOLD)
  );
}

// 불굴의 일격 — 누적 피해에 곱할 비율. 미장착 시 0.
export function enduringStrikeMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.ENDURING_STRIKE, ["str", "vit"])
    ? ENDURING_STRIKE_MULT
    : 0;
}

// 약점 적중 — 크리 시 즉시 추가 공격 횟수 (DEF 무시). 미장착 시 0.
export function weakpointExtraAttacksFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.WEAKPOINT_HIT, ["str", "dex"])
    ? WEAKPOINT_EXTRA_ATTACKS
    : 0;
}

// 광속 격투 — 기본 공격 횟수 보너스. 미장착 시 0.
export function lightHandExtraAttackFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.LIGHT_HAND, ["str", "spd"])
    ? LIGHT_HAND_EXTRA_ATTACK
    : 0;
}

// 연쇄 운명 — 활성 여부 (boolean). 미장착 시 false.
export function fatedChainActiveFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): boolean {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.FATED_CHAIN, ["str", "luk"]);
}

// 반사 회피 — 회피 시 반사할 비율. 미장착 시 0.
export function reflexEvadeMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.REFLEX_EVADE, ["dex", "vit"])
    ? REFLEX_EVADE_MULT
    : 0;
}

// 그림자 보법 — 매 적 턴 무피격 발동 확률 (%). 미장착 시 0.
export function shadowStepPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.SHADOW_STEP, ["dex", "spd"])
    ? (stats.dex + stats.spd) / SHADOW_STEP_STAT_DIVISOR
    : 0;
}

// 행운의 흡혈 — 모든 공격 피해의 회복 비율 (%). 미장착 시 0.
export function luckyLifestealPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.LUCKY_LIFESTEAL, ["dex", "luk"])
    ? stats.luk / LUCKY_LIFESTEAL_LUK_DIVISOR
    : 0;
}

// 무한 가시 — 매 적 공격에 적 ATK 의 반사 비율 (%). 미장착 시 0.
export function infiniteThornsAtkPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.INFINITE_THORNS, ["vit", "spd"])
    ? stats.vit / INFINITE_THORNS_VIT_DIVISOR
    : 0;
}

// 굳건한 의지 — 받은 피해 평탄 감소량. 미장착 시 0.
export function steadfastWillFlatFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.STEADFAST_WILL, ["vit", "luk"])
    ? Math.floor(stats.luk / STEADFAST_WILL_LUK_DIVISOR)
    : 0;
}

// 회전 운기 — 매 플레이어 턴 누적 회피/크리 보너스 (%). 미장착 시 0.
export function cyclingChiPerTurnFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return featTier2Active(stats, equipped, FEAT_TIER2_NAMES.CYCLING_CHI, ["spd", "luk"])
    ? stats.luk / CYCLING_CHI_LUK_DIVISOR
    : 0;
}

// 전투 엔진이 사용할 보너스/효과 헬퍼 — 보유 + 장착 둘 다 만족해야 발동.
export function powerAttackBonusFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= POWER_ATTACK_STR_THRESHOLD &&
    equipped.has(SKILL_NAMES.POWER_ATTACK)
    ? POWER_ATTACK_BASE_BONUS + Math.floor(stats.str / POWER_ATTACK_STR_DIVISOR)
    : 0;
}

export function crushDefReductionFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= CRUSH_STR_THRESHOLD && equipped.has(SKILL_NAMES.CRUSH)
    ? Math.floor(stats.str * CRUSH_DEF_PER_STR)
    : 0;
}

export function evadeGuaranteedFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= EVADE_DEX_THRESHOLD && equipped.has(SKILL_NAMES.EVADE)
    ? EVADE_GUARANTEED_BASE + Math.floor(stats.dex / EVADE_GUARANTEED_DEX_DIVISOR)
    : 0;
}

export function evadeBonusPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= EVADE_DEX_THRESHOLD && equipped.has(SKILL_NAMES.EVADE)
    ? EVADE_BONUS_PCT
    : 0;
}

export function counterAtkBonusFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= COUNTER_DEX_THRESHOLD && equipped.has(SKILL_NAMES.COUNTER)
    ? Math.floor(stats.dex / COUNTER_ATK_DEX_DIVISOR)
    : 0;
}

export function doubleStrikeIntervalFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number | undefined {
  return stats.spd >= DOUBLE_STRIKE_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.DOUBLE_STRIKE)
    ? DOUBLE_STRIKE_INTERVAL
    : undefined;
}

export function vanguardFirstTurnBonusFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.spd >= VANGUARD_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.VANGUARD)
    ? VANGUARD_BONUS_BASE + Math.floor(stats.spd / VANGUARD_BONUS_SPD_DIVISOR)
    : 0;
}

export function critChancePctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  // 기본 — luk 1pt 당 +CRIT_CHANCE_PER_LUK% (스킬 미장착에도 적용).
  const base = stats.luk * CRIT_CHANCE_PER_LUK;
  // 크리티컬 슬롯 시 +CRIT_CHANCE_PCT% 추가.
  const critSkillBonus =
    stats.luk >= CRIT_LUK_THRESHOLD && equipped.has(SKILL_NAMES.CRIT)
      ? CRIT_CHANCE_PCT
      : 0;
  // 만개 슬롯 시 +BLOOM_CRIT_CHANCE_BONUS_PCT% 추가 (크리티컬 슬롯 무관).
  const bloomBonus =
    stats.luk >= BLOOM_LUK_THRESHOLD && equipped.has(SKILL_NAMES.BLOOM)
      ? BLOOM_CRIT_CHANCE_BONUS_PCT
      : 0;
  return base + critSkillBonus + bloomBonus;
}

// 크리티컬 데미지 배수 — luk 비례. 만개 슬롯 시 +BLOOM_CRIT_MULT_BONUS 추가.
// 결과: luk 0=2.0 / luk 10=2.25 / luk 20=2.5 / luk 50=3.25 (만개 미장착 기준).
export function critMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  const base = CRIT_MULT_BASE + stats.luk * CRIT_MULT_PER_LUK;
  const bloomBonus =
    stats.luk >= BLOOM_LUK_THRESHOLD && equipped.has(SKILL_NAMES.BLOOM)
      ? BLOOM_CRIT_MULT_BONUS
      : 0;
  return base + bloomBonus;
}

export function doubleLuckBonusesFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): { evade: number; crit: number } {
  if (
    stats.luk < DOUBLE_LUCK_LUK_THRESHOLD ||
    !equipped.has(SKILL_NAMES.DOUBLE_LUCK)
  ) {
    return { evade: 0, crit: 0 };
  }
  const pct = Math.floor(stats.luk / DOUBLE_LUCK_PCT_LUK_DIVISOR);
  return { evade: pct, crit: pct };
}

export function guardFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): { turns: number; reduction: number } {
  return stats.vit >= GUARD_VIT_THRESHOLD && equipped.has(SKILL_NAMES.GUARD)
    ? {
        turns: GUARD_TURNS,
        reduction: Math.max(1, Math.floor(stats.vit / GUARD_REDUCTION_VIT_DIVISOR)),
      }
    : { turns: 0, reduction: 0 };
}

export function regenFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): { interval: number; amount: number } {
  return stats.vit >= REGEN_VIT_THRESHOLD && equipped.has(SKILL_NAMES.REGEN)
    ? { interval: REGEN_INTERVAL, amount: Math.floor(stats.vit * REGEN_HP_PER_VIT) }
    : { interval: 0, amount: 0 };
}

// 자연회복 — 모든 플레이어 공통, 스킬/스탯 임계 없음. maxHp 비율 기반.
export function baselineRegenFor(maxHp: number): { interval: number; amount: number } {
  return {
    interval: BASELINE_REGEN_INTERVAL,
    amount: Math.max(1, Math.floor(maxHp * BASELINE_REGEN_HP_PCT)),
  };
}

// 처형 — 데미지 배수. 적 HP 비율은 엔진이 직접 검사하고 이 배수만 곱한다.
// 미장착 시 1 (no-op).
export function executionDamageMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= EXECUTION_STR_THRESHOLD &&
    equipped.has(SKILL_NAMES.EXECUTION)
    ? EXECUTION_DAMAGE_MULT
    : 1;
}

// 처형 발동 임계 HP 비율 (0~1). 엔진이 적 HP / 적 max HP < 임계 일 때 처형 데미지 적용.
export function executionHpFractionFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= EXECUTION_STR_THRESHOLD &&
    equipped.has(SKILL_NAMES.EXECUTION)
    ? EXECUTION_HP_FRACTION
    : 0;
}

// 정확 — 적 evasion 배수. 미장착 시 1 (no-op).
export function precisionEvasionMultFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= PRECISION_DEX_THRESHOLD &&
    equipped.has(SKILL_NAMES.PRECISION)
    ? PRECISION_EVASION_MULT
    : 1;
}

// 정확 — 플레이어 공격이 무시하는 적 방어력 비율(0~1). DEX 비례, PRECISION_PIERCE_CAP 캡. 미장착 시 0.
export function precisionArmorPierceFractionFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= PRECISION_DEX_THRESHOLD &&
    equipped.has(SKILL_NAMES.PRECISION)
    ? Math.min(PRECISION_PIERCE_CAP, stats.dex * PRECISION_PIERCE_PER_DEX)
    : 0;
}

// 불굴 활성 여부 — 엔진이 HP 0 데미지 직전 분기.
export function enduranceActiveFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): boolean {
  return (
    stats.vit >= ENDURANCE_VIT_THRESHOLD &&
    equipped.has(SKILL_NAMES.ENDURANCE)
  );
}

// 불굴 max HP 보너스 % — 호출 측이 베이스 max HP 위에 곱한다.
export function enduranceMaxHpBonusPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return enduranceActiveFor(stats, equipped) ? ENDURANCE_MAX_HP_BONUS_PCT : 0;
}

// 광속 — 매 턴 마지막 공격 후 추가 1회 공격 확률(%).
export function lightspeedExtraAttackPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.spd >= LIGHTSPEED_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.LIGHTSPEED)
    ? Math.min(LIGHTSPEED_PCT_CAP, Math.floor(stats.spd / LIGHTSPEED_PCT_SPD_DIVISOR))
    : 0;
}

// ── 4티어 발동 헬퍼 ─────────────────────────────────────────────────────
// 출혈 — 출혈 스택당 적이 받는 고정 피해. 미장착 시 0.
export function bleedDmgPerStackFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= BLOODLET_STR_THRESHOLD &&
    equipped.has(SKILL_NAMES.BLOODLET)
    ? Math.floor(stats.str * BLOODLET_DMG_PER_STR)
    : 0;
}

// 그림자 분신 — 매 턴 끝 분신 추가타의 ATK 비율(%). 미장착 시 0.
export function shadowCloneAtkPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= SHADOW_CLONE_DEX_THRESHOLD &&
    equipped.has(SKILL_NAMES.SHADOW_CLONE)
    ? SHADOW_CLONE_ATK_PCT
    : 0;
}

// 철벽 — 전투 시작 시 보호막 절대량. 미장착 시 0.
export function bulwarkShieldFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.vit >= BULWARK_VIT_THRESHOLD && equipped.has(SKILL_NAMES.BULWARK)
    ? Math.floor(stats.vit * BULWARK_SHIELD_PER_VIT)
    : 0;
}

// 무피해 난무 — 무피해 시 매 턴 끝 추가 공격 횟수. 미장착 시 0.
export function flurryAttacksFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.spd >= FLURRY_SPD_THRESHOLD && equipped.has(SKILL_NAMES.FLURRY)
    ? Math.floor(stats.spd / FLURRY_SPD_DIVISOR)
    : 0;
}

// 천명 — 매 공격마다 적 현재 HP 비율 피해가 터질 확률(%). 미장착 시 0.
export function heavenDecreeChancePctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.luk >= HEAVEN_DECREE_LUK_THRESHOLD &&
    equipped.has(SKILL_NAMES.HEAVEN_DECREE)
    ? stats.luk * HEAVEN_DECREE_CHANCE_PER_LUK
    : 0;
}

// ── 5티어 헬퍼 ─────────────────────────────────────────────────────────
// 막다른 격노 — 매 플레이어 턴 ATK 누적량 (전투 RAMPAGE_START_TURN 턴 경과 후). 미장착/미달 시 0.
export function rampagePerTurnFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= RAMPAGE_STR_THRESHOLD && equipped.has(SKILL_NAMES.RAMPAGE)
    ? Math.floor(stats.str / RAMPAGE_ATK_STR_DIVISOR)
    : 0;
}

// 약점 분석 — 매 플레이어 턴 적 ATK·DEF 감소량 (누적). 미장착/미달 시 0.
export function analysisPerTurnFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= ANALYSIS_DEX_THRESHOLD &&
    equipped.has(SKILL_NAMES.ANALYSIS)
    ? Math.floor(stats.dex / ANALYSIS_DEX_DIVISOR)
    : 0;
}

// 가시 갑옷 — 적이 넣은 피해(감산 전, heavyBlow 반영) 반사 비율(%). 미장착/미달 시 0. 반사 갑주와 별도 누적.
export function bramblePctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.vit >= BRAMBLE_VIT_THRESHOLD && equipped.has(SKILL_NAMES.BRAMBLE)
    ? Math.floor(stats.vit / BRAMBLE_VIT_DIVISOR)
    : 0;
}

// 풍사슬 — 추가 공격 발동 후 체인 확률(%). 미장착/미달 시 0.
export function galeChainChancePctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.spd >= GALE_CHAIN_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.GALE_CHAIN)
    ? stats.spd / GALE_CHAIN_PCT_SPD_DIVISOR
    : 0;
}

// 행운의 별 — 모든 공격이 데미지 ×2 가 될 확률(%). 미장착/미달 시 0.
export function luckyStarChancePctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.luk >= LUCKY_STAR_LUK_THRESHOLD &&
    equipped.has(SKILL_NAMES.LUCKY_STAR)
    ? stats.luk * LUCKY_STAR_CHANCE_PER_LUK
    : 0;
}

// ── 6티어 헬퍼 ─────────────────────────────────────────────────────────
// 충돌파 — 매 IMPACT_WAVE_INTERVAL 턴마다 본타가 추가로 적 현재 HP 의 N% 고정 피해.
// 반환값 = HP 비율(%). 미장착/미달 시 0.
export function impactWaveHpPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.str >= IMPACT_WAVE_STR_THRESHOLD &&
    equipped.has(SKILL_NAMES.IMPACT_WAVE)
    ? Math.floor(stats.str / IMPACT_WAVE_HP_DIVISOR)
    : 0;
}

// 그림자 군단 — 매 턴 분신 추가 횟수. 미장착/미달 시 0.
// 6티어 단독 보유 시도 의미 있도록, derivePlayerCombat 에서 shadowCloneAtkPct 도 함께 활성시킨다.
export function shadowLegionExtraClonesFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.dex >= SHADOW_LEGION_DEX_THRESHOLD &&
    equipped.has(SKILL_NAMES.SHADOW_LEGION)
    ? SHADOW_LEGION_EXTRA_CLONES
    : 0;
}

// 흡혈 갑옷 — 받은 HP 피해의 N% HP 회복. 미장착/미달 시 0.
export function bloodfeastPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.vit >= BLOODFEAST_VIT_THRESHOLD &&
    equipped.has(SKILL_NAMES.BLOODFEAST_ARMOR)
    ? Math.floor(stats.vit / BLOODFEAST_VIT_DIVISOR)
    : 0;
}

// 무한 풍사슬 — 5티어 풍사슬 확률에 더할 보너스(%) + 한 턴 캡 해제 여부.
// 두 효과를 하나의 헬퍼로 묶고, 미장착/미달 시 둘 다 0/false.
export function eternalGaleBonusPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.spd >= ETERNAL_GALE_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.ETERNAL_GALE)
    ? stats.spd / ETERNAL_GALE_PCT_SPD_DIVISOR
    : 0;
}

export function eternalGaleNoCapFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): boolean {
  return (
    stats.spd >= ETERNAL_GALE_SPD_THRESHOLD &&
    equipped.has(SKILL_NAMES.ETERNAL_GALE)
  );
}

// 만물 행운 — 회피·크리·추가타 모두에 더할 보너스(%). 미장착/미달 시 0.
export function universalLuckBonusPctFor(
  stats: Record<StatKey, number>,
  equipped: ReadonlySet<string>,
): number {
  return stats.luk >= UNIVERSAL_LUCK_LUK_THRESHOLD &&
    equipped.has(SKILL_NAMES.UNIVERSAL_LUCK)
    ? Math.floor(stats.luk / UNIVERSAL_LUCK_LUK_DIVISOR)
    : 0;
}
