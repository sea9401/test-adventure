// v2 스킬 시스템 — 카탈로그 + 타입 + 슬롯/파싱 헬퍼.
//
// 디자인 (2026-05-28 사용자 spec):
// - 6개 스탯 (STR/DEX/VIT/SPD/LUK/INT) 통일된 액티브 스킬 시스템.
// - MP 단일 자원, MP 비용 + 쿨다운 이중 게이트.
// - 4 카테고리: 공격/회복/버프/디버프 (복합 효과 가능).
// - 학습 = 교관 NPC 골드 구매 (영구 인벤토리), 장착 = 슬롯 (Lv 33렙당 +1, 1→100 = 3→6).
// - 자동 발동 우선순위 = equipped 배열 순서.
// - 수치는 의도적으로 낮게 시작 — 성장 요소 후속 PR.
//
// 이 모듈은 카탈로그/타입/파싱 헬퍼만 — DB/UI/전투 wiring 은 후속 PR.

import type { StatKey } from "@/adventure/data/stats";
import { STAT_LABELS } from "@/adventure/data/stats";
import {
  V2_STAT_LABELS,
  type V2StatKey,
} from "./v2StatKeys";
import type { V2Element } from "./elements";
import { V2_ELEMENT_LABEL } from "./elements";
import { V2_BASE_SKILLS } from "./v2SkillCatalog";
import { V2_COMMON_SKILLS, type V2CommonSkillId } from "./v2SkillsCommonCatalog";
import { V2_JOB_CATALOG } from "./v2JobCatalog";
import {
  parseCombatPattern,
  parseCombatPresets,
  V2_DIRECT_SKILL_STAT_COEF_MULT,
  v2PureSkillFormulaCoefficients,
  v2SkillHealStatCoef,
  v2SkillAttackCoef,
  v2SpecializedSkillStatCoef,
  type V2CombatCondition,
  type V2CombatPattern,
  type V2CombatPreset,
} from "@/adventure/v2/combat/combatPattern";
import {
  type V2LoadoutPreset,
  PRESET_NAME_MAX,
  totalPresetSlots,
} from "./v2LoadoutPresets";
import {
  normalizeSkillEnhancements,
  type V2SkillEnhancements,
} from "./skillRitual";
import type { V2BuildTagId } from "./buildTags";
import {
  bleedHuntPowerValue,
  type BleedHuntMechanic,
} from "./bleedHunt";
import {
  tier7CombatJobIdForSkillId,
  tier7MechanicPower,
  type Tier7Mechanic,
} from "./tier7SkillMechanics";
import { combineDefReductionPcts } from "./v2CombatConstants";

export type V2SkillCategory = "attack" | "heal" | "buff" | "debuff" | "passive";
export type V2SkillTempo = "rapid" | "balanced" | "control" | "burst" | "payoff";

// 패시브 스킬 효과 — 액티브(effects)와 별개. 장착(로드아웃)돼 있으면 derive 가 상시 적용.
//   stat = 1차 스탯 가산(근력 힘+10 등), atkPerDexCoef = 민첩→공격력 보조(예기).
export type V2PassiveSkillEffect = {
  /** 고정 스탯 가산(기본 직업 — 근력 I 힘+10 등). */
  stat?: Partial<Record<V2StatKey, number>>;
  /** % 스탯 가산(상위 직업 — 근력 II 힘+15% 등). 여러 패시브의 %는 합산(가산). */
  statPct?: Partial<Record<V2StatKey, number>>;
  /** 최대 HP % 가산(체력). */
  maxHpPct?: number;
  /** 최대 MP % 가산(마나). */
  maxMpPct?: number;
  /** 직접 피해 마법 스킬의 실제 MP 소모 감소율. 여러 패시브는 가산한다. */
  mpCostReductionPct?: number;
  /** 한기 5중첩으로 발생하는 빙결 피해 증가율. */
  freezeDamagePct?: number;
  /** 한기 5중첩으로 발생하는 다음 행동 지연율. */
  freezeDelayPct?: number;
  /** 빙결 발동 뒤 대상에게 남기는 한기 수. 여러 패시브는 최대값만 적용한다. */
  freezeRetainStacks?: number;
  /** 마나 실드 활성화 — INT·최대 MP 기반 전투별 장벽을 전개한다. 현재 MP는 소모하지 않는다. */
  magicBarrier?: boolean;
  /** 민첩→공격력 보조 계수(예기). */
  atkPerDexCoef?: number;
  // ── 다양성 확장(A 메타) — 스탯 크기 외 "작동 방식" 사이드그레이드. 반격 확률 외에는 가산 합산.
  //   엔진 레버에 직결: critPct→critChancePct · critDmgPct→critMult(/100) · evasionPct→eva(cap)
  //   · lifestealPct→흡혈(낮게). 미지정=무적용(byte-identical).
  /** 치명타 확률 +%p 가산(급소·치명). */
  critPct?: number;
  /** 치명타 피해 +% 가산(맹공) — critMult 에 /100 환산 가산. */
  critDmgPct?: number;
  /** 회피도 +% 증가(허보) — 스탯·경갑·옵션 회피도 합계에 적용. */
  evasionPct?: number;
  /** 흡혈 +% — 가한 피해의 일부 체력 흡수(포식). 자동전투 눈덩이 방지로 의도적 저수치. */
  lifestealPct?: number;
  /** 반격 확률 +%p — 피격 생존 시 이 확률로 적에게 ATK 반격(절정 반격). 엔진 passiveCounterChancePct
   *  훅에 합산(PvE enemyPhase 전용·반격의 룬과 동일 패턴). 미지정=무적용. */
  counterChancePct?: number;
  /** 활성 반사 피해 증폭을 이 패시브의 반격 피해에도 적용한다. 금강나한 고유 연계. */
  counterDamageUsesReflectBoost?: boolean;
  // ── 다양성 2차(A 메타) — 둘 다 PvE/PvP 양쪽 적용(def=damageBetween 공용·명중=PvP도 소비).
  /** 물리·마법 방어력 +% 가산(철벽) — def 와 magicDef 에 곱연산. */
  defPct?: number;
  /** 반사(가시) — 피격 시 내 방어력의 이 %만큼을 적에게 고정 데미지로 반사(수호자 패시브).
   *  derive 가 def × %/100 → PlayerCombat.thornsFlatFromDef, 엔진이 피격 시 가산(PvE enemyPhase +
   *  PvP applyOnHitReflect 양쪽). 미지정=무적용(byte-identical). 100 = "방어 계수의 수치만큼". */
  thornsDefPct?: number;
  /** 성채기사 — 적의 직접 공격이 명중할 때 충격을 1 얻는다. */
  fortressImpactOnHit?: boolean;
  /** 충격을 소비하는 직접 공격의 스택당 최종 피해 증가율. 같은 계보에서는 최댓값 적용. */
  fortressImpactDamagePctPerStack?: number;
  /** 방어력 계수를 사용하는 직접 공격의 방어력 계수 증가율. 반사에는 적용하지 않는다. */
  fortressDefSkillStatCoefPct?: number;
  /** 적중도 +% 증가(정밀) — 스탯·장비 적중도 합계에 적용. */
  accuracyPct?: number;
  // ── SPI 부활(신술 지원) — 회복 강화. healMult 에 곱연산(딜 아님 → INT 와 역할 분리·파워크립 차단).
  /** 회복 +% 가산(치유 강화) — healMult ×(1+합산%/100). 신술 지원 라인 패시브. */
  healPowerPct?: number;
  // ── 받피감(방벽) — 받는 피해 -% 곱연산. specEff.damageTakenReductionPct 와 같은 훅에 합산.
  //   PvE/PvP 양쪽 작동(#835 PvP 미러 후). 미지정=무적용(byte-identical).
  /** 받는 피해 -% 가산(방벽) — totalDamageTakenReductionPct 에 합산. */
  damageTakenReductionPct?: number;
  /** 중독·출혈 등 상태 피해 감소율. 직접 피해에는 적용하지 않는다. */
  statusDamageReductionPct?: number;
  /** 대상의 출혈 스택당 직접 물리 스킬 피해 증가율. */
  bleedPhysicalSkillDamagePctPerStack?: number;
  /** 현재 중량 스택당 방어력 증가율. */
  stoneskinDefPctPerWeight?: number;
  /** 마법 방어력 +% 가산(결계술) — magicDef 에 곱연산. */
  magicDefPct?: number;
  /** 전투 초반 마법형 평타 받는 피해 -% 가산(결계술). */
  openingMagicDamageReductionPct?: number;
  /** 초반 마법 피해 감소가 적용되는 적 행동 횟수. */
  openingMagicDamageReductionPhases?: number;
  /** 삼중 결계 단계. 1=각 1회, 2=각 3회와 영역 안정. */
  tripleWardRank?: 1 | 2;
  /** 원소 공명 — 원소 폭주 같은 속성 분기 액티브의 보조 효과를 강화. */
  elementResonance?: boolean;
  /** 각인 증폭 — 각인 해방의 복수 장착 시너지를 강화. */
  inscriptionAmplification?: boolean;
  /** 법칙 각인 — 문장 해방의 정상 시전을 장착 재료별 전투 각인으로 변환한다. */
  lawInscription?: boolean;
  /** 중독된 적 방어 -% 가산(부식) — 엔진이 중독 상태인 적에게만 적용. */
  poisonedEnemyDefReductionPct?: number;
  /** 중독 지속 피해 +% 가산(맹독). 부식과 분리해 독 피해에만 적용한다. */
  poisonDamagePct?: number;
  /** 적 물리 방어 -% — 장착 중 항상 적용하며 같은 효과끼리 남은 방어력 기준 곱연산. */
  enemyPhysicalDefReductionPct?: number;
  /** 적 마법 방어 -% — 마법 피해에만 적용하며 같은 효과끼리 남은 방어력 기준 곱연산. */
  enemyMagicDefReductionPct?: number;
  /** 광전 — 잃은 HP 비율만큼 공격력 가산. 0.45 = HP를 전부 잃은 상태 기준 공격력 +45%. */
  berserkAtkPctPerLostHpPct?: number;
  /** 약점 노출 — 스킬 적중 시 적 마법취약 +1스택, 스택당 받는 스킬피해 +%. */
  enemyMagicVulnPctPerStack?: number;
  /** 약점 노출 누적 확률 +%p. 미지정이면 기존 호환을 위해 100%로 처리. */
  enemyMagicVulnApplyChancePct?: number;
  /** 마법 스킬 피해 +% — damage effect 의 scaling="magic"/"spi" 피해분에만 적용. */
  magicSkillDamagePct?: number;
  /** 일검필살 — 단일 일반 물리 damage 효과만 가진 공격 스킬의 직접 피해 +%. */
  singleHitPhysicalSkillDamagePct?: number;
  // ── 경제(비전투) — 장착 시 사냥 승리당 숙달 포인트 획득 +N. 전투 derive 무관(hunt 지급부에서 소비).
  profPerKillBonus?: number;
  // ── 낚시(비전투) — 캐스팅 시 서버 권위 판정에서만 소비. 전투 derive 와 무관.
  /** 낚은 물고기 크기 굴림을 상한 쪽으로 보정. 4 = 남은 크기 폭의 4%만큼 추가. */
  fishingSizeBonusPct?: number;
  /** 현재 물때 한정 어종의 티어 내 추첨 가중치 +%. */
  fishingSpecialWeightPct?: number;
  /** 희귀 이상 어종을 낚았을 때 크기 굴림을 상한 쪽으로 추가 보정. */
  fishingRareSizeBonusPct?: number;
  /** 상위 대물권 크기 굴림일 때 크기를 상한 쪽으로 추가 보정. */
  fishingBigCatchSizeBonusPct?: number;
  // ── 길드 훈련장(비전투) — 개인 훈련 수령 서버 판정에서만 소비. 전투 derive 와 무관.
  /** 길드 훈련장 개인 훈련 숙련도 보상 +%. */
  guildTrainingRewardBonusPct?: number;
  /** 주간 훈련 보너스가 발동할 때 추가로 받는 직업 숙련도. */
  guildTrainingWeeklyBonusMastery?: number;
  // ── 농장(비전투) — 수확 서버 판정에서만 소비. 전투 derive 와 무관.
  /** 수확량 보너스 +%. 1개 미만의 보너스는 다음 수확에 누적해 지급한다. */
  farmYieldBonusPct?: number;
  /** 희귀 수확 확률 +%p. */
  farmRareChancePct?: number;
  // ── 요리(비전투) — 조리 서버 판정에서만 소비. 전투 derive 와 무관.
  /** 요리로 얻는 경험치 +%. */
  cookingXpBonusPct?: number;
  /** 정성작 판정 확률 +%p. */
  cookingCarefulChancePct?: number;
  /** 희귀 재료를 제외한 묶음 조리 재료 소모량 감소 +%. */
  cookingMaterialReductionPct?: number;
  /** 걸작 판정 확률 +%p. */
  cookingMasterpieceChancePct?: number;
  /** 사용한 희귀 재료를 보존할 확률 +%p. 음식의 특선 효과는 유지된다. */
  cookingRareIngredientSaveChancePct?: number;
  /** 현재 벌목 실패율을 상대적으로 줄이는 비율. 20 = 실패율 ×0.8. */
  woodcuttingFailureReductionPct?: number;
  /** 벌목 소요 시간을 상대적으로 줄이는 비율. */
  woodcuttingDurationReductionPct?: number;
  /** 실패 판정 뒤 성공으로 구제할 확률 +%p. */
  woodcuttingFailureRecoveryPct?: number;
  /** 성공 시 같은 수종의 원목을 1개 더 얻을 확률 +%p. */
  woodcuttingBonusLogChancePct?: number;
  /** 현재 채광 실패율을 상대적으로 줄이는 비율. 20 = 실패율 ×0.8. */
  miningFailureReductionPct?: number;
  /** 채광 소요 시간을 상대적으로 줄이는 비율. */
  miningDurationReductionPct?: number;
  /** 실패 판정 뒤 성공으로 구제할 확률 +%p. */
  miningFailureRecoveryPct?: number;
  /** 성공 시 같은 광석을 1개 더 얻을 확률 +%p. */
  miningBonusOreChancePct?: number;
  /** 전체 속도를 공격력 %로 환원(점근, 값=상한%). */
  spdToAtkMaxPct?: number;
  /** 흑월지배 — 행운 1당 속도 가산 계수. 순수 LUK 암살 계보의 행동 빈도를 복구한다. */
  spdPerLukCoef?: number;
  /** 흑월지배 — 행운 1당 물리 공격력 가산 계수. */
  atkPerLukCoef?: number;
  /** 치명 한계 확장 — 치명 오버플로(75% 초과 크리뎀)를 평타뿐 아니라 스킬에도 적용. */
  skillCritOverflow?: boolean;
  /** 스킬 치명타 피해 +% — 액티브 스킬의 기본 치명타 배율(1.7)에 /100만큼 가산. */
  skillCritDmgPct?: number;
  /** 장비 치명타 배율을 점근 곡선으로 변환해 직접 마법 스킬의 치명타 배율에 가산. */
  equipmentMagicSkillCritConversion?: boolean;
  /** 흑월지배 — 회피 성공 후 다음에 적중하는 직접 피해 액티브 스킬을 확정 치명타로 만든다. */
  skillCritAfterEvade?: boolean;
  /** 절초 — 누적 적중 4타째마다 해당 타격 피해 +%. 다단 액티브 스킬과 평타가 같은 카운터를 공유. */
  comboFinisherBonusPct?: number;
  /** 평타에만 적용되는 대상 방어 관통 %p. */
  basicDefPenetrationPct?: number;
  /** 평타 치명타 뒤 다음 행동 간격을 한 번 단축하는 비율. */
  basicCritHastePct?: number;
  /** 평타 치명타 확률 상한. 75% 초과분의 피해 전환 기준은 바꾸지 않는다. */
  basicCritChanceCap?: number;
};

// 스킬 학습 비용 — 숙달 포인트로 지불. 티어별 단가를 기본으로 하며, per-skill override 가 우선.
// 스타터(자동 보유)는
// 학습 경로를 타지 않는다. 승리당 +proficiencyPerKillAtDepth(깊이 밴드 비례 2~3) 포인트 기준 →
// 들판 기준 ~750승/종, 잊힌 성소 이후 ~500승/종. learn-skill 라우트(차감) + state 라우트(UI 가격 표기)가 참조.
export const V2_SKILL_LEARN_COST_COMMON = 1500; // tier1(입문) 기본 단가.
// 학습 비용 tier 스케일(숙달 포인트) — 입문/중급/상급. per-skill learnCost 오버라이드가 우선.
export const V2_SKILL_LEARN_COST_BY_TIER: Record<1 | 2 | 3, number> = {
  1: 1500,
  2: 3000,
  3: 5000,
};
export function v2SkillLearnCost(skillId: V2SkillId): number {
  const def = V2_SKILLS[skillId];
  if (def?.learnCost != null) return def.learnCost;
  return V2_SKILL_LEARN_COST_BY_TIER[def?.tier ?? 1] ?? V2_SKILL_LEARN_COST_COMMON;
}

// 스킬 카탈로그 id — union 으로 컴파일타임 검증.
export type V2SkillId =
  // ── Tier 1 스타터 (Lv1 자동 보유) ───────────────────────────────────
  | "v2_skill_strike" // STR 강타
  | "v2_skill_flurry" // DEX 연격
  | "v2_skill_recover" // VIT 회복
  | "v2_skill_dash" // SPD 질주
  | "v2_skill_fortune" // LUK 행운
  | "v2_skill_meditate" // INT 집중
  // ── 몬스터 전용 상태이상 (PR-9) — 플레이어 미학습, 몹 v2Skills 로만 ──────
  | "mob_venom_bite" // 독니 — 중독(DoT)
  | "mob_chilling_touch" // 한기 — 둔화(속도−)
  | "mob_rending_claw" // 살점 뜯기 — 출혈(DoT)
  | "mob_catastrophe_venom" // 재앙독 — 중독 2스택
  | "mob_venom_sunder" // 맹독 파쇄 — 중독 2스택 + 방어 약화
  | "mob_deep_chill" // 심층 한기 — 강화 둔화
  | "mob_glacial_chill" // 혹한 — 최종 강화 둔화
  // (위 3종은 V2MonsterStatusSkillId 로도 재노출 — 몹 부착 타입 안전)
  // ── 몬스터 전용 마법 시전 (사냥터 마법몹 castSkill) — scaling magic·플레이어 미학습 ──
  | "mob_arcane_bolt" // 마력탄 — 마법 단일딜(magicDef 경감)
  | "mob_arcane_burst" // 비전 작렬 — 강한 마법 단일딜
  // ── 몬스터 전용 시그니처 액티브 (특수 몹·협동 보스) — mpCost>0 + 유한 v2MaxMp 로 시전 횟수 제한 ──
  | "mob_crushing_blow" // 분쇄 일격 — 강한 물리 단일딜
  | "mob_savage_roar" // 포효 — 자버프 ATK↑(3턴)
  | "mob_arcane_nova" // 비전 폭발 — 강한 마법 단일딜
  // ── 스킬 재설계 — 공용 액티브 18종 (직군당 5, 예기 패시브 제외) ───
  | V2CommonSkillId;

// 스킬 효과 — 복합 가능 (효과 배열에 여러 개).
// 단위 규칙: pct·pctMaxHp 는 "정수 퍼센트 단위" (10 = 10%). 후속 전투 wiring 에서
// 0.10 으로 오해 금지. damage 의 statCoef 는 배율 (1.0 = 1×공격력).
// scaling (PR-magic): damage 가 어느 공격력으로 스케일하는지. 미지정/"physical" = 물리 atk,
// "magic" = 마법 공격력(magicAtk = INT 환산). INT 공격 스킬만 "magic" — 마법 빌드가
// 물리 atk 없이도 데미지를 내는 별도 경로. DEF 는 물리·마법 공유(마법저항 미신설).
// dot = 지속 피해 (DoT). tag 별로 스택 누적, label 은 UI 표시용. DEF 무시.
// PR-9 — 몬스터 전용 상태이상 스킬 id (DungeonEnemy.statusSkill 부착 타입 안전).
export type V2MonsterStatusSkillId =
  | "mob_venom_bite"
  | "mob_chilling_touch"
  | "mob_rending_claw"
  | "mob_catastrophe_venom"
  | "mob_venom_sunder"
  | "mob_deep_chill"
  | "mob_glacial_chill";

// 몬스터 전용 마법 시전 스킬 id (DungeonEnemy.castSkill 부착 타입 안전). 사냥터 마법몹이
//   마법 평타 대신 시전(시전 턴엔 평타 생략 → DPS 대략 중립·"체감"↑). scaling magic → 플레이어
//   magicDef(정신)로 경감. attackerMagicAtk 미지정(몹) → atk 폴백(combatShared). statusSkill 과 병합 가능.
export type V2MonsterCastSkillId = "mob_arcane_bolt" | "mob_arcane_burst";

// baseFlatByTier: 회복 계열의 전문화 차수 flat 성장(2/3/4차). 직접 피해에 남아 있는
//   baseFlat/baseFlatByTier 값은 구 카탈로그·SP 가격 호환용이며 전투·표시에서는 무시한다.
// scaling "def": 방어비례딜(방패 가격) — atk/magicAtk 대신 DEF 스케일.
// scaling "vit": VIT 비례 딜(나한권) — 금강(VIT 앵커) 정체성, 기사 DEF비례와 다른 축.
//   def/vit/dex/luk/spi/all/maxHp 은 시전자 그 스탯 값이 필요 → 엔진(combatShared.damageWith) 배선
//   (미배선 스탯은 physical 대체). spi 는 마법 방어를 상대하고, 나머지는 물리 방어를 상대한다.
//   원시 스탯 직접 비례딜은 파생 공격력보다 값이 크므로 계수를 작게 잡는다.
export type V2DamageScaling =
  | "physical"
  | "magic"
  | "def"
  | "vit"
  | "dex"
  | "luk"
  | "spi"
  | "all"
  | "maxHp";
export type V2SkillEffect =
  | {
      kind: "damage";
      /** 공격력/마법공격력 기반 계수. 미지정이면 스킬 차수와 타격 수로 기본값을 정한다. */
      attackCoef?: number;
      /** 순수 물리·마법 스킬의 STR/INT 직접 계수. 미지정이면 공통 차수 공식을 사용한다. */
      primaryStatCoef?: number;
      statCoef: number;
      baseFlat?: number;
      baseFlatByTier?: readonly [number, number, number];
      scaling?: V2DamageScaling;
      // 관통(방어 무시) 추가타 — 이 타의 "방어 미적용(0방어) 피해"의 pierceDamagePct% 를
      //   방어로 감산되지 않는 추가 데미지로 더한다(같은 타에 합산). 미지정=0(관통 없음).
      //   고방어 적일수록 본타는 줄지만 관통분은 그대로라 "꿰뚫는" 페이오프(관통사).
      pierceDamagePct?: number;
    }
  // pctLostHp: 잃은 체력 비례 회복. statCoef/baseFlatByTier/scaling: 스탯 계수 회복.
  | {
      kind: "heal";
      pctMaxHp?: number;
      flat?: number;
      pctLostHp?: number;
      statCoef?: number;
      baseFlatByTier?: readonly [number, number, number];
      scaling?: V2DamageScaling;
    }
  // 이번 스킬로 가한 피해량의 pct% 만큼 회복. 회복량 증가 보정은 적용하지 않는다.
  // basis 미지정은 기존처럼 방어·보호막 적용 전 명목 피해를 사용한다.
  | {
      kind: "healFromDamage";
      pct: number;
      basis?: "nominal" | "actual";
    }
  | { kind: "selfBuff"; stat: StatKey; pct: number; turns: number }
  // 파생 스탯 버프 — StatKey 밖(회피=선풍각, 크리율=연환 집중, 받피감 등).
  | { kind: "selfBuffPct"; target: "evasion" | "crit" | "damageReduction" | "reflectDamage"; pct: number; turns: number }
  // 매턴 HP 리젠(운기).
  | { kind: "selfRegen"; pctMaxHpPerTurn: number; turns: number }
  // 보호막 — maxHP·maxMP 비례 흡수(마나 보호막).
  | { kind: "shield"; pctMaxHp?: number; pctMaxMp?: number; turns: number }
  // 마나 회복(명상).
  | { kind: "manaRestore"; pctMaxMp: number }
  // 다음에 받는 공격을 count회 반드시 회피. 기존 보장 회피 스택과 합산해 피격 직전에 소비한다.
  | { kind: "guaranteedEvade"; count: number }
  | { kind: "enemyDebuff"; stat: StatKey; pct: number; turns: number }
  // 취약 — 적 받는 피해 +%(속박 사격). 스턴 금지 룰 대체.
  | { kind: "enemyVuln"; pct: number; turns: number }
  // 원소술사 — 빛(실명: 적 회피 -%p) / 어둠(암흑: 적 명중 -%p). 타겟 디버프(enemyVuln 미러).
  | { kind: "enemyEvasionDown"; pct: number; turns: number }
  | { kind: "enemyAccuracyDown"; pct: number; turns: number }
  // 원소술사 ATB 템포 — 바람(내 다음 행동 필요 ms −pct%) / 대지(적 다음 행동 필요 ms +pct%).
  //   1회성(turns 없음) — 시전 직후 ATB 타임라인 틱에 즉시 반영. legacy(턴제)에선 inert.
  | { kind: "selfHaste"; pct: number }
  | { kind: "enemyDelay"; pct: number }
  // 화상(원소술사 불) — 적 회복 효과(회복 스킬·재생) −pct% (N턴). 흡혈/공격파생 회복은 제외.
  | { kind: "enemyHealReduce"; pct: number; turns: number }
  // 쇠약 — 적이 주는 모든 직접 피해 −pct% (평타·스킬). STR 감소와 달리 마법형 적에게도 유효.
  | { kind: "enemyDamageDown"; pct: number; turns: number }
  // 금제 — 적 스킬 발동률 −pct%p. 완전 침묵 대신 확률을 깎는 소프트 CC.
  | { kind: "enemySkillProcDown"; pct: number; turns: number }
  // 침식 — 적이 받는 DoT 틱과 마법취약 스택 폭발 피해 +pct%.
  | { kind: "enemyDotVuln"; pct: number; turns: number }
  // HP 소모 딜 — 현재 HP pctCurrentHp% 소모 + 소모량×soakRatio 추가딜(사혈격).
  | {
      kind: "hpCostDamage";
      pctCurrentHp: number;
      /** 추가 피해 계산에서 현재 HP로 간주할 최대 HP 대비 최저 비율. 실제 HP 소모에는 미적용. */
      soakCurrentHpFloorPct?: number;
      /** 공격력/마법공격력 기반 계수. 미지정이면 스킬 차수 기본값. */
      attackCoef?: number;
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      soakRatio: number;
      scaling?: V2DamageScaling;
    }
  // 광전사·패황 단발 필살 — 잃은 체력 비율로 기본 피해 전체를 증폭한다.
  // selfCurrentHpCostPct가 있으면 명중 뒤 예상 체력을 기준으로 잃은 체력을 계산한다.
  | {
      kind: "missingHpDamage";
      attackCoef: number;
      statCoef: number;
      missingHpCoef: number;
      selfCurrentHpCostPct?: number;
      scaling: "physical";
    }
  // 힐→딜 — 자힐 후 힐량×damageRatio 적에게 딜(신성 강타).
  | {
      kind: "healToDamage";
      healStatCoef: number;
      healFlatByTier?: readonly [number, number, number];
      damageRatio: number;
      scaling?: V2DamageScaling;
    }
  // 처형 — 적 HP hpThresholdPct% 이하 시 데미지×bonusMult(처단).
  | {
      kind: "executeDamage";
      /** 공격력/마법공격력 기반 계수. 미지정이면 스킬 차수 기본값. */
      attackCoef?: number;
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      hpThresholdPct: number;
      bonusMult: number;
      scaling?: V2DamageScaling;
    }
  // 기습 — 처형의 역. 적 HP hpThresholdPct% "이상"(풀피)일 때 데미지×bonusMult(암살자 오프너).
  //   기본딜은 낮게 잡고 배수는 크게 — 첫 턴 알파 1회용. 그 외(적 HP 깎인 뒤)엔 약한 평타 이하.
  | {
      kind: "ambushDamage";
      /** 공격력/마법공격력 기반 계수. 미지정이면 스킬 차수 기본값. */
      attackCoef?: number;
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      hpThresholdPct: number;
      bonusMult: number;
      /** PvP에서만 사용할 조건부 배율. 미지정이면 bonusMult를 그대로 사용한다. */
      pvpBonusMult?: number;
      scaling?: V2DamageScaling;
    }
  // 스택 비례 딜 — 적 DoT/취약 스택당 추가딜(참절·중독 폭발·비전 작렬).
  | {
      kind: "stackPayoffDamage";
      tag: "bleed" | "poison" | "magicVuln";
      /** 공격력/마법공격력 기반 계수. 미지정이면 스킬 차수 기본값. */
      attackCoef?: number;
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      perStackFlat: number;
      /** 보상 계수만 올리고 기존 SP 평가를 유지할 때 쓰는 스택당 피해 산정 기준. */
      spCostPerStackFlat?: number;
      scaling?: V2DamageScaling;
    }
  | {
      kind: "dot";
      tag: "bleed" | "poison" | "burn";
      label: string;
      stacks: number;
      maxStacks: number;
      turns: number;
      flatPerStack: number;
      atkCoefPerStack: number;
      pctMaxHpPerStack: number;
    };

// 학습 조건 — 교관 화면에서 사용. 충족 안 되면 구매 차단.
export type V2SkillLearnRequirement = {
  goldCost: number;
  level?: number;
  stat?: { key: StatKey; min: number };
  /** 선행 스킬 — 모두 학습 보유해야. */
  prereqSkillIds?: readonly V2SkillId[];
};

export type V2SkillDefinition = {
  id: V2SkillId;
  name: string;
  /** 분류 메타데이터 — 교관 NPC 그룹화 + 데미지 스케일링 기본 stat. selfBuff/enemyDebuff
   *  effect 는 자체 stat 필드를 가지므로 그쪽은 이 값과 무관. */
  stat: StatKey;
  category: V2SkillCategory;
  /** 1=입문 (스타터), 2=중급, 3=상급. 카탈로그 정렬·교관 화면 그룹화. */
  tier: 1 | 2 | 3;
  description: string;
  mpCost: number;
  /** 공식 대신 쓰는 절대 MP 비용. 고비용 주문/회복처럼 직업별 수동 튜닝이 필요한 스킬용. */
  fixedMpCost?: number;
  /** 발동 후 N턴 동안 재발동 불가. 0 = 매 턴 가능. */
  cooldown: number;
  /** 발동 확률 % (0~100). 미지정=100=조건 충족 시 항상 발동. <100 이면 매 발동 판정마다
   *  procRoll 롤 — 실패하면 미발동(평타로 폴백, MP·쿨다운 미소모). 스킬 발동확률 패시브 토대. */
  procChance?: number;
  /** 결투가 계보의 준비형 선언. 실제 효과는 장착한 선언을 합성해 전투 상태에 만든다. */
  duelistDeclaration?: {
    rank: 1 | 2 | 3 | 4;
    hits: 3 | 4 | 5;
    basicDamagePct?: number;
    basicCritChancePct?: number;
    basicDefPenetrationPct?: number;
    rampPctPerPriorHit?: number;
    basicCritMultAdd?: number;
    basicCritChanceCap?: number;
  };
  /** 개별 스킬 전투 리듬. 차수·직업 보정 뒤 마지막 발동률 미세 조정에 사용한다. */
  tempo?: V2SkillTempo;
  effects: readonly V2SkillEffect[];
  /** 이 액티브에만 적용되는 치명타 확률 가산(%p). */
  skillCritChancePct?: number;
  /** 이 액티브에만 적용되는 명중도 가산(%p). */
  accuracyBonusPct?: number;
  /** 적중한 시전 1회당 대상에게 쌓는 한기. 다단 피해여도 한 번만 적용한다. */
  frostChillGain?: number;
  /** 도발 시 사냥·PvP 상대가 즉시 시전자에게 가하는 기본 공격 횟수. */
  provokeImmediateBasicAttacks?: number;
  /** 철벽 태세 — 시전 시 갱신할 전용 반사 횟수와 피격 효과. */
  ironWallReflect?: {
    charges: number;
    damageReductionPct: number;
    reflectDefPct: number;
  };
  /** 시전 성공 시 장착한 삼중 결계를 최대 횟수로 갱신한다. */
  refreshTripleWards?: boolean;
  /** 적중 시 현재 충격을 모두 소비해 최종 피해를 강화하는 방패 계열 직접 공격. */
  consumesFortressImpact?: boolean;
  /** 정상 시전 확정 시 현재 법칙 각인을 모두 소비해 동적 효과를 만든다. */
  consumesLawInscriptions?: boolean;
  /** 시전 뒤 중량을 얻는 양. 피해 계산에는 시전 전 중량을 사용한다. */
  mutationWeightGain?: number;
  /** 현재 중량을 모두 소비하고 스택당 최종 피해를 높이는 비율. */
  mutationWeightConsumePctPerStack?: number;
  /** PR-5b 스킬 속성 — 부여 시 이 스킬 데미지는 이 속성으로 상성 적용(없으면 캐릭 속성).
   *  무기 속성(평타)보다 우선 — 공허 마법사가 "불 마법"을 쓰면 그 스킬만 불 상성. */
  element?: V2Element;
  /** 원소술사 — 캐릭터 속성별 효과 분기. 지정 시 시전 시점에 elementEffects[캐릭속성] 을 effects
   *  대신 적용(매칭 없으면 effects 폴백=무속성). 기존 스킬은 미지정 → effects 그대로(byte-identical). */
  elementEffects?: Partial<Record<V2Element, readonly V2SkillEffect[]>>;
  /** 전투 로그에 스킬명을 "{캐릭속성라벨} 마법" 으로 동적 표기(원소술사 "속성 마법"→"불 마법" 등). */
  elementNamed?: boolean;
  /** PR-9 — 몬스터 전용 스킬(상태이상 부착). 플레이어 교관/학습 UI 에서 제외, 몹만 v2Skills 로 보유. */
  monsterOnly?: boolean;
  /** 스타터 (자동 보유) 는 learn 미사용. tier>=2 부터 교관 구매. */
  learn?: V2SkillLearnRequirement;
  /** SP 로드아웃 코스트(코어루프) — 생활 스킬은 항상 0, 나머지는 미지정 시
   *  (category, tier) 루브릭 표(spCostOf)에서 도출. PR-5 sim 튜닝 때 아웃라이어만 명시 override. */
  spCost?: number;
  /** 성능 루브릭 산정 뒤 적용하는 명시 할인. 결과 SP는 최소 1. */
  spCostDiscount?: number;
  /** 저장 패턴이 없을 때 사용할 스킬별 스마트 기본 조건과 전역 우선순위. */
  defaultPattern?: {
    priority: number;
    condition: V2CombatCondition;
  };
  /** 같은 그룹에서는 한 스킬만 장착할 수 있다. */
  exclusiveGroup?: string;
  /** 배타 그룹의 마이그레이션 우선순위. 높은 단계가 기존 중첩 장착에서 살아남는다. */
  exclusiveRank?: number;
  /** 학습 비용 오버라이드(숙달 포인트) — 미지정이면 tier 스케일(V2_SKILL_LEARN_COST_BY_TIER). */
  learnCost?: number;
  /** 패시브 스킬(category "passive") 의 상시 효과 — 장착 시 derive 가 적용(캐스트 아님).
   *  액티브 스킬은 미지정. 직업 킷 재설계 — 근력/강건/총명/예기 등. */
  passive?: V2PassiveSkillEffect;
  /** 장착 시너지 — 특정 스킬이 로드아웃에 함께 있을 때 시전 효과를 추가한다.
   *  문장술사처럼 저차 패시브를 보존하는 빌드에 보상을 주기 위한 액티브 전용 확장. */
  equippedSynergies?: readonly {
    requiredSkillId?: V2SkillId;
    requiredSkillIds?: readonly V2SkillId[];
    effects: readonly V2SkillEffect[];
  }[];
  /** 주문식 변형 — 보유·장착한 하위 스킬 조합에 따라 액티브의 이름과 전체 효과를 교체한다.
   *  위에서부터 첫 번째로 조건을 만족한 변형을 사용하므로, 오원소→복합→단일→보유 전용처럼
   *  구체적인 조합을 먼저 선언한다. equipped 는 learned 의 부분집합이지만 두 조건을 분리해
   *  "보유로 주문식 해금, 장착으로 전투 효과 활성" 규칙을 데이터에서 명시할 수 있다. */
  castVariants?: readonly {
    name: string;
    requiredLearnedSkillIds?: readonly V2SkillId[];
    requiredEquippedSkillIds?: readonly V2SkillId[];
    effects: readonly V2SkillEffect[];
  }[];
  /** PoB식 빌드 탐색 태그. 생략 시 스탯·효과·패시브 기반 태그를 자동 추론한다. */
  buildTags?: readonly V2BuildTagId[];
  /** 속성 장착 시너지 — 특정 패시브를 함께 장착하면 현재 캐릭터 속성의 효과 배열을 강화판으로 교체한다. */
  elementEffectSynergies?: readonly {
    requiredSkillId: V2SkillId;
    elementEffects: Partial<Record<V2Element, readonly V2SkillEffect[]>>;
  }[];
  /** 전투당 1회만 시전 가능. 시전 후 해당 전투가 끝날 때까지 쿨다운으로 잠근다. */
  oncePerBattle?: boolean;
  /** 7차 전용 전투 규칙. 점수 계산과 런타임이 같은 수치를 읽는다. */
  tier7Mechanic?: Tier7Mechanic;
  /** 출혈 유지형 수인 계보. 전투·표기·성능 점수가 같은 선언을 읽는다. */
  bleedHunt?: BleedHuntMechanic;
};

// === SP 코스트 = 스킬 성능(power)에 비례 (2026-06-21 재설계) ====================
// 옛 (category, tier) 표는 차수만으로 가격을 매겨, 같은 차수의 강·약 스킬이 같은 값이고 차수 간
// 격차도 작았다(저렴=약함 트레이드오프 붕괴, 오너 피드백 "성능에 비례해 책정하라"). 대신 각 스킬의
// effects/passive 를 합산한 power 점수를 산출해 그에 비례하는 원시 코스트를 도출한다.
//   - power 단위 ≈ "ATK 한 방 가치"(dmg(1.0,140) ≈ 1.0). 카테고리 교차 정규화.
//   - 액티브는 발동확률(procChance)로 가중(신뢰성=성능) — 단 √소프트닝으로, 큰 한방·저확률
//     스킬이 "기댓값 낮음"으로 너무 싸지지 않게(원시 ×proc 면 최강 누크가 최저가가 되는 역전 방지).
//   - 실제 MP 비용도 같은 직업군·차수의 기준 비용과 비교한다. 저비용/무료 액티브는 효율 할증,
//     고비용 액티브는 자원 제약 할인. 극단값이 효과 점수를 압도하지 않도록 0.8~1.2로 제한한다.
//   - 패시브는 상시 효과라 발동 가중 없이 효과 크기 합산.
//   - 1~5 SP는 그대로 두고, 5 초과분은 60%만 반영해 중·고비용 구간의 조합 경직을 완화한다.
const SP_FLAT_NORM = 140; // 실제로 남아 있는 회복·DoT·스택 고정값의 정규화 기준.
// 순수 STR/INT 스킬은 공격력 계수 일부를 주스탯 직접항으로 이전한다. 이전 후 같은 실전급
// 캐릭터의 총 피해가 거의 중립이므로 SP 가격이 계수 표기만 보고 뛰지 않게 기준 비율을 맞춘다.
const SP_REFERENCE_PRIMARY_STAT_TO_ATTACK = 0.36;
const SP_REFERENCE_SPECIALIZED_STAT_TO_ATTACK: Record<
  Exclude<V2DamageScaling, "physical" | "magic">,
  number
> = {
  def: 0.7,
  vit: 0.6,
  dex: 0.6,
  luk: 0.6,
  spi: 0.6,
  all: 2.5,
  maxHp: 8,
};
// 패시브 SP 할인 — 패시브는 상시 효과라 성능비례 루브릭이 다소 과청구되는 면(같은 power 라도
//   액티브는 발동 조건/빈도 제약이 있으나 패시브는 항상 켜짐). 코스트만 할인(power 점수는 불변).
const SP_PASSIVE_DISCOUNT = 0.75;

type V2DirectDamageEffect = Extract<
  V2SkillEffect,
  {
    kind:
      | "damage"
      | "hpCostDamage"
      | "missingHpDamage"
      | "executeDamage"
      | "ambushDamage"
      | "stackPayoffDamage";
  }
>;

function isDirectDamageEffect(e: V2SkillEffect): e is V2DirectDamageEffect {
  return (
    e.kind === "damage" ||
    e.kind === "hpCostDamage" ||
    e.kind === "missingHpDamage" ||
    e.kind === "executeDamage" ||
    e.kind === "ambushDamage" ||
    e.kind === "stackPayoffDamage"
  );
}

function isSpecializedDamageScaling(scaling?: V2DamageScaling): boolean {
  return scaling != null && scaling !== "physical" && scaling !== "magic";
}

function spAvgTier(byTier?: readonly [number, number, number]): number {
  return byTier ? (byTier[0] + byTier[1] + byTier[2]) / 3 : 0;
}

// HP 풀 감소를 상쇄하는 피해 전환 보정은 신규 스킬 파워로 과금하지 않는다.
const HP_COST_DAMAGE_COMPENSATION_MULT = 1.14;

function spDirectDamageValue(
  def: V2SkillDefinition,
  effect: V2DirectDamageEffect,
  directDamageEffectCount: number,
): number {
  // 몬스터 스킬은 아직 고정 피해를 실제 전투에서 사용한다. 플레이어 스킬만 런타임과 동일하게
  // 폐기된 baseFlat/baseFlatByTier를 제외하고 공격력·특화 스탯 계수로 평가한다.
  if (def.monsterOnly) {
    const legacyFlat =
      ("baseFlat" in effect ? effect.baseFlat ?? 0 : 0) +
      ("baseFlatByTier" in effect ? spAvgTier(effect.baseFlatByTier) : 0);
    return effect.statCoef + legacyFlat / SP_FLAT_NORM;
  }

  const specialized = isSpecializedDamageScaling(effect.scaling);
  const resolvedAttackCoef = v2SkillAttackCoef({
    tier: def.tier,
    statCoef: effect.statCoef,
    specialized,
    directDamageEffectCount,
    attackCoef: effect.attackCoef,
  });
  if (!specialized) {
    const scale = effect.scaling === "magic" ? "magic" : "physical";
    const pure = v2PureSkillFormulaCoefficients({
      tier: def.tier,
      scaling: scale,
      directDamageEffectCount,
      resolvedAttackCoef,
    });
    return (
      pure.attackCoef +
      ((effect.kind === "damage" && effect.primaryStatCoef != null
        ? effect.primaryStatCoef
        : pure.uncompensatedPrimaryStatCoef) /
        V2_DIRECT_SKILL_STAT_COEF_MULT) *
        SP_REFERENCE_PRIMARY_STAT_TO_ATTACK
    );
  }

  return (
    resolvedAttackCoef +
    effect.statCoef *
      SP_REFERENCE_SPECIALIZED_STAT_TO_ATTACK[
        effect.scaling as Exclude<V2DamageScaling, "physical" | "magic">
      ]
  );
}

function spMpEfficiencyMultiplier(def: V2SkillDefinition): number {
  if (def.passive) return 1;
  const actual = v2SkillMpCostValue(def);
  if (actual <= 0) return 1.12;
  const baseline = Math.max(
    1,
    Math.round(
      MP_REFERENCE_POOL * MP_BASE_PCT * mpArchetypeMult(def.id) * MP_TIER_MULT[def.tier],
    ),
  );
  return Math.min(1.2, Math.max(0.8, Math.sqrt(baseline / actual)));
}

// 액티브 effect 1개의 가치(공격력 1회 등가 단위). 직접 피해는 실제 런타임 계수와 같은 공식을
// 사용한다. 전투에서 제거된 플레이어 baseFlat/baseFlatByTier는 가격에도 반영하지 않는다.
function spEffectValue(
  def: V2SkillDefinition,
  e: V2SkillEffect,
  directDamageEffectCount: number,
): number {
  switch (e.kind) {
    case "damage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      // 관통분은 0방어 피해를 기준으로 추가되므로 일반 계수보다 가치가 높지만, 모든 적이
      // 고방어는 아닌 점을 반영해 표기 수치의 75%만 평균 가치로 환산한다.
      return base * (1 + ((e.pierceDamagePct ?? 0) / 100) * 0.75);
    }
    case "hpCostDamage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      const expectedCurrentHpRatio = 0.7;
      const expectedSoakHpRatio = Math.max(
        expectedCurrentHpRatio,
        (e.soakCurrentHpFloorPct ?? 0) / 100,
      );
      const hpToAttackRatio = SP_REFERENCE_SPECIALIZED_STAT_TO_ATTACK.maxHp;
      const soakValue =
        expectedSoakHpRatio *
        (e.pctCurrentHp / 100) *
        hpToAttackRatio *
        (e.soakRatio / HP_COST_DAMAGE_COMPENSATION_MULT);
      const selfCostDiscount = 1 - Math.min(0.25, (e.pctCurrentHp / 100) * 1.25);
      return (base + soakValue) * selfCostDiscount;
    }
    case "missingHpDamage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      // 필살기를 쓰는 평균 시점을 HP 50%로 잡고, 자해가 있는 기술은 그 위험만큼 할인한다.
      const expectedMissingHpRatio = 0.5;
      const selfCostDiscount =
        1 - Math.min(0.25, ((e.selfCurrentHpCostPct ?? 0) / 100) * 1.25);
      return base * (1 + expectedMissingHpRatio * e.missingHpCoef) * selfCostDiscount;
    }
    case "healToDamage": {
      const base = e.healStatCoef + spAvgTier(e.healFlatByTier) / SP_FLAT_NORM;
      return base * (1 + 0.5 * e.damageRatio); // 자힐 + 미러 데미지.
    }
    case "executeDamage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      // 일반 몬스터는 런타임에서 최소 35% 처형 창을 받는다. 전체 전투 중 조건 구간의 70%를
      // 실현한다고 보고 보너스 배수를 가중한다.
      const effectiveThreshold = Math.max(35, e.hpThresholdPct) / 100;
      return base * (1 + effectiveThreshold * 0.7 * (e.bonusMult - 1));
    }
    case "ambushDamage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      return (
        base *
        (1 + (e.hpThresholdPct / 100) * 0.2 * (e.bonusMult - 1))
      ); // 풀피 오프너 1회라 처형보다 약하게 평가.
    }
    case "stackPayoffDamage": {
      const base = spDirectDamageValue(def, e, directDamageEffectCount);
      const pricedPerStackFlat = e.spCostPerStackFlat ?? e.perStackFlat;
      return base + (pricedPerStackFlat / SP_FLAT_NORM) * 2 * 0.6; // ~2 스택·조건부.
    }
    case "dot": {
      const perStack =
        e.flatPerStack / SP_FLAT_NORM + e.atkCoefPerStack + e.pctMaxHpPerStack / 12;
      // 중독은 5턴 완주 전에 적이 쓰러지거나 재시전으로 지속시간이 갱신되는 비중이 크다.
      // 전 틱을 신규 피해처럼 합산하면 고차 독 스킬 비용을 과대평가하므로 실현율을 반영한다.
      const durationRealization = e.tag === "poison" ? 0.55 : 1;
      return e.stacks * e.turns * perStack * durationRealization;
    }
    case "heal":
      return (
        (e.pctMaxHp ?? 0) / 16 +
        (e.pctLostHp ?? 0) / 16 +
        (e.flat ?? 0) / SP_FLAT_NORM +
        (e.statCoef ?? 0) +
        spAvgTier(e.baseFlatByTier) / SP_FLAT_NORM
      );
    case "healFromDamage":
      return e.pct / 18;
    case "shield":
      // 엔진의 보호막은 만료 턴 없이 소진될 때까지 유지된다. turns는 가격에 쓰지 않는다.
      return ((e.pctMaxHp ?? 0) + (e.pctMaxMp ?? 0)) / 16;
    case "selfRegen":
      return (e.pctMaxHpPerTurn * e.turns) / 16;
    case "manaRestore":
      return e.pctMaxMp / 20;
    case "guaranteedEvade":
      return Math.max(0, e.count) * 1.5;
    case "selfBuff":
    case "enemyDebuff":
    case "enemyEvasionDown":
    case "enemyAccuracyDown":
      return (e.pct * e.turns) / 60;
    case "selfBuffPct":
    case "enemyVuln":
      return (e.pct * e.turns) / 50; // 파생/증폭 버프는 약간 더 강하게.
    case "enemyHealReduce":
      return (e.pct * e.turns) / 90; // 니치(주로 PvP).
    case "enemyDamageDown":
      return (e.pct * e.turns) / 65;
    case "enemySkillProcDown":
      return (e.pct * e.turns) / 85;
    case "enemyDotVuln":
      return (e.pct * e.turns) / 75;
    case "selfHaste":
    case "enemyDelay":
      return e.pct / 60; // 1회성 ATB 템포(턴 없음).
  }
  const _ex: never = e;
  return _ex;
}

// 스킬 power 점수 — 액티브는 effects 합×proc×MP효율×쿨다운, 패시브는 효과 크기 합.
export function skillPowerScore(def: V2SkillDefinition): number {
  if (def.passive) {
    const p = def.passive;
    let mag = 0;
    for (const v of Object.values(p.stat ?? {})) mag += Math.abs(v ?? 0) / 10;
    // 주스탯%는 캐릭터 스탯만, HP%는 큰 기본·레벨 HP 풀을 증폭한다. 같은 숫자를 같은
    // 가격으로 보던 종전 평가를 분리해 주스탯%는 저렴하게, HP%는 비싸게 계산한다.
    for (const v of Object.values(p.statPct ?? {})) mag += Math.abs(v ?? 0) / 20;
    mag += (p.maxHpPct ?? 0) / 8;
    mag += (p.maxMpPct ?? 0) / 12;
    mag += (p.mpCostReductionPct ?? 0) / 20;
    // 마나 실드는 기존 전역 INT 장벽을 2차 마법사 패시브로 옮긴 것이므로,
    // 기존 총명 II 장착자의 SP 구성이 깨지지 않게 별도 비용을 더하지 않는다.
    mag += (p.atkPerDexCoef ?? 0) * 12;
    mag += (p.critPct ?? 0) / 6;
    // 치명타 피해 25%가 회피 8%와 같은 가격이던 종전 환산은 공격 패시브를 과소평가하고
    // 회피 패시브를 과청구했다. 치명타 피해는 20%당, 회피는 10%당 power 1로 맞춘다.
    mag += (p.critDmgPct ?? 0) / 20;
    mag += (p.evasionPct ?? 0) / 15;
    mag += (p.lifestealPct ?? 0) / 4;
    mag += (p.counterChancePct ?? 0) / 12;
    mag += (p.defPct ?? 0) / 12;
    mag += (p.thornsDefPct ?? 0) / 40;
    // 적중도는 상대가 회피도에 투자한 경우에만 직접 피해 경감을 완화하고, 보장 회피는
    // 뚫지 못한다. 저회피 상대에서도 항상 작동하는 치명·주스탯과 같은 가격을 매기지 않는다.
    mag += (p.accuracyPct ?? 0) / 30;
    mag += (p.healPowerPct ?? 0) / 16;
    mag += (p.damageTakenReductionPct ?? 0) / 8;
    mag += (p.magicDefPct ?? 0) / 12;
    if (p.openingMagicDamageReductionPct) {
      mag +=
        (p.openingMagicDamageReductionPct / 10) *
        Math.sqrt((p.openingMagicDamageReductionPhases ?? 3) / 3);
    }
    if (p.tripleWardRank) mag += p.tripleWardRank === 2 ? 6 : 3;
    // 마커 패시브의 실제 추가 효과는 액티브의 조건부 시너지 쪽에서 절반 가격으로 평가한다.
    if (p.elementResonance) mag += 0.75;
    if (p.inscriptionAmplification) mag += 0.75;
    if (p.lawInscription) mag += 1;
    // 방어 감소는 여러 직업을 순회해 자유롭게 모을 수 있는 대신 높은 SP 기회비용을 치른다.
    mag += (p.poisonedEnemyDefReductionPct ?? 0) / 6;
    // 맹독은 독 계보 안에서 부식과 같은 단계별 선택지다. 각 단계의 명시 SP가
    // 같은 예산 선택을 보장하므로 generic power 루브릭에서 다시 과금하지 않는다.
    mag += (p.enemyPhysicalDefReductionPct ?? 0) / 8;
    mag += (p.enemyMagicDefReductionPct ?? 0) / 8;
    mag += (p.berserkAtkPctPerLostHpPct ?? 0) / 0.25;
    mag +=
      ((p.enemyMagicVulnPctPerStack ?? 0) / 5) *
      ((p.enemyMagicVulnApplyChancePct ?? 100) / 100);
    mag += (p.magicSkillDamagePct ?? 0) / 8;
    mag += (p.singleHitPhysicalSkillDamagePct ?? 0) / 10;
    mag += (p.spdToAtkMaxPct ?? 0) / 20;
    if (p.atkPerLukCoef) {
      mag += Math.sqrt(p.atkPerLukCoef / 0.08) * 0.35;
    }
    mag += ((p.spdPerLukCoef ?? 0) / 0.95) * 0.5;
    if (p.skillCritOverflow) mag += 0.5;
    // 스킬이 발동하고 치명타까지 발생해야 적용되는 조건부 배율이라 일반 치명 피해보다 낮게 평가한다.
    mag += (p.skillCritDmgPct ?? 0) / 60;
    if (p.equipmentMagicSkillCritConversion) mag += 3.5;
    if (p.skillCritAfterEvade) mag += 0.5;
    if (p.counterDamageUsesReflectBoost) mag += 0.5;
    mag += (p.comboFinisherBonusPct ?? 0) / 25;
    return (
      mag +
      bleedHuntPowerValue(def.bleedHunt) +
      (def.tier7Mechanic ? tier7MechanicPower(def.tier7Mechanic) : 0)
    );
  }
  const sumEffects = (effects: readonly V2SkillEffect[]): number => {
    let r = 0;
    const directDamageEffectCount = Math.max(
      1,
      effects.filter(
        (effect) =>
          effect.kind === "damage" ||
          effect.kind === "hpCostDamage" ||
          effect.kind === "missingHpDamage" ||
          effect.kind === "executeDamage" ||
          effect.kind === "ambushDamage" ||
          effect.kind === "stackPayoffDamage",
      ).length,
    );
    for (const e of effects) {
      r += spEffectValue(def, e, directDamageEffectCount);
    }
    return r;
  };
  let raw = sumEffects(def.effects);
  // 원소술사 — 시전 시 캐릭 속성별 elementEffects 변형이 effects 를 대체(보통 추가 효과로 더 강함).
  //   코스트는 단일값이라 "최강 변형" 기준으로 책정(과소평가 방지).
  if (def.elementEffects) {
    for (const variant of Object.values(def.elementEffects)) {
      if (variant) raw = Math.max(raw, sumEffects(variant));
    }
  }
  // 주문식은 한 번에 하나만 선택되므로 합산하지 않고 가장 강한 변형을 기준으로 과소평가를 막는다.
  if (def.castVariants) {
    for (const variant of def.castVariants) {
      raw = Math.max(raw, sumEffects(variant.effects));
    }
  }
  const baseVariantRaw = raw;
  if (def.equippedSynergies) {
    for (const synergy of def.equippedSynergies) {
      // 선행 스킬도 별도 SP를 내므로 본체에는 조건부 추가 효과 가치의 절반만 부담시킨다.
      raw += sumEffects(synergy.effects) * 0.5;
    }
  }
  if (def.elementEffectSynergies) {
    let strongestSynergyRaw = baseVariantRaw;
    for (const synergy of def.elementEffectSynergies) {
      for (const variant of Object.values(synergy.elementEffects)) {
        if (variant) {
          strongestSynergyRaw = Math.max(
            strongestSynergyRaw,
            sumEffects(variant),
          );
        }
      }
    }
    // 속성 시너지도 선행 패시브를 별도 장착해야 발현된다. 강화판 전체가 아니라 기본 변형을
    // 넘어서는 증분의 절반만 본체에 청구해 선행 패시브와 같은 효과를 이중 과금하지 않는다.
    raw += Math.max(0, strongestSynergyRaw - baseVariantRaw) * 0.5;
  }
  // 단일 액티브에만 적용되는 치명 확률은 상시 패시브보다 제한적이므로 낮게 평가한다.
  raw += (def.skillCritChancePct ?? 0) / 20;
  raw += (def.accuracyBonusPct ?? 0) / 30;
  raw += bleedHuntPowerValue(def.bleedHunt);
  // proc 가중 — 0~1 클램프(손상된 음수 procChance 방어). √소프트닝 + 바닥(0.35): 저확률 스킬에
  //   의미 있는 할인을 주되 최강 누크가 최저가가 되지 않게. 10%→0.56 · 30%→0.71 · 100%→1.0.
  const proc = Math.min(1, Math.max(0, (def.procChance ?? 100) / 100));
  raw *= 0.35 + 0.65 * Math.sqrt(proc);
  raw *= spMpEfficiencyMultiplier(def);
  if (def.oncePerBattle) raw *= 0.65;
  if (def.cooldown > 0) raw /= 1 + def.cooldown / 4;
  return raw + (def.tier7Mechanic ? tier7MechanicPower(def.tier7Mechanic) : 0);
}

// 성능비례 코스트 바닥(루브릭) — power 점수 → 원시 SP. 1~4차의 중·고비용 구간만 압축하고
// 5·6차는 원시 SP를 그대로 써 상위 전직의 강한 스킬이 지나치게 싸지 않게 한다.
// 기존 호출부/테스트가 rubricSpCost 이름을 쓰므로 유지(이제 "표"가 아니라 power 도출).
export function rubricSpCost(skill: V2SkillDefinition): number {
  // 패시브는 코스트만 ×SP_PASSIVE_DISCOUNT 할인(상시 효과 과청구 완화). power 점수 자체는 불변.
  const power = skillPowerScore(skill) * (skill.passive ? SP_PASSIVE_DISCOUNT : 1);
  const rawSp = Math.max(1, Math.round(0.7 + 3.0 * power));
  if (rawSp <= 5) return rawSp;
  const compressed = 5 + Math.ceil((rawSp - 5) * 0.6);
  const jobTier = combatJobTierForSkill(skill.id);
  const pricedSp =
    jobTier === 5 || jobTier === 6 || jobTier === 7 ? rawSp : compressed;
  // 조합형 액티브는 표시된 최대 효과를 혼자 내는 스킬이 아니다. 강한 주문식을 쓰려면 하위 재료
  // 스킬도 각각 SP를 지불해 함께 장착해야 하므로, 본체까지 최대 효과 전액으로 청구하면 조합 자체가
  // 성립하지 않는다. 재료 비용을 감안해 본체는 현 카탈로그 고성능 상한(16 SP)에서 제한한다.
  // 원소군주 최대 변형 기준 22→16으로 약 27% 할인되어, 오원소 선행 조건의 실전 보상이 된다.
  return skill.castVariants?.length ? Math.min(16, pricedSp) : pricedSp;
}

const LIFESTYLE_PASSIVE_KEYS = [
  "fishingSizeBonusPct",
  "fishingSpecialWeightPct",
  "fishingRareSizeBonusPct",
  "fishingBigCatchSizeBonusPct",
  "guildTrainingRewardBonusPct",
  "guildTrainingWeeklyBonusMastery",
  "farmYieldBonusPct",
  "farmRareChancePct",
  "cookingXpBonusPct",
  "cookingCarefulChancePct",
  "cookingMaterialReductionPct",
  "cookingMasterpieceChancePct",
  "cookingRareIngredientSaveChancePct",
  "woodcuttingFailureReductionPct",
  "woodcuttingDurationReductionPct",
  "woodcuttingFailureRecoveryPct",
  "woodcuttingBonusLogChancePct",
  "miningFailureReductionPct",
  "miningDurationReductionPct",
  "miningFailureRecoveryPct",
  "miningBonusOreChancePct",
] as const satisfies readonly (keyof V2PassiveSkillEffect)[];

/** 농사·낚시·요리·벌목·채광·길드 훈련처럼 전투 밖에서 적용되는 생활 스킬인지 판별한다. */
export function isLifestyleSkill(skill: V2SkillDefinition): boolean {
  const passive = skill.passive;
  return !!passive && LIFESTYLE_PASSIVE_KEYS.some((key) => key in passive);
}

/** 배운 생활 패시브는 선택형 로드아웃과 무관하게 항상 적용한다. 기존 전투 우선순위는 보존하고,
 *  누락된 생활 패시브만 학습 순서대로 뒤에 추가한다. */
export function includeLearnedLifestyleSkills(
  equipped: readonly V2SkillId[],
  learned: readonly V2SkillId[],
): V2SkillId[] {
  const next = [...equipped];
  const equippedSet = new Set<V2SkillId>(next);
  for (const id of learned) {
    const skill = V2_SKILLS[id];
    if (!skill || !isLifestyleSkill(skill) || equippedSet.has(id)) continue;
    equippedSet.add(id);
    next.push(id);
  }
  return next;
}

// 스킬 1종의 SP 코스트 — 생활 스킬은 장착 혼동을 줄이기 위해 항상 0.
//   전투 스킬의 명시 spCost override 는 "위로만"(루브릭 이상) 허용한다.
//   합의된 소량의 하향 조정은 spCostDiscount 로 별도 명시하며, 최종 비용은 최소 1 SP다.
export function spCostOf(skill: V2SkillDefinition): number {
  if (isLifestyleSkill(skill)) return 0;
  const baseCost =
    typeof skill.spCost === "number" && skill.spCost > 0
      ? Math.max(rubricSpCost(skill), Math.floor(skill.spCost))
      : rubricSpCost(skill);
  const discount = Math.max(0, Math.floor(skill.spCostDiscount ?? 0));
  return Math.max(1, baseCost - discount);
}

// 전체 액티브 리밸런싱(2026-07): 낮은 차수는 자주·약하게, 높은 차수는 덜 자주·강하게.
// 기존 30~40% 확률형은 차수별 바닥까지 올리고, 조건이 이미 throttle 하는 100% 스킬은
// 내리지 않는다. 더 자주 쓰는 대신 공격 계수·고정 피해를 낮추고 MP 비용은 유지한다.
// 패시브·몬스터·예전 공용 스타터(v2_skill_*)는 적용하지 않는다.
type CombatJobTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const ACTIVE_PROC_FLOOR_BY_JOB_TIER: Record<CombatJobTier, number> = {
  1: 75,
  2: 68,
  3: 62,
  4: 56,
  5: 50,
  6: 45,
  7: 40,
};

const ACTIVE_DAMAGE_SCALE_BY_JOB_TIER: Record<CombatJobTier, number> = {
  1: 0.65,
  2: 0.72,
  3: 0.78,
  4: 0.84,
  5: 0.9,
  6: 0.95,
  7: 1,
};

// 같은 차수 안에서도 직업의 전투 리듬이 같아지지 않게 ±2~4%p만 미세 조정한다.
// rapid=연타·궁술·기동, steady=탱커·독 누적·지속전, burst=누커·암살·광전.
type ActiveJobTempo = "rapid" | "steady" | "burst";
const ACTIVE_PROC_OFFSET_BY_TEMPO: Record<ActiveJobTempo, number> = {
  rapid: 4,
  steady: 2,
  burst: -4,
};
const ACTIVE_JOB_TEMPO: Partial<Record<string, ActiveJobTempo>> = {
  // 연타·속사·기동 — 조금 더 자주 발동.
  martial: "rapid",
  boxer: "rapid",
  archer: "rapid",
  brawler: "rapid",
  ranger: "rapid",
  warmonk: "rapid",
  spellblade: "rapid",
  sensei: "rapid",
  runeknight: "rapid",
  lightningmage: "rapid",
  windmage: "rapid",
  dragonfist: "rapid",
  heavenlybow: "rapid",
  blackmoon: "rapid",
  celestialdragon: "rapid",
  // 방어·누적·지속전 — 기본보다 살짝 안정적으로 발동.
  rogue: "steady",
  shieldman: "steady",
  venomist: "steady",
  paladin: "steady",
  guardian: "steady",
  venomancer: "steady",
  templar: "steady",
  crimsontemplar: "steady",
  crusader: "steady",
  venomlord: "steady",
  frostmage: "steady",
  earthmage: "steady",
  plaguebringer: "steady",
  immortal: "steady",
  fortressknight: "steady",
  savior: "steady",
  grandwarder: "steady",
  lawguardian: "steady",
  myriadvenom: "steady",
  beastwarrior: "steady",
  tracker: "steady",
  bloodtracker: "steady",
  predator: "steady",
  primalpredator: "steady",
  // 큰 한 방·처형·광전 — 한 번의 위력이 높은 대신 조금 덜 발동.
  mage: "burst",
  caster: "burst",
  assassin: "burst",
  magus: "burst",
  berserker: "burst",
  shaman: "burst",
  shadow: "burst",
  bloodtemplar: "burst",
  darkpriest: "burst",
  sage: "burst",
  runecaster: "burst",
  firemage: "burst",
  archshaman: "burst",
  warlord: "burst",
  calamitycaller: "burst",
  overlord: "burst",
  arcanist: "burst",
  elementallord: "burst",
  cryomancer: "steady",
  inscriber: "burst",
  lawweaver: "burst",
  marksman: "burst",
  bloodlord: "burst",
  swordsaint: "burst",
  hegemon: "burst",
  archmage: "burst",
  primordialmage: "burst",
  doomprophet: "burst",
  blooddemon: "burst",
};

const ACTIVE_PROC_OFFSET_BY_SKILL_TEMPO: Record<V2SkillTempo, number> = {
  rapid: 2,
  balanced: 0,
  control: 1,
  burst: -1,
  payoff: -2,
};

// 직업 안에서 다시 갈리는 개별 기술의 리듬. 목록에 없으면 balanced다.
// 효과 종류만 보고 자동 추론하지 않아, 같은 다단·디버프라도 의도에 따라 별도 튜닝할 수 있다.
const ACTIVE_SKILL_TEMPO: Partial<Record<V2SkillId, V2SkillTempo>> = {
  // 연타·속사 — 한 발은 가볍고 발동은 잦다.
  v2c_warrior_flurry: "rapid",
  v2c_martial_combo: "rapid",
  v2c_mage_barrage: "rapid",
  v2c_boxer_combo: "rapid",
  v2c_brawler_combo: "rapid",
  v2c_ranger_ambush: "rapid",
  v2c_warmonk_kick: "rapid",
  v2c_spellblade_strike: "rapid",
  v2c_sensei_combo: "rapid",
  v2c_runeknight_carve: "rapid",
  v2c_lightningmage_thunderbolt: "rapid",
  v2c_windmage_tempest: "rapid",
  v2c_dragonfist_rupture: "rapid",
  v2c_heavenlybow_orbit: "rapid",
  v2c_blackmoon_flurry: "rapid",
  v2c_celestialdragon_combo: "rapid",
  // 제어·지속피해 — 부가효과를 체감할 수 있게 조금 안정적이다.
  v2c_warrior_sunder: "control",
  v2c_mage_fireball: "control",
  v2c_rogue_poison: "control",
  v2c_archer_volley: "control",
  v2c_paladin_cleave: "control",
  v2c_shaman_hex: "control",
  v2c_crimsontemplar_judgment: "control",
  v2c_firemage_inferno: "control",
  v2c_frostmage_glacier: "control",
  v2c_cryomancer_absolutezero: "control",
  v2c_earthmage_tectonic: "control",
  v2c_calamitycaller_brand: "control",
  v2c_swordmaster_cut: "control",
  v2c_fortressknight_ram: "control",
  v2c_savior_judgment: "control",
  // 순수한 큰 한 방 — 조건 없이 강한 대신 살짝 드물다.
  v2c_caster_bolt: "burst",
  v2c_magus_bolt: "burst",
  v2c_sage_bolt: "burst",
  v2c_runecaster_grandsigil: "burst",
  v2c_arcanist_burst: "burst",
  v2c_elementallord_surge: "burst",
  v2c_inscriber_release: "burst",
  v2c_lawweaver_release: "payoff",
  v2c_marksman_shot: "burst",
  v2c_swordsaint_flash: "burst",
  v2c_archmage_collapse: "burst",
  v2c_primordialmage_return: "burst",
  // 처형·스택 폭발·HP/특수 스탯 환산 — 준비 조건의 보상이 큰 페이오프다.
  v2c_assassin_ambush: "payoff",
  v2c_venomist_toxiccloud: "payoff",
  v2c_guardian_bash: "payoff",
  v2c_berserker_bloodslash: "payoff",
  v2c_shadow_assassinate: "payoff",
  v2c_venomancer_miasma: "payoff",
  v2c_bloodtemplar_stigma: "payoff",
  v2c_darkpriest_reap: "payoff",
  v2c_veteran_cleave: "payoff",
  v2c_chief_strike: "payoff",
  v2c_phantom_ambush: "payoff",
  v2c_venomlord_plague: "payoff",
  v2c_archshaman_rite: "payoff",
  v2c_warlord_bloodbath: "payoff",
  v2c_overlord_ruin: "payoff",
  v2c_nightshade_eclipse: "payoff",
  v2c_plaguebringer_outbreak: "payoff",
  v2c_immortal_lifestrike: "payoff",
  v2c_transcendent_mandala: "payoff",
  v2c_bloodlord_brand: "payoff",
  v2c_hegemon_annihilation: "payoff",
  v2c_doomprophet_sentence: "payoff",
  v2c_myriadvenom_mutation: "payoff",
  v2c_blooddemon_reign: "payoff",
};

function combatJobIdForSkill(skillId: V2SkillId): string | null {
  return skillId.startsWith("v2c_") ? (skillId.split("_")[1] ?? null) : null;
}

function combatJobTierForSkill(skillId: V2SkillId): CombatJobTier | null {
  if (tier7CombatJobIdForSkillId(skillId) != null) return 7;
  const jobId = combatJobIdForSkill(skillId);
  if (jobId == null) return null;
  // 원소술사는 4차 다섯 계통으로 분리됐지만 옛 통합 액티브 id 는 세이브 호환용으로 남아 있다.
  if (jobId === "elementalist") return 4;
  const tier = jobId ? V2_JOB_CATALOG[jobId]?.tier : undefined;
  // 생존자처럼 tier 0 카탈로그에 속한 전투 킷은 입문(tier 1) 정책을 쓴다.
  if (tier === 0) return 1;
  return tier != null && tier >= 1 && tier <= 7 ? (tier as CombatJobTier) : null;
}

function scaledCoef(value: number, scale: number): number {
  return Math.round((value * scale + 1e-9) * 100) / 100;
}

function scaledFlat(value: number, scale: number): number {
  return Math.round(value * scale);
}

function scaledFlatByTier(
  value: readonly [number, number, number] | undefined,
  scale: number,
): readonly [number, number, number] | undefined {
  return value?.map((flat) => scaledFlat(flat, scale)) as
    | readonly [number, number, number]
    | undefined;
}

function scaledDirectStatCoef(
  statCoef: number,
  scaling: V2DamageScaling | undefined,
  scale: number,
): number {
  // 일반 공격력 계수는 전투 산식의 차수별 기반선으로 하한이 보장되지만, DEX·LUK·최대 HP
  // 직접 비례분은 그대로 사용된다. 발동률 상향 보정을 여기에 다시 적용하면 특화 빌드만
  // 이중으로 약해지므로, 카탈로그에서 의도한 원시 스탯 계수는 보존한다.
  if (scaling === "dex" || scaling === "luk" || scaling === "maxHp") {
    return statCoef;
  }

  return scaledCoef(statCoef, scale);
}

function rebalanceDamageEffect(effect: V2SkillEffect, scale: number): V2SkillEffect {
  switch (effect.kind) {
    case "damage":
      return {
        ...effect,
        statCoef: scaledDirectStatCoef(effect.statCoef, effect.scaling, scale),
        ...(effect.baseFlat != null
          ? { baseFlat: scaledFlat(effect.baseFlat, scale) }
          : {}),
        ...(effect.baseFlatByTier
          ? { baseFlatByTier: scaledFlatByTier(effect.baseFlatByTier, scale) }
          : {}),
      };
    case "missingHpDamage":
      // 승인된 단발 필살 계수는 발동률 공통 리밸런싱으로 다시 깎지 않는다.
      return effect;
    case "hpCostDamage":
    case "executeDamage":
    case "ambushDamage":
      return {
        ...effect,
        statCoef: scaledDirectStatCoef(effect.statCoef, effect.scaling, scale),
        ...(effect.baseFlatByTier
          ? { baseFlatByTier: scaledFlatByTier(effect.baseFlatByTier, scale) }
          : {}),
      };
    case "healToDamage":
      return {
        ...effect,
        healStatCoef: scaledCoef(effect.healStatCoef, scale),
        ...(effect.healFlatByTier
          ? { healFlatByTier: scaledFlatByTier(effect.healFlatByTier, scale) }
          : {}),
      };
    case "stackPayoffDamage":
      return {
        ...effect,
        statCoef: scaledDirectStatCoef(effect.statCoef, effect.scaling, scale),
        perStackFlat: scaledFlat(effect.perStackFlat, scale),
        ...(effect.spCostPerStackFlat != null
          ? { spCostPerStackFlat: scaledFlat(effect.spCostPerStackFlat, scale) }
          : {}),
        ...(effect.baseFlatByTier
          ? { baseFlatByTier: scaledFlatByTier(effect.baseFlatByTier, scale) }
          : {}),
      };
    case "dot":
      // 플레이어 출혈은 짧고 강한 공용 상태 피해로 별도 밸런싱한다. 직업 차수 배율로
      // 다시 낮추면 프리셋의 플레이어 전용 ATK 계수와 고정 피해가 훼손된다.
      if (effect.tag === "bleed") return effect;
      return {
        ...effect,
        flatPerStack: scaledFlat(effect.flatPerStack, scale),
        atkCoefPerStack: scaledCoef(effect.atkCoefPerStack, scale),
        // 작은 소수라 scaledCoef(소수 둘째 자리 반올림)를 쓰면 0이 된다. 원시 곱으로 위력만
        // 같은 비율로 낮춰, 발동률 상향 뒤 최대 HP 비례 독만 리밸런싱을 우회하지 않게 한다.
        pctMaxHpPerStack: effect.pctMaxHpPerStack * scale,
      };
    default:
      return effect;
  }
}

function rebalanceEffects(
  effects: readonly V2SkillEffect[],
  scale: number,
): readonly V2SkillEffect[] {
  return effects.map((effect) => rebalanceDamageEffect(effect, scale));
}

/** 런타임에 합성한 효과를 같은 직업 차수 액티브 보정에 정확히 한 번 태운다. */
export function rebalanceDynamicV2SkillEffects(
  skillId: V2SkillId,
  effects: readonly V2SkillEffect[],
): readonly V2SkillEffect[] {
  const jobTier = combatJobTierForSkill(skillId);
  return jobTier == null
    ? effects
    : rebalanceEffects(effects, ACTIVE_DAMAGE_SCALE_BY_JOB_TIER[jobTier]);
}

function rebalanceElementEffects(
  effects: Partial<Record<V2Element, readonly V2SkillEffect[]>>,
  scale: number,
): Partial<Record<V2Element, readonly V2SkillEffect[]>> {
  return Object.fromEntries(
    Object.entries(effects).map(([element, elementEffects]) => [
      element,
      rebalanceEffects(elementEffects, scale),
    ]),
  );
}

function rebalancePlayerSkill(skill: V2SkillDefinition): V2SkillDefinition {
  if (skill.passive || skill.monsterOnly) return skill;
  const jobTier = combatJobTierForSkill(skill.id);
  if (jobTier == null) return skill;

  const scale = ACTIVE_DAMAGE_SCALE_BY_JOB_TIER[jobTier];
  const currentProc = skill.procChance ?? 100;
  const jobId = combatJobIdForSkill(skill.id);
  const tempo = jobId ? ACTIVE_JOB_TEMPO[jobId] : undefined;
  const procOffset = tempo ? ACTIVE_PROC_OFFSET_BY_TEMPO[tempo] : 0;
  const skillTempo = skill.tempo ?? ACTIVE_SKILL_TEMPO[skill.id] ?? "balanced";
  const skillProcOffset = ACTIVE_PROC_OFFSET_BY_SKILL_TEMPO[skillTempo];
  const targetProc = Math.max(
    40,
    ACTIVE_PROC_FLOOR_BY_JOB_TIER[jobTier] + procOffset + skillProcOffset,
  );
  return {
    ...skill,
    tempo: skillTempo,
    procChance: Math.max(currentProc, targetProc),
    effects: rebalanceEffects(skill.effects, scale),
    ...(skill.elementEffects
      ? { elementEffects: rebalanceElementEffects(skill.elementEffects, scale) }
      : {}),
    ...(skill.equippedSynergies
      ? {
          equippedSynergies: skill.equippedSynergies.map((synergy) => ({
            ...synergy,
            effects: rebalanceEffects(synergy.effects, scale),
          })),
        }
      : {}),
    ...(skill.castVariants
      ? {
          castVariants: skill.castVariants.map((variant) => ({
            ...variant,
            effects: rebalanceEffects(variant.effects, scale),
          })),
        }
      : {}),
    ...(skill.elementEffectSynergies
      ? {
          elementEffectSynergies: skill.elementEffectSynergies.map((synergy) => ({
            ...synergy,
            elementEffects: rebalanceElementEffects(synergy.elementEffects, scale),
          })),
        }
      : {}),
  };
}

const RAW_V2_SKILLS: Record<V2SkillId, V2SkillDefinition> = {
  ...V2_BASE_SKILLS,
  ...V2_COMMON_SKILLS,
};

export const V2_SKILLS: Record<V2SkillId, V2SkillDefinition> = Object.fromEntries(
  Object.entries(RAW_V2_SKILLS).map(([id, skill]) => [id, rebalancePlayerSkill(skill)]),
) as Record<V2SkillId, V2SkillDefinition>;

/** 원정당 1회·PvP 효과 50% 제한을 공유하는 무자원 생존 회복기. */
export const LIMITED_RECOVERY_SKILL_IDS = [
  "v2c_survivor_firstaid",
  "v2c_camper_camp",
  "v2c_fieldmedic_treatment",
  "v2c_extremesurvivor_struggle",
  "v2c_rescueexpert_rescue",
  "v2c_returner_survive",
] as const satisfies readonly V2SkillId[];

export type LimitedRecoverySkillId =
  (typeof LIMITED_RECOVERY_SKILL_IDS)[number];

const LIMITED_RECOVERY_SKILL_ID_SET = new Set<V2SkillId>(
  LIMITED_RECOVERY_SKILL_IDS,
);

export function isLimitedRecoverySkillId(
  value: unknown,
): value is LimitedRecoverySkillId {
  return (
    typeof value === "string" &&
    LIMITED_RECOVERY_SKILL_ID_SET.has(value as V2SkillId)
  );
}

export type V2ExclusiveSkillConflict = {
  group: string;
  skillIds: V2SkillId[];
};

/** 같은 배타 그룹을 둘 이상 장착한 입력을 원래 순서대로 분류한다. */
export function exclusiveSkillConflicts(
  ids: readonly V2SkillId[],
): V2ExclusiveSkillConflict[] {
  const grouped = new Map<string, V2SkillId[]>();
  for (const id of ids) {
    const group = V2_SKILLS[id]?.exclusiveGroup;
    if (!group) continue;
    const skillIds = grouped.get(group) ?? [];
    skillIds.push(id);
    grouped.set(group, skillIds);
  }
  return [...grouped.entries()]
    .filter(([, skillIds]) => skillIds.length > 1)
    .map(([group, skillIds]) => ({ group, skillIds }));
}

/** 손상된 기존 장착에서 그룹별 최고 단계를 하나만 남긴다. 동률은 먼저 나온 항목이 이긴다. */
export function resolveExclusiveSkills(
  ids: readonly V2SkillId[],
): V2SkillId[] {
  const winnerByGroup = new Map<
    string,
    { index: number; rank: number }
  >();
  ids.forEach((id, index) => {
    const def = V2_SKILLS[id];
    if (!def?.exclusiveGroup) return;
    const rank = def.exclusiveRank ?? 0;
    const current = winnerByGroup.get(def.exclusiveGroup);
    if (!current || rank > current.rank) {
      winnerByGroup.set(def.exclusiveGroup, { index, rank });
    }
  });

  return ids.filter((id, index) => {
    const group = V2_SKILLS[id]?.exclusiveGroup;
    return !group || winnerByGroup.get(group)?.index === index;
  });
}

// 장착(로드아웃)된 패시브 스킬들의 상시 효과 집계 — 코어루프 derive 가 호출.
//   대부분은 합산한다. 반격 확률(counterChancePct)은 100%에 쉽게 닿지 않도록 실패 확률을 곱한다.
//   배타 그룹은 최고 단계 하나만 적용하고, 패시브 아닌 스킬·미존재 id 는 무시.
export function aggregateEquippedPassives(equipped: readonly V2SkillId[]): {
  stat: Partial<Record<V2StatKey, number>>;
  statPct: Partial<Record<V2StatKey, number>>;
  maxHpPct: number;
  maxMpPct: number;
  mpCostReductionPct: number;
  freezeDamagePct: number;
  freezeDelayPct: number;
  freezeRetainStacks: number;
  magicBarrier: boolean;
  atkPerDexCoef: number;
  atkPerLukCoef: number;
  critPct: number;
  critDmgPct: number;
  evasionPct: number;
  lifestealPct: number;
  counterChancePct: number;
  counterDamageUsesReflectBoost: boolean;
  defPct: number;
  thornsDefPct: number;
  fortressImpactOnHit: boolean;
  fortressImpactDamagePctPerStack: number;
  fortressDefSkillStatCoefPct: number;
  lawInscription: boolean;
  accuracyPct: number;
  healPowerPct: number;
  damageTakenReductionPct: number;
  statusDamageReductionPct: number;
  bleedPhysicalSkillDamagePctPerStack: number;
  stoneskinDefPctPerWeight: number;
  magicDefPct: number;
  openingMagicDamageReductionPct: number;
  openingMagicDamageReductionPhases: number;
  tripleWardRank: 0 | 1 | 2;
  poisonedEnemyDefReductionPct: number;
  poisonDamagePct: number;
  enemyPhysicalDefReductionPct: number;
  enemyMagicDefReductionPct: number;
  berserkAtkPctPerLostHpPct: number;
  enemyMagicVulnPctPerStack: number;
  enemyMagicVulnApplyChancePct: number;
  magicSkillDamagePct: number;
  singleHitPhysicalSkillDamagePct: number;
  spdToAtkMaxPct: number;
  spdPerLukCoef: number;
  skillCritOverflow: boolean;
  skillCritDmgPct: number;
  equipmentMagicSkillCritConversion: boolean;
  skillCritAfterEvade: boolean;
  comboFinisherBonusPct: number;
  basicDefPenetrationPct: number;
  basicCritHastePct: number;
  basicCritChanceCap: number;
  berserkerMadnessRank: 0 | 1 | 2 | 3 | 4;
} {
  const stat: Partial<Record<V2StatKey, number>> = {};
  const statPct: Partial<Record<V2StatKey, number>> = {};
  let maxHpPct = 0;
  let maxMpPct = 0;
  let mpCostReductionPct = 0;
  let freezeDamagePct = 0;
  let freezeDelayPct = 0;
  let freezeRetainStacks = 0;
  let magicBarrier = false;
  let atkPerDexCoef = 0;
  let atkPerLukCoef = 0;
  let critPct = 0;
  let critDmgPct = 0;
  let evasionPct = 0;
  let lifestealPct = 0;
  let counterFailChance = 1;
  let counterDamageUsesReflectBoost = false;
  let defPct = 0;
  let thornsDefPct = 0;
  let fortressImpactOnHit = false;
  let fortressImpactDamagePctPerStack = 0;
  let fortressDefSkillStatCoefPct = 0;
  let lawInscription = false;
  let accuracyPct = 0;
  let healPowerPct = 0;
  let damageTakenReductionPct = 0;
  let statusDamageReductionPct = 0;
  let bleedPhysicalSkillDamagePctPerStack = 0;
  let stoneskinDefPctPerWeight = 0;
  let magicDefPct = 0;
  let openingMagicDamageReductionPct = 0;
  let openingMagicDamageReductionPhases = 0;
  let tripleWardRank: 0 | 1 | 2 = 0;
  let poisonedEnemyDefReductionPct = 0;
  let poisonDamagePct = 0;
  let enemyPhysicalDefReductionPct = 0;
  let enemyMagicDefReductionPct = 0;
  let berserkAtkPctPerLostHpPct = 0;
  let enemyMagicVulnPctPerStack = 0;
  let enemyMagicVulnApplyChancePct = 0;
  let magicSkillDamagePct = 0;
  let singleHitPhysicalSkillDamagePct = 0;
  let spdToAtkMaxPct = 0;
  let spdPerLukCoef = 0;
  let skillCritOverflow = false;
  let skillCritDmgPct = 0;
  let equipmentMagicSkillCritConversion = false;
  let skillCritAfterEvade = false;
  let comboFinisherBonusPct = 0;
  let basicDefPenetrationPct = 0;
  let basicCritHastePct = 0;
  let basicCritChanceCap = 75;
  let berserkerMadnessRank: 0 | 1 | 2 | 3 | 4 = 0;
  for (const id of resolveExclusiveSkills(equipped)) {
    const def = V2_SKILLS[id];
    if (def?.exclusiveGroup === "berserker_madness") {
      const rank = Math.max(0, Math.min(4, def.exclusiveRank ?? 0)) as
        | 0
        | 1
        | 2
        | 3
        | 4;
      berserkerMadnessRank = Math.max(
        berserkerMadnessRank,
        rank,
      ) as 0 | 1 | 2 | 3 | 4;
    }
    const p = def?.passive;
    if (!p) continue;
    for (const [k, v] of Object.entries(p.stat ?? {})) {
      if (v) stat[k as V2StatKey] = (stat[k as V2StatKey] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(p.statPct ?? {})) {
      if (v) statPct[k as V2StatKey] = (statPct[k as V2StatKey] ?? 0) + v;
    }
    maxHpPct += p.maxHpPct ?? 0;
    maxMpPct += p.maxMpPct ?? 0;
    mpCostReductionPct += p.mpCostReductionPct ?? 0;
    freezeDamagePct += p.freezeDamagePct ?? 0;
    freezeDelayPct = Math.max(freezeDelayPct, p.freezeDelayPct ?? 0);
    freezeRetainStacks = Math.max(
      freezeRetainStacks,
      p.freezeRetainStacks ?? 0,
    );
    if (p.magicBarrier) magicBarrier = true;
    atkPerDexCoef += p.atkPerDexCoef ?? 0;
    atkPerLukCoef += p.atkPerLukCoef ?? 0;
    critPct += p.critPct ?? 0;
    critDmgPct += p.critDmgPct ?? 0;
    evasionPct += p.evasionPct ?? 0;
    lifestealPct += p.lifestealPct ?? 0;
    if (p.counterChancePct) {
      const chance = Math.max(0, Math.min(100, p.counterChancePct));
      counterFailChance *= 1 - chance / 100;
    }
    if (p.counterDamageUsesReflectBoost) counterDamageUsesReflectBoost = true;
    defPct += p.defPct ?? 0;
    thornsDefPct += p.thornsDefPct ?? 0;
    if (p.fortressImpactOnHit) fortressImpactOnHit = true;
    fortressImpactDamagePctPerStack = Math.max(
      fortressImpactDamagePctPerStack,
      p.fortressImpactDamagePctPerStack ?? 0,
    );
    fortressDefSkillStatCoefPct += p.fortressDefSkillStatCoefPct ?? 0;
    if (p.lawInscription) lawInscription = true;
    accuracyPct += p.accuracyPct ?? 0;
    healPowerPct += p.healPowerPct ?? 0;
    damageTakenReductionPct += p.damageTakenReductionPct ?? 0;
    statusDamageReductionPct += p.statusDamageReductionPct ?? 0;
    bleedPhysicalSkillDamagePctPerStack +=
      p.bleedPhysicalSkillDamagePctPerStack ?? 0;
    stoneskinDefPctPerWeight += p.stoneskinDefPctPerWeight ?? 0;
    magicDefPct += p.magicDefPct ?? 0;
    openingMagicDamageReductionPct += p.openingMagicDamageReductionPct ?? 0;
    openingMagicDamageReductionPhases = Math.max(
      openingMagicDamageReductionPhases,
      p.openingMagicDamageReductionPhases ?? 0,
    );
    tripleWardRank = Math.max(
      tripleWardRank,
      p.tripleWardRank ?? 0,
    ) as 0 | 1 | 2;
    poisonedEnemyDefReductionPct = combineDefReductionPcts(
      poisonedEnemyDefReductionPct,
      p.poisonedEnemyDefReductionPct ?? 0,
    );
    poisonDamagePct += p.poisonDamagePct ?? 0;
    enemyPhysicalDefReductionPct = combineDefReductionPcts(
      enemyPhysicalDefReductionPct,
      p.enemyPhysicalDefReductionPct ?? 0,
    );
    enemyMagicDefReductionPct = combineDefReductionPcts(
      enemyMagicDefReductionPct,
      p.enemyMagicDefReductionPct ?? 0,
    );
    berserkAtkPctPerLostHpPct += p.berserkAtkPctPerLostHpPct ?? 0;
    enemyMagicVulnPctPerStack += p.enemyMagicVulnPctPerStack ?? 0;
    if ((p.enemyMagicVulnPctPerStack ?? 0) > 0) {
      enemyMagicVulnApplyChancePct = Math.max(
        enemyMagicVulnApplyChancePct,
        p.enemyMagicVulnApplyChancePct ?? 100,
      );
    }
    magicSkillDamagePct += p.magicSkillDamagePct ?? 0;
    singleHitPhysicalSkillDamagePct +=
      p.singleHitPhysicalSkillDamagePct ?? 0;
    spdToAtkMaxPct += p.spdToAtkMaxPct ?? 0;
    spdPerLukCoef += p.spdPerLukCoef ?? 0;
    if (p.skillCritOverflow) skillCritOverflow = true;
    skillCritDmgPct += p.skillCritDmgPct ?? 0;
    if (p.equipmentMagicSkillCritConversion) {
      equipmentMagicSkillCritConversion = true;
    }
    if (p.skillCritAfterEvade) skillCritAfterEvade = true;
    comboFinisherBonusPct += p.comboFinisherBonusPct ?? 0;
    basicDefPenetrationPct += p.basicDefPenetrationPct ?? 0;
    basicCritHastePct = Math.max(basicCritHastePct, p.basicCritHastePct ?? 0);
    basicCritChanceCap = Math.max(basicCritChanceCap, p.basicCritChanceCap ?? 75);
  }
  return {
    stat,
    statPct,
    maxHpPct,
    maxMpPct,
    mpCostReductionPct,
    freezeDamagePct,
    freezeDelayPct,
    freezeRetainStacks,
    magicBarrier,
    atkPerDexCoef,
    atkPerLukCoef,
    critPct,
    critDmgPct,
    evasionPct,
    lifestealPct,
    counterChancePct: Math.round((1 - counterFailChance) * 10000) / 100,
    counterDamageUsesReflectBoost,
    defPct,
    thornsDefPct,
    fortressImpactOnHit,
    fortressImpactDamagePctPerStack,
    fortressDefSkillStatCoefPct,
    lawInscription,
    accuracyPct,
    healPowerPct,
    damageTakenReductionPct,
    statusDamageReductionPct,
    bleedPhysicalSkillDamagePctPerStack,
    stoneskinDefPctPerWeight,
    magicDefPct,
    openingMagicDamageReductionPct,
    openingMagicDamageReductionPhases,
    tripleWardRank,
    poisonedEnemyDefReductionPct,
    poisonDamagePct,
    enemyPhysicalDefReductionPct,
    enemyMagicDefReductionPct,
    berserkAtkPctPerLostHpPct,
    enemyMagicVulnPctPerStack,
    enemyMagicVulnApplyChancePct,
    magicSkillDamagePct,
    singleHitPhysicalSkillDamagePct,
    spdToAtkMaxPct,
    spdPerLukCoef,
    skillCritOverflow,
    skillCritDmgPct,
    equipmentMagicSkillCritConversion,
    skillCritAfterEvade,
    comboFinisherBonusPct,
    basicDefPenetrationPct,
    basicCritHastePct,
    basicCritChanceCap,
    berserkerMadnessRank,
  };
}

// 장착 패시브의 "승리당 숙달 포인트 보너스" 합산(경제 — 전투 aggregate 와 분리). hunt 지급부에서 소비.
export function equippedProfPerKillBonus(equipped: readonly V2SkillId[]): number {
  let n = 0;
  for (const id of equipped) n += V2_SKILLS[id]?.passive?.profPerKillBonus ?? 0;
  return n;
}

// 학습한 트레이너 패시브의 길드 훈련장 보너스 합산. 장착 슬롯과 무관하게 항상 적용한다.
export function learnedGuildTrainingBonuses(learned: readonly V2SkillId[]): {
  rewardBonusPct: number;
  weeklyBonusMastery: number;
} {
  let rewardBonusPct = 0;
  let weeklyBonusMastery = 0;
  for (const id of new Set(learned)) {
    const passive = V2_SKILLS[id]?.passive;
    rewardBonusPct += passive?.guildTrainingRewardBonusPct ?? 0;
    weeklyBonusMastery += passive?.guildTrainingWeeklyBonusMastery ?? 0;
  }
  return { rewardBonusPct, weeklyBonusMastery };
}

// 장착 패시브의 낚시 보너스 합산. 캐스팅 서버 판정에서만 소비한다.
export function equippedFishingBonuses(equipped: readonly V2SkillId[]): {
  sizeBonusPct: number;
  specialWeightPct: number;
  rareSizeBonusPct: number;
  bigCatchSizeBonusPct: number;
} {
  let sizeBonusPct = 0;
  let specialWeightPct = 0;
  let rareSizeBonusPct = 0;
  let bigCatchSizeBonusPct = 0;
  for (const id of equipped) {
    const p = V2_SKILLS[id]?.passive;
    sizeBonusPct += p?.fishingSizeBonusPct ?? 0;
    specialWeightPct += p?.fishingSpecialWeightPct ?? 0;
    rareSizeBonusPct += p?.fishingRareSizeBonusPct ?? 0;
    bigCatchSizeBonusPct += p?.fishingBigCatchSizeBonusPct ?? 0;
  }
  return {
    sizeBonusPct,
    specialWeightPct,
    rareSizeBonusPct,
    bigCatchSizeBonusPct,
  };
}

// 장착 패시브의 농장 보너스 합산. 수확 서버 판정에서만 소비한다.
export function equippedFarmBonuses(equipped: readonly V2SkillId[]): {
  yieldBonusPct: number;
  rareChancePct: number;
} {
  let yieldBonusPct = 0;
  let rareChancePct = 0;
  for (const id of equipped) {
    const p = V2_SKILLS[id]?.passive;
    yieldBonusPct += p?.farmYieldBonusPct ?? 0;
    rareChancePct += p?.farmRareChancePct ?? 0;
  }
  return { yieldBonusPct, rareChancePct };
}

export type EquippedCookingBonuses = {
  xpBonusPct: number;
  carefulChancePct: number;
  materialReductionPct: number;
  masterpieceChancePct: number;
  rareIngredientSaveChancePct: number;
};

// 장착 패시브의 요리 보너스 합산. 조리 서버 판정에서만 소비한다.
export function equippedCookingBonuses(
  equipped: readonly V2SkillId[],
): EquippedCookingBonuses {
  let xpBonusPct = 0;
  let carefulChancePct = 0;
  let materialReductionPct = 0;
  let masterpieceChancePct = 0;
  let rareIngredientSaveChancePct = 0;
  for (const id of equipped) {
    const passive = V2_SKILLS[id]?.passive;
    xpBonusPct += passive?.cookingXpBonusPct ?? 0;
    carefulChancePct += passive?.cookingCarefulChancePct ?? 0;
    materialReductionPct += passive?.cookingMaterialReductionPct ?? 0;
    masterpieceChancePct += passive?.cookingMasterpieceChancePct ?? 0;
    rareIngredientSaveChancePct +=
      passive?.cookingRareIngredientSaveChancePct ?? 0;
  }
  return {
    xpBonusPct: Math.min(100, Math.max(0, xpBonusPct)),
    carefulChancePct: Math.min(100, Math.max(0, carefulChancePct)),
    materialReductionPct: Math.min(50, Math.max(0, materialReductionPct)),
    masterpieceChancePct: Math.min(100, Math.max(0, masterpieceChancePct)),
    rareIngredientSaveChancePct: Math.min(
      100,
      Math.max(0, rareIngredientSaveChancePct),
    ),
  };
}

// 장착 패시브의 벌목 실패율 감소 합산. 벌목 시작 시 서버가 세션 확률에 고정한다.
export function equippedWoodcuttingFailureReductionPct(
  equipped: readonly V2SkillId[],
): number {
  let reductionPct = 0;
  for (const id of equipped) {
    reductionPct += V2_SKILLS[id]?.passive?.woodcuttingFailureReductionPct ?? 0;
  }
  return Math.min(90, Math.max(0, reductionPct));
}

export function equippedWoodcuttingBonuses(equipped: readonly V2SkillId[]): {
  failureReductionPct: number;
  durationReductionPct: number;
  failureRecoveryPct: number;
  bonusLogChancePct: number;
} {
  let failureReductionPct = 0;
  let durationReductionPct = 0;
  let failureRecoveryPct = 0;
  let bonusLogChancePct = 0;
  for (const id of equipped) {
    const passive = V2_SKILLS[id]?.passive;
    failureReductionPct += passive?.woodcuttingFailureReductionPct ?? 0;
    durationReductionPct += passive?.woodcuttingDurationReductionPct ?? 0;
    failureRecoveryPct += passive?.woodcuttingFailureRecoveryPct ?? 0;
    bonusLogChancePct += passive?.woodcuttingBonusLogChancePct ?? 0;
  }
  return {
    failureReductionPct: Math.min(90, Math.max(0, failureReductionPct)),
    durationReductionPct: Math.min(50, Math.max(0, durationReductionPct)),
    failureRecoveryPct: Math.min(100, Math.max(0, failureRecoveryPct)),
    bonusLogChancePct: Math.min(100, Math.max(0, bonusLogChancePct)),
  };
}

// 장착 패시브의 채광 보너스 합산. 채광 시작 시 서버가 세션 판정에 고정한다.
export function equippedMiningBonuses(equipped: readonly V2SkillId[]): {
  failureReductionPct: number;
  durationReductionPct: number;
  failureRecoveryPct: number;
  bonusOreChancePct: number;
} {
  let failureReductionPct = 0;
  let durationReductionPct = 0;
  let failureRecoveryPct = 0;
  let bonusOreChancePct = 0;
  for (const id of equipped) {
    const passive = V2_SKILLS[id]?.passive;
    failureReductionPct += passive?.miningFailureReductionPct ?? 0;
    durationReductionPct += passive?.miningDurationReductionPct ?? 0;
    failureRecoveryPct += passive?.miningFailureRecoveryPct ?? 0;
    bonusOreChancePct += passive?.miningBonusOreChancePct ?? 0;
  }
  return {
    failureReductionPct: Math.min(90, Math.max(0, failureReductionPct)),
    durationReductionPct: Math.min(50, Math.max(0, durationReductionPct)),
    failureRecoveryPct: Math.min(100, Math.max(0, failureRecoveryPct)),
    bonusOreChancePct: Math.min(100, Math.max(0, bonusOreChancePct)),
  };
}

// 스킬 효과 1개를 사람이 읽을 한 줄로. UI 상세 옵션 칩에 사용.
const DERIVED_BUFF_LABEL: Record<"evasion" | "crit" | "damageReduction" | "reflectDamage", string> = {
  evasion: "회피",
  crit: "치명타 확률",
  damageReduction: "받는 피해 감소",
  reflectDamage: "반사 피해",
};
const STACK_TAG_LABEL: Record<"bleed" | "poison" | "magicVuln", string> = {
  bleed: "출혈",
  poison: "중독",
  magicVuln: "마법취약",
};
// 회복 계열의 차수 flat(baseFlatByTier) 이면 범위로, 아니면 단일 baseFlat 으로 표기.
function flatChip(baseFlat?: number, byTier?: readonly [number, number, number]): string {
  if (byTier) return ` +${byTier[0]}~${byTier[2]}`;
  return baseFlat ? ` +${baseFlat}` : "";
}
function scalingStatLabel(scaling?: V2DamageScaling): string {
  if (scaling === "magic") return "마법 공격력";
  if (scaling === "def") return "방어력";
  if (scaling === "vit") return "활력";
  if (scaling === "dex") return "민첩";
  if (scaling === "luk") return "행운";
  if (scaling === "spi") return "정신력";
  if (scaling === "all") return "모든 스탯 합";
  if (scaling === "maxHp") return "최대 HP";
  return "공격력";
}
// 다단 스킬의 차수별 기본 계수를 타수로 나누면 0.39999999999999997처럼
// 부동소수점 꼬리가 생길 수 있다. 전투 계산값은 유지하고 설명에서만 소수 둘째
// 자리까지 반올림해 읽기 좋은 계수로 표시한다.
function formatSkillCoefficient(value: number): string {
  return (Math.round((value + 1e-9) * 100) / 100).toString();
}
function damageFormulaChip(
  e: V2DirectDamageEffect,
  tier: 1 | 2 | 3,
  directDamageEffectCount: number,
  monsterOnly: boolean,
): string {
  const specialized = isSpecializedDamageScaling(e.scaling);
  const attackLabel =
    e.scaling === "magic" || e.scaling === "spi"
      ? "마법 공격력"
      : "공격력";
  const baseAttackCoef = v2SkillAttackCoef({
    tier,
    statCoef: e.statCoef,
    specialized,
    directDamageEffectCount,
    attackCoef: e.attackCoef,
  });
  const pureFormula =
    !monsterOnly && !specialized
      ? v2PureSkillFormulaCoefficients({
          tier,
          scaling: e.scaling === "magic" ? "magic" : "physical",
          directDamageEffectCount,
          resolvedAttackCoef: baseAttackCoef,
        })
      : null;
  const attackCoef = pureFormula?.attackCoef ?? baseAttackCoef;
  const attackTerm = `${attackLabel}×${formatSkillCoefficient(attackCoef)}`;
  if (specialized) {
    const statCoef = monsterOnly
      ? e.statCoef
      : v2SpecializedSkillStatCoef(e.statCoef, e.scaling);
    return `${attackTerm} + ${scalingStatLabel(e.scaling)}×${formatSkillCoefficient(statCoef)}`;
  }
  if (!pureFormula) return attackTerm;
  const primaryStatLabel = e.scaling === "magic" ? "지능" : "힘";
  const primaryStatCoef =
    e.kind === "damage" && e.primaryStatCoef != null
      ? e.primaryStatCoef
      : pureFormula.primaryStatCoef;
  return `${attackTerm} + ${primaryStatLabel}×${formatSkillCoefficient(primaryStatCoef)}`;
}
function actionsChip(actions: number): string {
  return `${actions}행동`;
}
function targetActionsChip(actions: number): string {
  return `대상 행동 ${actions}회`;
}

function describeMissingHpDamage(
  effect: Extract<V2SkillEffect, { kind: "missingHpDamage" }>,
): string[] {
  return [
    ...(effect.selfCurrentHpCostPct
      ? [
          `명중 시 현재 HP ${effect.selfCurrentHpCostPct}% 소모 (소모 후 HP로 피해 계산)`,
        ]
      : []),
    `기본 피해 공격력×${formatSkillCoefficient(effect.attackCoef)} + 힘×${formatSkillCoefficient(effect.statCoef)}`,
    `잃은 HP 1%당 피해 +${formatSkillCoefficient(effect.missingHpCoef)}% (최대 ×${formatSkillCoefficient(1 + effect.missingHpCoef)} · 대련 추가분 60%)`,
  ];
}

function describeBerserkerLineageRules(skill: V2SkillDefinition): string[] {
  const chips: string[] = [];

  if (skill.id === "v2c_warlord_bloodbath") {
    chips.push("명중 시 혈전 준비 획득");
  }
  if (
    skill.id === "v2c_overlord_ruin" ||
    skill.id === "v2c_hegemon_annihilation"
  ) {
    chips.push("혈전 준비 시 광폭 계수 +25% · 확정 치명타");
  }
  if (skill.id === "v2c_hegemon_annihilation") {
    chips.push(
      "사망 극복 시 1회 재충전 (전투당 최대 2회)",
      "사망 극복 발동 시: 잃은 HP 100% 취급 · 광폭 계수 ×1.5",
    );
  }

  if (skill.exclusiveGroup !== "berserker_madness") return chips;

  const rank = skill.exclusiveRank ?? 0;
  if (rank >= 1) {
    chips.push("HP 50% 이하: 공격 액티브 발동률 +10%p");
  }
  if (rank >= 2) {
    chips.push(
      "혈전 준비로 강화된 파멸일격·멸왕일도: 치명타 피해 +30%",
    );
  }
  if (rank >= 3) {
    chips.push("사망 극복: 전투당 1회 치명 피해 무효 · HP 40%로 회복");
  }
  if (rank === 3) {
    chips.push("현재 행동 종료까지 HP 40% 아래로 내려가지 않음");
  }
  if (rank >= 4) {
    chips.push(
      "사망 극복 발생 시: 다음 내 공격 종료까지 HP 40% 아래로 내려가지 않음",
      "사망 극복 발생 시: 다음 공격 액티브 스킬 100% 발동 · 잃은 HP 100% 취급 · 광폭 계수 ×1.5",
      "사망 극복 발생 시: 멸왕일도 1회 재충전",
    );
  }
  chips.push("광기 계열 중 1개만 장착");
  return chips;
}

function describeBleedHunt(skill: V2SkillDefinition): string[] {
  const mechanic = skill.bleedHunt;
  if (!mechanic) return [];
  const chips = [`출혈 ${mechanic.minStacks}중첩 이상`];
  if (mechanic.hitBleedStacks) {
    chips.push(`명중 시 출혈 +${mechanic.hitBleedStacks}중첩`);
  }
  if (mechanic.hitBleedSetTurns) {
    chips.push(`명중 시 출혈 지속 ${mechanic.hitBleedSetTurns}회로 갱신`);
  }
  if (mechanic.skillAccuracyPct) {
    chips.push(`이 스킬 적중도 +${mechanic.skillAccuracyPct}%`);
  }
  if (mechanic.hitEnemyDelayPct) {
    chips.push(`명중 시 적 다음 행동 지연 +${mechanic.hitEnemyDelayPct}%`);
  }
  if (mechanic.skillPenetrationPct) {
    chips.push(`이 스킬 방어 관통 +${mechanic.skillPenetrationPct}%p`);
  }
  if (mechanic.skillActualDamageHealPct) {
    chips.push(`실제 피해의 ${mechanic.skillActualDamageHealPct}% HP 회복`);
  }
  if (mechanic.castHastePct) {
    chips.push(`정상 시전 시 다음 행동 속도 +${mechanic.castHastePct}%`);
  }
  if (mechanic.directPhysicalAccuracyPct) {
    chips.push(`직접 물리 스킬 적중도 +${mechanic.directPhysicalAccuracyPct}%`);
  }
  if (mechanic.directPhysicalHastePct) {
    chips.push(
      `직접 물리 스킬 정상 시전 시 다음 행동 속도 +${mechanic.directPhysicalHastePct}%`,
    );
  }
  if (mechanic.directPhysicalPenetrationPct) {
    chips.push(
      `직접 물리 스킬 방어 관통 +${mechanic.directPhysicalPenetrationPct}%p`,
    );
  }
  if (mechanic.directPhysicalDamagePct) {
    chips.push(`직접 물리 스킬 피해 +${mechanic.directPhysicalDamagePct}%`);
  }
  if (mechanic.bleedTickHealMaxHpPct) {
    chips.push(`출혈 피해 발생 시 최대 HP ${mechanic.bleedTickHealMaxHpPct}% 회복`);
  }
  const extend = mechanic.directPhysicalHitBleedExtend;
  if (extend) {
    chips.push(
      `직접 물리 스킬 명중 시 ${extend.chancePct}% 확률로 출혈 지속 +${extend.turns} (최대 ${extend.maxTurns}회)`,
    );
  }
  return chips;
}

function describeV2Effect(
  e: V2SkillEffect,
  tier: 1 | 2 | 3,
  directDamageEffectCount: number,
  monsterOnly: boolean,
): string {
  switch (e.kind) {
    case "damage":
      return `피해 ${damageFormulaChip(e, tier, directDamageEffectCount, monsterOnly)}`;
    case "heal":
      return `${[
        e.pctLostHp != null ? `잃은 체력 ${e.pctLostHp}%` : "",
        e.pctMaxHp != null ? `최대HP ${e.pctMaxHp}%` : "",
        e.statCoef != null
          ? `${scalingStatLabel(e.scaling)}×${formatSkillCoefficient(v2SkillHealStatCoef(e.statCoef))}${flatChip(undefined, e.baseFlatByTier)}`
          : "",
        e.flat ? `+${e.flat}` : "",
      ].filter(Boolean).join(" + ").replace(/^/, "회복 ")} (회복량 보정 적용)`;
    case "healFromDamage":
      return `피해량 ${e.pct}% 회복 (회복량 보정 미적용)`;
    case "selfBuff":
      return `${STAT_LABELS[e.stat]} +${e.pct}% (${actionsChip(e.turns)})`;
    case "selfBuffPct":
      if (e.target === "damageReduction") {
        return `받는 피해 -${e.pct}% (${actionsChip(e.turns)})`;
      }
      return `${DERIVED_BUFF_LABEL[e.target]} +${e.pct}% (${actionsChip(e.turns)})`;
    case "selfRegen":
      return `행동마다 최대HP ${e.pctMaxHpPerTurn}% 회복 (${actionsChip(e.turns)})`;
    case "shield": {
      const parts: string[] = [];
      if (e.pctMaxHp) parts.push(`최대HP ${e.pctMaxHp}%`);
      if (e.pctMaxMp) parts.push(`최대MP ${e.pctMaxMp}%`);
      return `보호막 (${parts.join(" + ")}, 소진까지)`;
    }
    case "manaRestore":
      return `마나 ${e.pctMaxMp}% 회복`;
    case "guaranteedEvade":
      return `다음 공격 ${e.count}회 확정 회피`;
    case "enemyDebuff":
      return `적 ${STAT_LABELS[e.stat]} −${e.pct}% (${targetActionsChip(e.turns)})`;
    case "enemyVuln":
      return `적 받는 피해 +${e.pct}% (${targetActionsChip(e.turns)})`;
    case "enemyEvasionDown":
      return `적 회피 −${e.pct}%p (${targetActionsChip(e.turns)})`;
    case "enemyAccuracyDown":
      return `적 명중 −${e.pct}%p (${targetActionsChip(e.turns)})`;
    case "selfHaste":
      return `내 다음 행동 속도 +${e.pct}% (1회)`;
    case "enemyDelay":
      return `적 다음 행동 지연 +${e.pct}% (1회)`;
    case "enemyHealReduce":
      return `적 회복 −${e.pct}% (${targetActionsChip(e.turns)})`;
    case "enemyDamageDown":
      return `적 주는 피해 −${e.pct}% (${targetActionsChip(e.turns)})`;
    case "enemySkillProcDown":
      return `적 스킬 발동률 −${e.pct}%p (${targetActionsChip(e.turns)})`;
    case "enemyDotVuln":
      return `적 지속/저주 피해 +${e.pct}% (${targetActionsChip(e.turns)})`;
    case "hpCostDamage":
      return `명중 시 HP ${e.pctCurrentHp}% 소모 → 피해 ${damageFormulaChip(e, tier, directDamageEffectCount, monsterOnly)} + 기준 소모량×${e.soakRatio}${e.soakCurrentHpFloorPct ? ` (추가 피해 기준 현재 HP 최소 ${e.soakCurrentHpFloorPct}%)` : ""}`;
    case "missingHpDamage":
      return describeMissingHpDamage(e).join(" · ");
    case "healToDamage":
      return `자힐 ${scalingStatLabel(e.scaling)}×${formatSkillCoefficient(v2SkillHealStatCoef(e.healStatCoef))}${flatChip(undefined, e.healFlatByTier)} (회복량 보정 적용) → 힐량×${e.damageRatio} 피해`;
    case "executeDamage":
      return `피해 ${damageFormulaChip(e, tier, directDamageEffectCount, monsterOnly)} (적 HP ${e.hpThresholdPct}%↓ 시 ×${e.bonusMult}, 일반 몬스터는 35%↓)`;
    case "ambushDamage":
      return `피해 ${damageFormulaChip(e, tier, directDamageEffectCount, monsterOnly)} (적 HP ${e.hpThresholdPct}%↑ 시 ${e.pvpBonusMult != null && e.pvpBonusMult !== e.bonusMult ? `PvE ×${e.bonusMult} · PvP ×${e.pvpBonusMult}` : `×${e.bonusMult}`})`;
    case "stackPayoffDamage":
      return `피해 ${damageFormulaChip(e, tier, directDamageEffectCount, monsterOnly)} + 적 ${STACK_TAG_LABEL[e.tag]} 스택당 ${e.tag === "poison" ? "방어 무시 " : ""}+${e.perStackFlat}`;
    case "dot":
      return `${e.label} 지속피해 +${e.stacks}스택 (${targetActionsChip(e.turns)}, 최대 ${e.maxStacks}스택${e.tag === "poison" ? ", 보스 최대 HP 비례분 50%" : ""})`;
  }
  // 모든 효과 종류 처리됨 — 새 kind 추가 시 컴파일 에러로 누락 방지.
  const _exhaustive: never = e;
  return _exhaustive;
}

// 스킬의 상세 옵션을 칩 문자열 배열로 — 효과(피해/회복/버프/디버프/DoT) 먼저, 그 뒤
// MP·쿨다운·속성 메타. UI(학습/장착 화면)에서 작은 칩으로 표기.
//
// MP 칩 = 고정 절대값(v2SkillMpCostValue) → "MP 55". 무료/몬스터 스킬(0)은 생략.
// 패시브 스킬 효과 → 칩 문자열. 장착 상시 효과(근력 "힘 +10" / 예기 "민첩→공격력").
function describePassive(p: V2PassiveSkillEffect): string[] {
  const chips: string[] = [];
  for (const [k, v] of Object.entries(p.stat ?? {})) {
    if (v) chips.push(`${V2_STAT_LABELS[k as V2StatKey]} +${v}`);
  }
  for (const [k, v] of Object.entries(p.statPct ?? {})) {
    if (v) chips.push(`${V2_STAT_LABELS[k as V2StatKey]} +${v}%`);
  }
  if (p.maxHpPct) chips.push(`최대 HP +${p.maxHpPct}%`);
  if (p.maxMpPct) chips.push(`최대 MP +${p.maxMpPct}%`);
  if (p.mpCostReductionPct)
    chips.push(`마법 MP 소모 -${p.mpCostReductionPct}%`);
  if (p.freezeDamagePct) chips.push(`빙결 피해 +${p.freezeDamagePct}%`);
  if (p.freezeDelayPct) chips.push(`빙결 행동 지연 ${p.freezeDelayPct}%`);
  if (p.freezeRetainStacks) {
    chips.push(`빙결 후 한기 ${p.freezeRetainStacks} 잔류`);
  }
  if (p.magicBarrier) chips.push("마나 실드 활성화");
  if (p.atkPerDexCoef) chips.push("민첩이 공격력을 보조");
  if (p.critPct) chips.push(`치명타 확률 +${p.critPct}%`);
  if (p.critDmgPct) chips.push(`치명타 피해 +${p.critDmgPct}%`);
  if (p.evasionPct) chips.push(`회피도 +${p.evasionPct}%`);
  if (p.lifestealPct) chips.push(`흡혈 +${p.lifestealPct}%`);
  if (p.counterChancePct) chips.push(`HP 피해 시 ${p.counterChancePct}% 반격`);
  if (p.defPct) chips.push(`물리·마법 방어력 +${p.defPct}%`);
  if (p.thornsDefPct) chips.push(`HP 피해 시 방어력의 ${p.thornsDefPct}% 반사`);
  if (p.fortressImpactOnHit) chips.push("적의 직접 공격 명중 시 충격 +1 (최대 3)");
  if (p.fortressImpactDamagePctPerStack)
    chips.push(`충격 소비 공격 최종 피해 스택당 +${p.fortressImpactDamagePctPerStack}%`);
  if (p.fortressDefSkillStatCoefPct)
    chips.push(`방어력 직접 공격 계수 +${p.fortressDefSkillStatCoefPct}%`);
  if (p.accuracyPct) chips.push(`적중도 +${p.accuracyPct}%`);
  if (p.healPowerPct) chips.push(`회복 +${p.healPowerPct}%`);
  if (p.damageTakenReductionPct)
    chips.push(`받는 피해 -${p.damageTakenReductionPct}%`);
  if (p.statusDamageReductionPct)
    chips.push(`상태이상 피해 -${p.statusDamageReductionPct}%`);
  if (p.bleedPhysicalSkillDamagePctPerStack)
    chips.push(
      `대상 출혈 스택당 직접 물리 스킬 피해 +${p.bleedPhysicalSkillDamagePctPerStack}% (최대 +20%)`,
    );
  if (p.stoneskinDefPctPerWeight)
    chips.push(`중량당 방어력 +${p.stoneskinDefPctPerWeight}%`);
  if (p.magicDefPct) chips.push(`마법 방어력 +${p.magicDefPct}%`);
  if (p.openingMagicDamageReductionPct) {
    chips.push(
      `전투 초반 적 공격 ${p.openingMagicDamageReductionPhases ?? 3}회 동안 받는 마법 피해 -${p.openingMagicDamageReductionPct}% (회피한 공격 포함)`,
    );
    chips.push("초반 마법 피해 감소 중첩 시 감소율 합산 · 횟수는 최댓값");
  }
  if (p.elementResonance) chips.push("원소 폭주 속성 효과 강화");
  if (p.inscriptionAmplification) chips.push("각인 해방 문장 시너지 강화");
  if (p.lawInscription) chips.push("문장 해방 시 장착 재료별 법칙 각인 생성");
  if (p.tripleWardRank === 1) {
    chips.push("삼중 결계 각 1회 · 직접 피해 PvE -45% / PvP -30%");
  }
  if (p.tripleWardRank === 2) {
    chips.push("삼중 결계 각 3회 · 직접 피해 PvE -60% / PvP -40%");
    chips.push("결계 소모 시 영역 안정 +1 (받는 피해 -4%, 최대 3중첩)");
  }
  if (p.poisonedEnemyDefReductionPct)
    chips.push(`중독 적 방어 -${p.poisonedEnemyDefReductionPct}%`);
  if (p.poisonDamagePct) chips.push(`중독 피해 +${p.poisonDamagePct}%`);
  if (p.enemyPhysicalDefReductionPct)
    chips.push(`적 물리 방어 -${p.enemyPhysicalDefReductionPct}%`);
  if (p.enemyMagicDefReductionPct)
    chips.push(`적 마법 방어 -${p.enemyMagicDefReductionPct}%`);
  if (p.berserkAtkPctPerLostHpPct)
    chips.push(`잃은 HP 1%당 공격력 +${p.berserkAtkPctPerLostHpPct}%`);
  if (p.enemyMagicVulnPctPerStack)
    chips.push(`마법취약 스택당 받는 스킬피해 +${p.enemyMagicVulnPctPerStack}%`);
  if (p.enemyMagicVulnApplyChancePct)
    chips.push(`마법취약 누적 확률 ${p.enemyMagicVulnApplyChancePct}%`);
  if (p.magicSkillDamagePct)
    chips.push(`마법 스킬 피해 +${p.magicSkillDamagePct}%`);
  if (p.singleHitPhysicalSkillDamagePct)
    chips.push(`단일 타격 물리 스킬 피해 +${p.singleHitPhysicalSkillDamagePct}%`);
  if (p.profPerKillBonus) chips.push(`사냥 승리 숙달 +${p.profPerKillBonus}`);
  if (p.fishingSizeBonusPct)
    chips.push(`물고기 크기 +${p.fishingSizeBonusPct}%`);
  if (p.fishingSpecialWeightPct)
    chips.push(`물때 한정 어종 등장률 +${p.fishingSpecialWeightPct}%`);
  if (p.fishingRareSizeBonusPct)
    chips.push(`희귀 이상 물고기 크기 +${p.fishingRareSizeBonusPct}%`);
  if (p.fishingBigCatchSizeBonusPct)
    chips.push(`대물급 물고기 크기 +${p.fishingBigCatchSizeBonusPct}%`);
  if (p.guildTrainingRewardBonusPct)
    chips.push(`훈련장 보상 +${p.guildTrainingRewardBonusPct}% (누적 지급)`);
  if (p.guildTrainingWeeklyBonusMastery)
    chips.push(`주간 훈련 보너스 +${p.guildTrainingWeeklyBonusMastery}`);
  if (p.farmYieldBonusPct)
    chips.push(`농장 수확량 +${p.farmYieldBonusPct}% (누적 지급)`);
  if (p.farmRareChancePct)
    chips.push(`희귀 수확 확률 +${p.farmRareChancePct}%`);
  if (p.cookingXpBonusPct)
    chips.push(`요리 경험치 +${p.cookingXpBonusPct}% (평균 적용)`);
  if (p.cookingCarefulChancePct)
    chips.push(`정성작 확률 +${p.cookingCarefulChancePct}%`);
  if (p.cookingMaterialReductionPct)
    chips.push(
      `묶음 조리 일반 재료 -${p.cookingMaterialReductionPct}% (누적 절약)`,
    );
  if (p.cookingMasterpieceChancePct)
    chips.push(`걸작 확률 +${p.cookingMasterpieceChancePct}%`);
  if (p.cookingRareIngredientSaveChancePct)
    chips.push(`희귀 재료 보존 ${p.cookingRareIngredientSaveChancePct}%`);
  if (p.woodcuttingFailureReductionPct)
    chips.push(`벌목 실패율 -${p.woodcuttingFailureReductionPct}%`);
  if (p.woodcuttingDurationReductionPct)
    chips.push(`벌목 시간 -${p.woodcuttingDurationReductionPct}%`);
  if (p.woodcuttingFailureRecoveryPct)
    chips.push(`벌목 실패 구제 ${p.woodcuttingFailureRecoveryPct}%`);
  if (p.woodcuttingBonusLogChancePct)
    chips.push(`추가 원목 확률 ${p.woodcuttingBonusLogChancePct}%`);
  if (p.miningFailureReductionPct)
    chips.push(`채광 실패율 -${p.miningFailureReductionPct}%`);
  if (p.miningDurationReductionPct)
    chips.push(`채광 시간 -${p.miningDurationReductionPct}%`);
  if (p.miningFailureRecoveryPct)
    chips.push(`채광 실패 구제 ${p.miningFailureRecoveryPct}%`);
  if (p.miningBonusOreChancePct)
    chips.push(`추가 광석 확률 ${p.miningBonusOreChancePct}%`);
  if (p.spdToAtkMaxPct)
    chips.push(`속도에 비례해 공격력 증가 (최대 +${p.spdToAtkMaxPct}%에 가까워짐)`);
  if (p.spdPerLukCoef)
    chips.push(`행운 ×${p.spdPerLukCoef}만큼 속도 증가`);
  if (p.atkPerLukCoef)
    chips.push(`행운 ×${p.atkPerLukCoef}만큼 공격력 증가`);
  if (p.skillCritOverflow)
    chips.push(`치명타 한계(75%) 초과 보너스를 스킬에도 적용`);
  if (p.skillCritDmgPct)
    chips.push(`스킬 치명타 피해 +${p.skillCritDmgPct}%`);
  if (p.equipmentMagicSkillCritConversion)
    chips.push(`장비 치명타 배율을 마법 스킬 치명타 배율로 변환 (최대 +0.75배)`);
  if (p.skillCritAfterEvade)
    chips.push(`회피 후 다음 직접 피해 스킬 확정 치명타`);
  if (p.comboFinisherBonusPct)
    chips.push(`4타마다 피해 +${p.comboFinisherBonusPct}%`);
  if (p.basicDefPenetrationPct)
    chips.push(`평타 방어 관통 +${p.basicDefPenetrationPct}%p`);
  if (p.basicCritHastePct)
    chips.push(`평타 치명타 시 다음 행동 간격 -${p.basicCritHastePct}% (1회)`);
  if (p.basicCritChanceCap && p.basicCritChanceCap > 75)
    chips.push(`평타 치명타 확률 상한 ${p.basicCritChanceCap}%`);
  return chips;
}

function describeTier7Mechanic(mechanic: Tier7Mechanic): string[] {
  switch (mechanic.kind) {
    case "shadowStrike":
      return [
        `검영 기록 ${mechanic.recordPct}% · 정련 시 ${mechanic.refinedRecordPct}%`,
      ];
    case "shadowRefine":
      return [
        `검영 정련 +${mechanic.refinePctPoints}%p · 발동 후 행동 가속 ${mechanic.hastePct}%`,
      ];
    case "shadowCore":
      return [
        `단일 물리 최종 피해 ${mechanic.recordPct}% 기록 · 정련 시 ${mechanic.refinedRecordPct}%`,
        `검영 발동 후 다음 단일 물리 피해 +${mechanic.nextSingleDamagePct}%`,
        `PvP 검영·후속 보너스 ${mechanic.pvpScalePct}% 적용`,
      ];
    case "intentStrike":
      return [
        `잃은 HP 비례 최종 피해 최대 +${mechanic.missingHpBonusCapPct}%`,
        `HP ${mechanic.lowHpThresholdPct}% 이하 적중 시 검의 2개`,
      ];
    case "intentCore":
      return [
        `검의 최대 ${mechanic.maxStacks}개 · 단일 물리 최종 피해 개당 +${mechanic.damagePctPerStack}%`,
        `멸검 최종 피해 검의 개당 +${mechanic.finisherPctPerStack}%`,
      ];
    case "chargedFinisher":
      return [
        `현재 잃은 HP 최대 +${mechanic.currentMissingHpCapPct}% · 충전 중 잃은 HP 최대 +${mechanic.chargeLostHpCapPct}%`,
        `PvP 각 보너스 최대 ${mechanic.pvpCapPct}% · 관통 ${mechanic.pvpPenetrationPct}%`,
      ];
    case "crossStrike":
      return [`교차 계열: ${mechanic.family === "ranged" ? "원거리" : "체술"}`];
    case "crossCore":
      return [
        `포획: 최종 피해 +${mechanic.captureDamagePct}% · 적중 +${mechanic.captureAccuracyPct}% · 관통 ${mechanic.capturePenetrationPct}%`,
        `추격: 추가 피해 ${mechanic.pursuitDamagePct}% · 적 행동 지연 ${mechanic.pursuitEnemyDelayPct}%`,
        `교차 적중 시 행동 가속 ${mechanic.hastePct}% · PvP ${mechanic.pvpHastePct}%`,
      ];
    case "formulaStrike":
      return [
        `술식 ${mechanic.stages}단계 · 완전식 발동 후 행동 가속 ${mechanic.completionHastePct}%`,
      ];
    case "manaOptimization":
      return [
        `완전식 MP 부족 시 현재 MP 전부 소비 · 최대 MP ${mechanic.restoreMaxMpPct}% 회복`,
      ];
    case "completeFormula":
      return [
        `완전식: 직접 최종 피해 +${mechanic.directDamagePct}% · 관통 +${mechanic.penetrationPct}% · 행동 가속 ${mechanic.hastePct}%`,
        `PvP: 직접 최종 피해 +${mechanic.pvpDamagePct}% · 관통 +${mechanic.pvpPenetrationPct}% · 행동 가속 ${mechanic.pvpHastePct}%`,
      ];
  }
  const _exhaustive: never = mechanic;
  return _exhaustive;
}

function describeDuelistDeclaration(
  declaration: NonNullable<V2SkillDefinition["duelistDeclaration"]>,
): string[] {
  const chips = [`다음 평타 ${declaration.hits}회`];
  if (declaration.basicDamagePct)
    chips.push(`평타 피해 +${declaration.basicDamagePct}%`);
  if (declaration.basicCritChancePct)
    chips.push(`평타 치명타 확률 +${declaration.basicCritChancePct}%p`);
  if (declaration.basicDefPenetrationPct)
    chips.push(`평타 방어 관통 +${declaration.basicDefPenetrationPct}%p`);
  if (declaration.rampPctPerPriorHit) {
    const maxPct = declaration.rampPctPerPriorHit * (declaration.hits - 1);
    chips.push(
      `연속 평타마다 피해 +${declaration.rampPctPerPriorHit}% (최대 +${maxPct}%)`,
    );
  }
  if (declaration.basicCritMultAdd)
    chips.push(`평타 치명타 배율 +${declaration.basicCritMultAdd.toFixed(2)}배`);
  if (declaration.basicCritChanceCap && declaration.basicCritChanceCap > 75)
    chips.push(`평타 치명타 확률 상한 ${declaration.basicCritChanceCap}%`);
  return chips;
}

// ── MP 비용 루브릭 (P5 — 고정 절대값 모델) ──────────────────────────────────
// 정적·직업무차별 mpCost(풀 대비 과소 → MP 가 죽은 자원) 를 "기준 풀 × % × 계열 × 차수" 로
// 산정한 고정 절대값으로 대체. 풀 성장(INT)과 무관한 고정값 → 예측 가능(지속형 MP 자원: 전투 중
// 재생 없이 치료소/물약 리필). 무료(mpCost 0 센티넬: 패시브·기본기·명상)·몬스터(monsterOnly)는
// 그 literal 그대로. MP_REFERENCE_POOL·MP_BASE_PCT 가 튜닝 다이얼. 표시·차감 동일 산식 공유.
export const MP_REFERENCE_POOL = 600; // 산정 기준 풀(~중간 캐스터). 올리면 전체 비용↑·엔드 타이트.
export const MP_BASE_PCT = 0.07;
const MP_TIER_MULT: Record<1 | 2 | 3, number> = { 1: 1.0, 2: 1.4, 3: 1.8 };
// 계열 = 직업 계보(tier1~4) 전체. 캐스터 ×1.3 — 큰 풀·마나가 핵심 자원.
const MP_CASTER_JOBS = new Set([
  "mage", "caster", "acolyte", "warder", "magus", "bishop", "sage", "elementalist", "archbishop",
  "firemage", "frostmage", "lightningmage", "windmage", "earthmage",
  "elementallord", "cryomancer", "inscriber", "archmage", "primordialmage", "frostsovereign",
]);
// 무인 ×0.85 — 기 기반·작은 풀.
const MP_MARTIAL_JOBS = new Set([
  "martial", "boxer", "monk", "brawler", "warmonk", "sensei", "battlemonk",
  "dragonfist", "adamantmonk", "celestialdragon", "vajraarhat",
]);
// 도적 ×0.7 — 물리/술수·MP 가벼움.
const MP_ROGUE_JOBS = new Set([
  "rogue", "assassin", "archer", "venomist", "shadow", "ranger", "venomancer",
  "phantom", "chief", "venomlord", "marksman", "nightshade", "plaguebringer",
  "heavenlybow", "blackmoon", "myriadvenom",
]);
// default 1.0 = 병사 계보(warrior/shieldman/squire/paladin/guardian/veteran/warden)
//   + 하이브리드(templar/spellblade) + none·스타터(v2_skill_).
function mpArchetypeMult(id: string): number {
  const job = id.split("_")[1] ?? ""; // v2c_<직업>_… / v2_skill_… 접두에서 계열 추출
  if (MP_CASTER_JOBS.has(job)) return 1.3;
  if (MP_MARTIAL_JOBS.has(job)) return 0.85;
  if (MP_ROGUE_JOBS.has(job)) return 0.7;
  return 1.0;
}
// 플레이어 학습 스킬 1회 시전 MP 비용(고정 절대값). 무료·몬스터 스킬은 그 literal 그대로.
export function v2SkillMpCostValue(def: V2SkillDefinition): number {
  if (def.mpCost === 0 || def.monsterOnly) return def.mpCost;
  if (typeof def.fixedMpCost === "number") return Math.max(1, Math.floor(def.fixedMpCost));
  const pct = MP_BASE_PCT * mpArchetypeMult(def.id) * MP_TIER_MULT[def.tier];
  return Math.max(1, Math.round(MP_REFERENCE_POOL * pct));
}

export function describeV2Skill(skill: V2SkillDefinition): string[] {
  // 독 계열 복합기는 전투 처리상 중독 부여를 먼저 선언하지만, 설명은 독침과 같은
  // "계수 피해 → 중독 스택" 순서로 보여준다. 실행용 effects 배열은 건드리지 않는다.
  const displayEffects = (() => {
    const poisonDotIndex = skill.effects.findIndex(
      (effect) => effect.kind === "dot" && effect.tag === "poison",
    );
    const poisonPayoffIndex = skill.effects.findIndex(
      (effect) =>
        effect.kind === "stackPayoffDamage" && effect.tag === "poison",
    );
    if (
      poisonDotIndex < 0 ||
      poisonPayoffIndex < 0 ||
      poisonPayoffIndex < poisonDotIndex
    ) {
      return skill.effects;
    }

    const reordered = [...skill.effects];
    const [payoff] = reordered.splice(poisonPayoffIndex, 1);
    reordered.splice(poisonDotIndex, 0, payoff);
    return reordered;
  })();
  const directDamageEffectCount = Math.max(
    1,
    displayEffects.filter(isDirectDamageEffect).length,
  );
  const chips = skill.passive
    ? describePassive(skill.passive)
    : displayEffects.flatMap((effect) =>
        effect.kind === "missingHpDamage"
          ? describeMissingHpDamage(effect)
          : [
              describeV2Effect(
                effect,
                skill.tier,
                directDamageEffectCount,
                skill.monsterOnly === true,
              ),
            ],
      );
  chips.push(...describeBerserkerLineageRules(skill));
  chips.push(...describeBleedHunt(skill));
  // 각 직접 피해 effect 는 전투 로그에서 별도 타격으로 처리된다. 피해 칩이 여러 개 나열되는 것만으로는
  // 다단 여부가 잘 드러나지 않으므로 학습·장착·전투 패턴 툴팁 맨 앞에 기본 타수를 명시한다.
  if (!skill.passive && directDamageEffectCount > 1) {
    chips.unshift(`${directDamageEffectCount}회 공격`);
  }
  if (skill.provokeImmediateBasicAttacks) {
    chips.push(
      `도발: 상대가 즉시 시전자를 기본 공격 ${skill.provokeImmediateBasicAttacks}회`,
    );
  }
  if (skill.ironWallReflect) {
    chips.push(
      `철벽 반사 ${skill.ironWallReflect.charges}회 · 받는 피해 -${skill.ironWallReflect.damageReductionPct}% · 방어력의 ${skill.ironWallReflect.reflectDefPct}% 반사`,
    );
  }
  if (skill.refreshTripleWards) chips.push("삼중 결계 전부 재전개");
  if (skill.duelistDeclaration) {
    chips.push(...describeDuelistDeclaration(skill.duelistDeclaration));
  }
  if (skill.skillCritChancePct) {
    chips.push(`이 스킬 치명타 확률 +${skill.skillCritChancePct}%p`);
  }
  if (skill.accuracyBonusPct) {
    chips.push(`이 스킬 적중도 +${skill.accuracyBonusPct}%`);
  }
  if (skill.tier7Mechanic) {
    chips.push(...describeTier7Mechanic(skill.tier7Mechanic));
  }
  if (skill.consumesFortressImpact) chips.push("명중 시 충격 전부 소비");
  if (skill.mutationWeightGain) {
    chips.push(`중량 +${skill.mutationWeightGain} (최대 3)`);
  }
  if (skill.frostChillGain) {
    chips.push(`적중 시 한기 +${skill.frostChillGain}`);
  }
  if (skill.mutationWeightConsumePctPerStack) {
    chips.push(
      `중량 전부 소모 · 스택당 최종 피해 +${skill.mutationWeightConsumePctPerStack}%`,
    );
  }
  if (
    skill.effects.some(
      (payoff) =>
        payoff.kind === "stackPayoffDamage" &&
        payoff.tag === "poison" &&
        skill.effects.some(
          (dot) => dot.kind === "dot" && dot.tag === payoff.tag,
        ),
    )
  ) {
    chips.push("중첩 폭발에 이번 시전 스택 포함");
  }
  // 발동 확률 — 액티브는 100%(미지정)도 명시해 스킬별 발동 정보가 빠져 보이지 않게 한다.
  //   실패 시 평타로 폴백(MP·쿨다운 미소모). 패시브는 발동 개념이 없어 제외.
  const proc = skill.procChance ?? 100;
  if (!skill.passive) chips.push(`발동 ${proc}%`);
  if (skill.castVariants?.length) {
    chips.push(`보유·장착 주문식 ${skill.castVariants.length}종`);
  }
  // MP 비용 = 고정 절대값(기준 풀 기반) → 인게임·매뉴얼 동일 숫자. 무료/몬스터(0)는 칩 생략.
  const mp = v2SkillMpCostValue(skill);
  if (mp > 0) chips.push(`MP ${mp}`);
  if (skill.oncePerBattle) chips.push("전투당 1회");
  if (isLimitedRecoverySkillId(skill.id)) {
    chips.push("원정당 1회 · 대련 효과 50%");
  }
  if (skill.cooldown > 0) chips.push(`쿨 ${skill.cooldown}행동`);
  if (skill.element && skill.element !== "neutral") {
    chips.push(`속성 ${V2_ELEMENT_LABEL[skill.element]}`);
  }
  return chips;
}

// 네이티브 select처럼 별도 효과 UI를 넣을 수 없는 곳에서 이름과 전투 정보를 함께 보여준다.
export function v2SkillSelectLabel(skill: V2SkillDefinition): string {
  return [skill.name, ...describeV2Skill(skill)].join(" · ");
}

export function v2SkillSearchText(skill: V2SkillDefinition): string {
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.stat,
    skill.category,
    skill.element ? V2_ELEMENT_LABEL[skill.element] : "",
    ...(skill.castVariants?.map((variant) => variant.name) ?? []),
    ...describeV2Skill(skill),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

// 모든 스타터 id — PR-2 스타터 지급/백필에서 사용.
export const V2_STARTER_SKILL_IDS: readonly V2SkillId[] = [
  "v2_skill_strike",
  "v2_skill_flurry",
  "v2_skill_recover",
  "v2_skill_dash",
  "v2_skill_fortune",
  "v2_skill_meditate",
] as const;

const VALID_SKILL_IDS: ReadonlySet<string> = new Set(Object.keys(V2_SKILLS));
const MAX_SKILL_ORDER_INPUT = Object.keys(V2_SKILLS).length;

// === 저장 형태 ───────────────────────────────────────────────────────
// saves_kv 키 "skills.v2" — 서버 권위 (equipment.v2 와 동일 패턴, SYNCED_KEYS 외).
// 학습: 교관 NPC API 만 변경 가능. 장착: equip API 만 변경 가능.

export type V2SkillsState = {
  /** 학습 보유 스킬 id 목록 (영구, 중복 없음). */
  learned: V2SkillId[];
  /** SP 로드아웃 스킬 id 목록 (배열 순서 = 자동 발동 우선순위, learned 의 부분집합).
   *  배운 생활 패시브는 파싱 시 항상 포함된다. */
  equipped: V2SkillId[];
  /** 학습 라이브러리 표시 순서. 전투/소유 판정과 무관한 UI 정렬값. */
  skillOrder?: V2SkillId[];
  /** 학습 라이브러리 즐겨찾기. 전투/소유 판정과 무관한 UI 표시값. */
  favoriteSkills?: V2SkillId[];
  /** 전투 패턴(갬빗, C2) — 우선순위 {조건→행동} 블록. 미설정(undefined)이면 엔진이 로드아웃에서
   *  기본 패턴 도출(defaultPatternFromEquipped). combat-pattern 라우트만 변경. */
  pattern?: V2CombatPattern;
  /** 전투 패턴 프리셋(C4) — 이름 붙인 패턴 라이브러리(빠른 스왑용). 활성 패턴(pattern)과 별개,
   *  엔진 미사용(순수 저장). combat-pattern/presets 라우트만 변경. 미설정=빈 라이브러리. */
  presets?: V2CombatPreset[];
  /** 로드아웃 프리셋 — 이름 붙인 장착 스킬 묶음(빠른 빌드 전환). 엔진 미사용(순수 저장).
   *  loadout-presets 라우트만 변경. 슬롯 수 = totalPresetSlots()(무료 고정). 옛
   *  loadoutPresetSlotsBought 필드는 폐기(수집 포인트 경제 제거) — 옛 세이브에 남아도 inert. */
  loadoutPresets?: V2LoadoutPreset[];
  /** 스킬 강화 의식 — skillId 별 강화 단계(+1~+5). 배운 스킬만 보존한다. */
  enhancements?: V2SkillEnhancements;
};

export function emptyV2SkillsState(): V2SkillsState {
  return { learned: [], equipped: [] };
}

export function normalizeSkillOrder(
  rawOrder: unknown,
  learned: readonly V2SkillId[],
): V2SkillId[] {
  if (!Array.isArray(rawOrder)) return [];
  const learnedSet = new Set<string>(learned);
  const seen = new Set<string>();
  const out: V2SkillId[] = [];
  for (const id of rawOrder.slice(0, MAX_SKILL_ORDER_INPUT)) {
    if (typeof id !== "string") continue;
    if (!VALID_SKILL_IDS.has(id) || !learnedSet.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id as V2SkillId);
  }
  return out;
}

export function orderedLearnedSkills(
  learned: readonly V2SkillId[],
  skillOrder: readonly V2SkillId[] | undefined,
): V2SkillId[] {
  if (!skillOrder || skillOrder.length === 0) return [...learned];
  const learnedSet = new Set<string>(learned);
  const seen = new Set<string>();
  const out: V2SkillId[] = [];
  for (const id of skillOrder) {
    if (!learnedSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  for (const id of learned) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeFavoriteSkills(
  rawFavorites: unknown,
  learned: readonly V2SkillId[],
): V2SkillId[] {
  if (!Array.isArray(rawFavorites)) return [];
  const learnedSet = new Set<string>(learned);
  const seen = new Set<string>();
  const out: V2SkillId[] = [];
  for (const id of rawFavorites.slice(0, MAX_SKILL_ORDER_INPUT)) {
    if (typeof id !== "string") continue;
    if (!VALID_SKILL_IDS.has(id) || !learnedSet.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id as V2SkillId);
  }
  return out;
}

// 손상/누락 raw 도 안전하게 정규화. learned 의 부분집합인 equipped 만 유지하고, 배운 생활
// 패시브는 누락됐더라도 항상 추가한다.
// SP 예산 클램프는 proficiency/character 컨텍스트가 있는 라우트에서 sanitizeLoadout 으로 처리한다.
export function parseV2SkillsState(raw: unknown): V2SkillsState {
  if (!raw || typeof raw !== "object") return emptyV2SkillsState();
  const r = raw as { learned?: unknown; equipped?: unknown };
  const learned: V2SkillId[] = [];
  const learnedSet = new Set<string>();
  const learnedRaw = Array.isArray(r.learned) ? r.learned : [];
  for (const id of learnedRaw) {
    if (typeof id !== "string" || !VALID_SKILL_IDS.has(id)) continue;
    if (learnedSet.has(id)) continue;
    learnedSet.add(id);
    learned.push(id as V2SkillId);
  }
  const equipped: V2SkillId[] = [];
  const equippedSet = new Set<string>();
  const equippedRaw = Array.isArray(r.equipped) ? r.equipped : [];
  for (const id of equippedRaw) {
    if (typeof id !== "string" || !VALID_SKILL_IDS.has(id)) continue;
    if (equippedSet.has(id)) continue;
    // 장착하려면 학습 보유 필요 (race 보정).
    if (!learnedSet.has(id)) continue;
    equippedSet.add(id);
    equipped.push(id as V2SkillId);
  }
  const equippedWithLifestyle = includeLearnedLifestyleSkills(
    equipped,
    learned,
  );
  // 전투 패턴 — 있으면 검증 파싱(블록 단위 drop), 없으면 미설정(undefined → 엔진 기본 패턴).
  const rawPattern = (raw as { pattern?: unknown }).pattern;
  const pattern =
    rawPattern != null ? parseCombatPattern(rawPattern) : undefined;
  // 프리셋(C4) — 있으면 검증 파싱(항목 단위 drop), 비었으면 키 생략(하위호환).
  const rawPresets = (raw as { presets?: unknown }).presets;
  const presets =
    rawPresets != null ? parseCombatPresets(rawPresets) : [];
  // 로드아웃 프리셋 — 무료 고정 슬롯 수(totalPresetSlots)만큼만 유지. 옛 loadoutPresetSlotsBought
  //   필드는 폐기(수집 포인트 경제 제거) — 읽지 않음(옛 세이브에 남아도 inert).
  const rawLoadoutPresets = (raw as { loadoutPresets?: unknown }).loadoutPresets;
  const loadoutPresets = parseLoadoutPresetsRaw(
    rawLoadoutPresets,
    totalPresetSlots(),
  );
  const skillOrder = normalizeSkillOrder(
    (raw as { skillOrder?: unknown }).skillOrder,
    learned,
  );
  const favoriteSkills = normalizeFavoriteSkills(
    (raw as { favoriteSkills?: unknown }).favoriteSkills,
    learned,
  );
  const enhancements = normalizeSkillEnhancements(
    (raw as { enhancements?: unknown }).enhancements,
    learned,
  );
  let base: V2SkillsState = pattern
    ? { learned, equipped: equippedWithLifestyle, pattern }
    : { learned, equipped: equippedWithLifestyle };
  if (skillOrder.length > 0) base = { ...base, skillOrder };
  if (favoriteSkills.length > 0) base = { ...base, favoriteSkills };
  if (presets.length > 0) base = { ...base, presets };
  if (loadoutPresets.length > 0) base = { ...base, loadoutPresets };
  if (Object.keys(enhancements).length > 0) base = { ...base, enhancements };
  return base;
}

// 로드아웃 프리셋 raw 검증 파싱(항목 단위 drop) — 이름 trim·길이 상한, skills 는 유효 id·중복
//   제거, 프리셋 개수는 maxSlots 로 상한. 손상 입력 안전(빈 배열 폴백).
function parseLoadoutPresetsRaw(
  raw: unknown,
  maxSlots: number,
): V2LoadoutPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: V2LoadoutPreset[] = [];
  for (const item of raw) {
    if (out.length >= maxSlots) break;
    if (!item || typeof item !== "object") continue;
    const r = item as { name?: unknown; skills?: unknown };
    const name =
      typeof r.name === "string" ? r.name.trim().slice(0, PRESET_NAME_MAX) : "";
    const skills: V2SkillId[] = [];
    const seen = new Set<string>();
    const skillsRaw = Array.isArray(r.skills) ? r.skills : [];
    for (const id of skillsRaw) {
      if (typeof id !== "string" || !VALID_SKILL_IDS.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      skills.push(id as V2SkillId);
    }
    out.push({ name, skills });
  }
  return out;
}

// === 스마트 기본 패턴 (커스텀 패턴 미설정 시) =============================
// combatPattern 의 defaultPatternFromEquipped 는 모든 스킬에 "항상"을 깐다 → 유틸 스킬(명상·버프·
// 힐)이 매 턴 스팸되고 공격을 안 하는 자해 루프가 생긴다(특히 명상=0코스트·0쿨이라 매 턴 발동).
// 여기선 카탈로그를 봐서 스킬 종류별 합리적 기본 조건을 깐다 — 공격은 "항상", 유틸은 필요할 때만.
//   (combatPattern 은 순수 모듈이라 카탈로그를 못 봐서, 카탈로그가 있는 이 레이어에 둔다.)
// "적에게 피해" = 직접 피해 + 지속피해(DoT) 적용. 순수 DoT 공격 스킬(자상·독무 = dot 효과만,
//   직접 데미지 없음)도 매 턴 발동해야 하는 공격기라 포함한다(빠지면 첫 턴만 발동하고 죽는다).
const DAMAGE_EFFECT_KINDS = new Set([
  "damage",
  "dot",
  "hpCostDamage",
  "missingHpDamage",
  "healToDamage",
  "executeDamage",
  "stackPayoffDamage",
]);

// 스킬 1종의 기본 발동 조건 — 적에게 피해를 주면(직접/DoT) "항상"(평타 자리), 순수 유틸은 종류별 조건.
export function smartDefaultConditionForSkill(
  def: V2SkillDefinition,
): V2CombatCondition {
  const effs = def.effects;
  if (def.provokeImmediateBasicAttacks) {
    return { kind: "always" };
  }
  if (def.ironWallReflect) {
    return {
      kind: "self_resource",
      resource: "ironWallReflect",
      op: "none",
      value: 0,
    };
  }
  // 기습(ambushDamage) — 풀피 적에게만 큰 딜(처형의 역). 기본딜이 낮아 깎인 적엔 평타 이하라, 기본
  //   조건을 "첫 턴만(turn≤1)"으로 깔아 자동전투가 오프너 1회만 쏘게 한다("딱 첫 턴만"). 더 정교하게
  //   쓰려면 패턴 편집(예: 적 풀피일 때 재발동) — 패턴 사용 유도. DAMAGE_EFFECT_KINDS 의 "항상"보다 먼저.
  if (effs.some((e) => e.kind === "ambushDamage")) {
    return { kind: "turn", op: "atMost", value: 1 };
  }
  // 적에게 피해를 주는 스킬(부가 DoT/디버프 동반 포함)은 평타 대체 = 항상 발동.
  if (effs.some((e) => DAMAGE_EFFECT_KINDS.has(e.kind))) return { kind: "always" };
  // 순수 유틸 — 매 턴 스팸 방지로 종류별 조건.
  const hasHeal = effs.some((e) => e.kind === "heal");
  const hasShield = effs.some((e) => e.kind === "shield");
  if (hasHeal && hasShield) {
    return {
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 50 },
        { kind: "self_shield", active: false },
      ],
    }; // 회복+보호막 = 저HP이고 기존 보호막이 없을 때.
  }
  if (hasHeal) {
    return { kind: "self_hp", op: "below", pct: 50 }; // 힐 = HP 낮을 때.
  }
  if (hasShield) {
    return {
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 70 },
        { kind: "self_shield", active: false },
      ],
    }; // 보호막 = 피해 입었고 기존 보호막이 없을 때.
  }
  if (effs.some((e) => e.kind === "selfRegen")) {
    return {
      kind: "all",
      conditions: [
        { kind: "self_hp", op: "below", pct: 60 },
        { kind: "self_buff_pct", target: "regen", active: false },
      ],
    }; // 리젠 = 피해를 입었고 기존 지속 회복이 없을 때.
  }
  if (effs.some((e) => e.kind === "manaRestore")) {
    return { kind: "self_mp", op: "below", pct: 20 }; // 마나 회복(명상) = MP가 바닥날 때만.
  }
  if (effs.some((e) => e.kind === "guaranteedEvade")) {
    return { kind: "turn", op: "atMost", value: 1 }; // 전투당 1회 생존기 = 첫 턴 오프너.
  }
  const statBuff = effs.find((e) => e.kind === "selfBuff");
  if (statBuff && statBuff.kind === "selfBuff") {
    return { kind: "self_buff", stat: statBuff.stat, active: false }; // 스탯 버프 = 안 걸렸을 때.
  }
  if (effs.some((e) => e.kind === "enemyVuln")) {
    return { kind: "enemy_debuff", target: "vulnerability", active: false };
  }
  if (effs.some((e) => e.kind === "enemyDamageDown")) {
    return { kind: "enemy_debuff", target: "damageDown", active: false };
  }
  if (effs.some((e) => e.kind === "enemySkillProcDown")) {
    return { kind: "enemy_debuff", target: "skillProcDown", active: false };
  }
  // 파생 버프(회피/치명/받피감 = selfBuffPct) — 그 버프 미활성일 때만(선풍각·철포·집중). 만료 시
  //   재시전·활성 중엔 평타. 오프너 전용(turn≤1)이던 한계(3턴 후 끊김) 해소.
  const pctBuff = effs.find((e) => e.kind === "selfBuffPct");
  if (pctBuff && pctBuff.kind === "selfBuffPct") {
    return { kind: "self_buff_pct", target: pctBuff.target, active: false };
  }
  // 그 외(순수 디버프 등) — 깔끔한 조건이 없어 오프너로(첫 턴만, 스팸 방지).
  return { kind: "turn", op: "atMost", value: 1 };
}

function isOncePerBattleEvadeOpener(skillId: string): boolean {
  const def = V2_SKILLS[skillId as V2SkillId];
  return (
    def?.oncePerBattle === true &&
    def.effects.some((effect) => effect.kind === "guaranteedEvade")
  );
}

function highestEquippedDuelistDeclaration(equipped: readonly string[]): string | null {
  let highest: string | null = null;
  let highestRank = 0;
  for (const skillId of equipped) {
    const rank = V2_SKILLS[skillId as V2SkillId]?.duelistDeclaration?.rank ?? 0;
    if (rank > highestRank) {
      highest = skillId;
      highestRank = rank;
    }
  }
  return highest;
}

function withoutLowerDuelistDeclarations(
  equipped: readonly string[],
  pattern: V2CombatPattern,
): V2CombatPattern {
  const highest = highestEquippedDuelistDeclaration(equipped);
  if (!highest) return pattern;
  return {
    blocks: pattern.blocks.filter((block) => {
      if (block.action.kind !== "skill") return true;
      const declaration = V2_SKILLS[block.action.skillId as V2SkillId]?.duelistDeclaration;
      return !declaration || block.action.skillId === highest;
    }),
  };
}

// 장착 스킬을 스마트 기본 조건으로 묶은 패턴. 미설정 캐릭의 폴백.
//   전투당 1회 생존 오프너(그림자 도약)는 "항상" 공격보다 먼저 독립 시전되어야 하므로 최우선에
//   둔다. 그 뒤 카탈로그가 명시한 기본 우선순위를 적용하고, 메타데이터가 없는 나머지는 슬롯
//   순서를 유지한다. 카탈로그에 없는 id 는 안전하게 "항상".
//   엔진·에디터·PvP 가 공유(단일 소스).
export function smartDefaultPatternFromEquipped(
  equipped: readonly string[],
): V2CombatPattern {
  const activeSkillIds = equipped.filter(
    (skillId) => {
      const definition = V2_SKILLS[skillId as V2SkillId];
      if (definition?.category === "passive") return false;
      if (!definition?.duelistDeclaration) return true;
      return skillId === highestEquippedDuelistDeclaration(equipped);
    },
  );
  const openerSkillIds = activeSkillIds.filter(isOncePerBattleEvadeOpener);
  const remainingSkillIds = activeSkillIds
    .filter((skillId) => !isOncePerBattleEvadeOpener(skillId))
    .map((skillId, index) => ({ skillId, index }))
    .sort((left, right) => {
      const leftPriority =
        V2_SKILLS[left.skillId as V2SkillId]?.defaultPattern?.priority;
      const rightPriority =
        V2_SKILLS[right.skillId as V2SkillId]?.defaultPattern?.priority;
      if (leftPriority !== undefined && rightPriority !== undefined) {
        return rightPriority - leftPriority || left.index - right.index;
      }
      if (leftPriority !== undefined) return -1;
      if (rightPriority !== undefined) return 1;
      return left.index - right.index;
    })
    .map(({ skillId }) => skillId);
  const orderedSkillIds = [...openerSkillIds, ...remainingSkillIds];

  return {
    blocks: orderedSkillIds.map((skillId) => {
      const def = V2_SKILLS[skillId as V2SkillId];
      return {
        condition: def?.duelistDeclaration
          ? ({ kind: "self_buff_pct", target: "duelistDeclaration", active: false } as const)
          : def
            ? (def.defaultPattern?.condition ?? smartDefaultConditionForSkill(def))
          : ({ kind: "always" } as V2CombatCondition),
        action: { kind: "skill" as const, skillId },
      };
    }),
  };
}

// 저장된 사용자 패턴은 그대로 보존하되, 장착한 전투당 1회 확정 회피 오프너가 누락됐거나
// 후순위에 있으면 전투용 패턴의 첫 블록으로 정규화한다. 장착만 해도 적용된다는 스킬 계약을
// 사용자 패턴이 우연히 무효화하지 않게 하며, 나머지 사용자 블록의 조건과 순서는 유지한다.
export function effectiveCombatPatternFromEquipped(
  equipped: readonly string[],
  savedPattern: V2CombatPattern | null | undefined,
): V2CombatPattern {
  const basePattern = withoutLowerDuelistDeclarations(equipped,
    savedPattern && savedPattern.blocks.length > 0
      ? savedPattern
      : smartDefaultPatternFromEquipped(equipped));
  const openerSkillId = equipped.find(isOncePerBattleEvadeOpener);
  if (!openerSkillId) return basePattern;

  return {
    blocks: [
      {
        condition: { kind: "turn", op: "atMost", value: 1 },
        action: { kind: "skill", skillId: openerSkillId },
      },
      ...basePattern.blocks.filter(
        (block) =>
          block.action.kind !== "skill" ||
          block.action.skillId !== openerSkillId,
      ),
    ],
  };
}
