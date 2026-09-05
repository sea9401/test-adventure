import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import { EVASION_PCT_CAP } from "@/adventure/data/stats";
import {
  type V2Class
} from "@/adventure/data/v2/classes";
import {
  V2_CORE_LOOP_V2,
  coreLoopMaxHpMult
} from "@/adventure/data/v2/coreLoopConfig";
import type { V2Element } from "@/adventure/data/v2/elements";
import {
  type EquippedLiberationEffects
} from "@/adventure/data/v2/equipmentLiberationEffects";
import {
  trainedIntSpiMpBonus,
  type V2LifeResourceGrowth,
} from "@/adventure/data/v2/lifeResourceGrowth";
import {
  type LiberationCycleGrowth
} from "@/adventure/data/v2/proficiency";
import { equipmentCritMultToMagicSkillCritBonus } from "@/adventure/data/v2/skillCritical";
import {
  CRIT_MULT_BASE,
  PLAYER_BLEED_ATK_COEF_PER_STACK,
  POISON_PCT_PER_POINT,
  combineDefReductionPcts,
  magicBarrierStats,
} from "@/adventure/data/v2/v2CombatConstants";
import {
  V2_EQUIPMENT,
  weaponTypeOf,
  type V2EquipRoll,
  type V2EquipSlot,
  type V2EquipmentId
} from "@/adventure/data/v2/v2Equipment";
import {
  type V2JobPassiveEffect
} from "@/adventure/data/v2/v2JobPassives";
import {
  V2_STAT_KEYS,
  type V2StatKey
} from "@/adventure/data/v2/v2StatKeys";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_BASE_STATS,
  V2_HP_PER_LEVEL,
  V2_MP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import { stackedDamageReductionPct, stackedDefenseIncreasePct, stackedMaxHpIncreasePct } from "@/lib/server/combatStatScaling";
import {
  aggregateV2Equipment,
  collectEquipSignatures,
} from "@/lib/server/derivePlayerEquipmentV2";
import { derivePrimaryStats } from "@/lib/server/derivePlayerPrimaryStats";
import {
  ACCURACY_PCT_CAP,
  ACCURACY_PCT_PER_DEX,
  ACC_BASE_RATING,
  ACC_PER_INT,
  ACC_PER_SPI,
  ACC_PER_STR,
  ATK_PER_STR,
  BOW_ACCURACY_TO_ATK_COEF,
  BOW_HIT_THRESHOLD,
  CRIT_DMG_PER_LUK,
  CRIT_DMG_PER_STR,
  CRIT_MULT_CEIL,
  CRIT_MULT_SCALE,
  CRIT_PER_LUK,
  CRIT_RESIST_PER_SPI,
  DEF_PER_VIT,
  EVA_PER_DEX,
  EVA_PER_LUK,
  EXTRA_ATTACK_PCT_PER_SPD,
  HEAL_MULT_PER_SPI,
  HEAL_MULT_PER_VIT,
  HP_PER_STR,
  HP_PER_VIT,
  MAGIC_ATK_PER_EXCESS_SPI,
  MAGIC_ATK_PER_INT,
  MAGIC_ATK_PER_SPI,
  MAGIC_DEF_PER_INT,
  MAGIC_DEF_PER_SPI,
  MIN_DMG_PER_INT,
  MIN_DMG_PER_SPI,
  MIN_DMG_PER_STR,
  MIN_DMG_PER_VIT,
  MP_PER_INT,
  ROGUE_ATK_PER_DEX,
  SPD_PER_DEX,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF,
  WEIGHT_SPD_PENALTY,
  diminishingExtraAttackChancePct,
  speedToAttackBonusPct,
} from "@/lib/server/v2CombatCoefficients";
export { stackedDamageReductionPct, stackedDefenseIncreasePct, stackedMaxHpIncreasePct, stackedVitalityIncreasePct } from "@/lib/server/combatStatScaling";
export type SavedCharacterV2 = {
  hp?: number;
  mp?: number;
  level?: number;
  selectedStance?: unknown;
  // PR-1 전투 재설계 — 직업·속성. 직업은 derive 의 앵커 스탯 보정, 속성은 hunt 의 상성에 사용.
  class?: unknown;
  element?: unknown;
  // PR-7a — equippedSpells 는 옛 spell 시스템 잔재. parse 단계에서 무시되며 PR-7b 마이그
  // 가 v2_skill_meditate 자동 학습 부여로 대체. 필드는 옛 캐릭 save 호환 위해 보존.
  equippedSpells?: unknown;
  // specChoice = 직업 저장 브리지(jobIdFromLegacy 로 현재 직업 id 복원). 전투 효과 아님.
  specChoice?: unknown;
  /** 개인 요리로 얻은 PvE 전용 능력치 버프. 만료 여부는 derive 시점에 검사한다. */
  activeFoodBuff?: unknown;
};



export type DerivedPlayerCombatV2 = {
  player: PlayerCombat;
  totalStats: Record<V2StatKey, number>;
  baseAllocatedStats: Record<V2StatKey, number>;
  maxHp: number;
  selectedStance: StanceId | null;
  /** 장착 무기의 연출용 속성 태그. 전투 배율에는 반영하지 않는다. */
  weaponElement: V2Element;
  /** 직업 차수(입력 classTier, 1~4; 미지정 1). 앵커 보정에 쓰인 값을 그대로 노출 —
   *  사냥 라우트가 레벨 캡(tierLevelCap) 산출 시 proficiency 재select 없이 재사용. */
  classTier: number;
};



// 레거시 생애의 레벨업 1회분 maxHp/maxMp 성장량 — 레거시 파생식과 동일 계수.
// 신형 생애는 lifeResourceGrowth 의 실제 레벨별 굴림을 결과 카드에 사용한다.
export function v2LevelGrowthHpMp(args: {
  levelsGained: number;
  strGained: number;
  vitGained: number;
  intGained: number;
}): { hp: number; mp: number } {
  return {
    hp:
      args.levelsGained * V2_HP_PER_LEVEL +
      args.strGained * HP_PER_STR +
      args.vitGained * HP_PER_VIT,
    mp: args.levelsGained * V2_MP_PER_LEVEL + args.intGained * MP_PER_INT,
  };
}



export function critMultCurve(bonus: number): number {
  return (
    CRIT_MULT_CEIL -
    (CRIT_MULT_CEIL - CRIT_MULT_BASE) *
      Math.exp(-Math.max(0, bonus) / CRIT_MULT_SCALE)
  );
}



// PR-S2: pure 함수 추출 — DB 의존 없이 (level/allocated/v2Equipped/hp) 입력으로 derive.
// saves 없이 PlayerCombat 을 빌드해야 하는 곳(sim·단위 테스트)에서 호출. DB wrapper 는
// saves 로드 후 이 함수에 위임(FromSaves → Pure).
export type DerivePlayerCombatV2PureInput = {
  level: number;
  /** 현재 전투 생애에서 확정된 자원 굴림. 미지정이면 레거시 자원 공식을 사용한다. */
  lifeResourceGrowth?: V2LifeResourceGrowth;
  /** 1차 스탯 성장분 — V2_BASE_STATS 위에 더해질 값(랜덤 레벨 성장 grownStats). 옛 수동 분배 대체. */
  allocatedStats?: Partial<Record<V2StatKey, number>>;
  /** stat 별 cap(수행으로 상향). 미지정 스탯/입력은 무클램프 — sim 등 호환. */
  statCaps?: Partial<Record<V2StatKey, number>>;
  /** stat 별 floor(저점, 숙련도로 상향, base 포함). 미지정 스탯은 base — 성장분은 floor 위 가산. */
  statFloors?: Partial<Record<V2StatKey, number>>;
  /** parseEquipmentSave().equipped — 슬롯별 장비 id. */
  v2Equipped?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
  /** parseEquipmentSave().statRolls — id별 개체 굴림(편차). 없으면 카탈로그. */
  v2StatRolls?: Partial<Record<V2EquipmentId, V2EquipRoll>>;
  /** 현재 hp. undefined 면 maxHp 풀충. maxHp 초과는 클램프. */
  hp?: number;
  /** 현재 mp. undefined 면 maxMp 풀충. maxMp 초과는 클램프. PR-potion-auto-restore. */
  mp?: number;
  /** character.v2.selectedStance raw. undefined = null. */
  selectedStanceRaw?: unknown;
  /** character.v2.class — 직업. 앵커 스탯 보정에 사용. 미지정 = none. */
  playerClass?: V2Class;
  /** 직업 차수(proficiency.groups[job].tier, 1~4). 앵커 보정 %를 차수로 조회. 미지정 = 1차. */
  classTier?: number;
  /** skills.v2.learned — 학습 스킬 id. 직업 패시브 티어 산정(시그니처만)에 사용. 미지정 = 패시브 없음. */
  learnedSkillIds?: readonly string[];
  /**
   * 직업 시스템 v2 직업 보너스 — 전직 직업의 플랫 스탯 보너스(카탈로그).
   * totalStats 에 가산 → 모든 파생 스탯에 자연 반영. 미지정 = 무가산(flag off / sim 호환).
   * docs/v2-skill-job-redesign.md §3. 옛 계파 % 트레이트를 대체.
   */
  jobBonus?: Partial<Record<V2StatKey, number>>;
  /**
   * 직업 시스템 v2 직업 효과 패시브(받피감·spd 등). specEff 경로로 적용(래퍼가 jobPassive 로
   * 주입). 미지정 = 효과 없음({}).
   */
  jobPassiveEffect?: V2JobPassiveEffect;
  /**
   * 예기(민첩→공격력) 계수 — 장착 패시브 스킬에서 주입(코어루프). 지정 시 도적 직군 하드코딩
   * 베이스라인 대신 이 값 사용(0 = 미장착). 미지정 = 도적 베이스라인 폴백(flag off / sim).
   */
  atkPerDexCoef?: number;
  /** 흑월지배(행운→공격력) 계수. 미지정이면 0. */
  atkPerLukCoef?: number;
  /**
   * 상위 직업 % 스탯 패시브(근력 II 힘 +15% 등). 여러 패시브 %는 합산(가산) 후 1회 적용.
   * 플랫 jobBonus 가산 뒤에 곱해 "스탯 → % 증폭" 순서. flag off/sim 이면 미지정 → 무적용.
   */
  statPct?: Partial<Record<V2StatKey, number>>;
  /** 음식의 1차 능력치 %. 패시브와 합치지 않고 기초 능력치만 기준으로 고정 가산한다. */
  foodPrimaryPct?: Partial<Record<V2StatKey, number>>;
  /** 현재 장착한 장비 인스턴스에서 집계한 해방 효과. */
  liberationEffects?: EquippedLiberationEffects;
  /** 현재 재전직 주기에 이미 영구 누적된 해방 최대 HP·MP 성장. */
  liberationCycleGrowth?: LiberationCycleGrowth;
  /** 최대 HP % 패시브(체력) — 장비 HP를 제외한 캐릭터 HP에 적용. */
  maxHpPct?: number;
  /** 최대 MP % 패시브(마나) — 합산 후 maxMp 에 1회 적용. 미지정 = 무적용. */
  maxMpPct?: number;
  /** 장착 패시브의 직접 피해 마법 MP 소모 감소율. */
  passiveMpCostReductionPct?: number;
  /** 빙결 추가타 피해 증가율. */
  passiveFreezeDamagePct?: number;
  /** 빙결 다음 행동 지연율. */
  passiveFreezeDelayPct?: number;
  /** 빙결 발동 뒤 남기는 한기 수. */
  passiveFreezeRetainStacks?: number;
  /** 마나 실드 패시브 장착 여부. true일 때만 INT·최대 MP 기반 장벽을 활성화한다. */
  passiveMagicBarrier?: boolean;
  // ── 다양성 확장(A 메타) — 장착 패시브 합산분. 엔진 레버에 가산. 미지정 = 무적용(byte-identical).
  /** 치명타 확률 +%p(급소·치명) — critChancePct 에 가산. */
  passiveCritPct?: number;
  /** 치명타 피해 +%(맹공) — critMult 점감 곡선 bonus 에 /100 환산 가산. */
  passiveCritDmgPct?: number;
  /** 회피도 +%(허보) — 스탯·경갑·옵션 회피도의 합을 증폭. */
  passiveEvasionPct?: number;
  /** 흡혈 +%(포식, 저수치) — totalLifestealPct 에 가산. */
  passiveLifestealPct?: number;
  /** 반격 확률 +%p(절정 반격) — passiveCounterChancePct 에 가산(클래스 패시브·전문화와 합산). */
  passiveCounterChancePct?: number;
  /** 금강나한 연계 — 활성 반사 증폭을 나한금신 반격 피해에도 적용. */
  passiveCounterDamageUsesReflectBoost?: boolean;
  /** 방어력 +%(철벽, 다양성 2차) — def 와 magicDef 에 곱연산. PvE/PvP 양쪽. */
  passiveDefPct?: number;
  /** 반사(수호자) — 피격 시 내 방어력의 이 %만큼 고정 데미지 반사. def 확정 후 thornsFlatFromDef 로 환산. */
  passiveThornsDefPct?: number;
  passiveFortressImpactOnHit?: boolean;
  passiveFortressImpactDamagePctPerStack?: number;
  passiveFortressDefSkillStatCoefPct?: number;
  passiveLawInscription?: boolean;
  /** 적중도 +%(정밀) — 스탯·장비 적중도의 합을 증폭. */
  passiveAccuracyPct?: number;
  /** 회복 강화 +%(신술 지원 패시브, SPI 부활) — healMult 에 곱연산(×(1+%/100)). 미지정 = 무적용. */
  passiveHealPowerPct?: number;
  /** 받는 피해 -%(방벽 패시브) — totalDamageTakenReductionPct 에 합산. PvE/PvP 양쪽(#835). */
  passiveDamageTakenReductionPct?: number;
  /** 출혈·중독 같은 상태 피해 감소율. */
  passiveStatusDamageReductionPct?: number;
  /** 대상 출혈 스택당 직접 물리 스킬 피해 증가율. */
  passiveBleedPhysicalSkillDamagePctPerStack?: number;
  /** 중량 스택당 방어력 증가율. */
  passiveStoneskinDefPctPerWeight?: number;
  /** 마법 방어력 +%(결계술 패시브) — magicDef 에 곱연산. */
  passiveMagicDefPct?: number;
  /** 초반 마법형 평타 받는 피해 -%(결계술 패시브). */
  passiveOpeningMagicDamageReductionPct?: number;
  /** 초반 마법 피해 감소가 적용되는 적 행동 횟수. */
  passiveOpeningMagicDamageReductionPhases?: number;
  /** 중독된 적 방어 -%(부식 패시브) — 다른 부식과 남은 방어력 기준 곱연산. */
  passivePoisonedEnemyDefReductionPct?: number;
  /** 중독 지속 피해 +%(맹독 패시브) — 부식과 독립적으로 합산. */
  passivePoisonDamagePct?: number;
  /** 적 물리 방어 -%(독립 패시브) — 같은 종류끼리 집계 단계에서 곱연산. */
  passiveEnemyPhysicalDefReductionPct?: number;
  /** 적 마법 방어 -%(독립 패시브) — 같은 종류끼리 집계 단계에서 곱연산. */
  passiveEnemyMagicDefReductionPct?: number;
  /** 광전 — 잃은 HP 비율만큼 공격력 가산. 엔진 computeBerserkBonus 로 소비. */
  passiveBerserkAtkPctPerLostHpPct?: number;
  /** 광전사–패황 배타 패시브 최고 단계. 범용 광전 공격력 보너스와 독립이다. */
  berserkerMadnessRank?: 0 | 1 | 2 | 3 | 4;
  /** 약점 노출 — 스킬 적중 시 적 마법취약 누적. */
  passiveEnemyMagicVulnPctPerStack?: number;
  /** 약점 노출 누적 확률. */
  passiveEnemyMagicVulnApplyChancePct?: number;
  /** 마법 스킬 피해 +% — scaling="magic"/"spi" 피해분에만 적용. */
  passiveMagicSkillDamagePct?: number;
  /** 일검필살 — 단일 일반 물리 damage 효과만 가진 공격 스킬 피해 +%. */
  passiveSingleHitPhysicalSkillDamagePct?: number;
  /** 전체 속도를 공격력 %로 환산(점근, 값=상한%). 장착 패시브 합산분. */
  passiveSpdToAtkMaxPct?: number;
  /** 흑월지배 — 최종 행운 1당 속도 가산 계수. */
  passiveSpdPerLukCoef?: number;
  /** 치명 한계 확장 — 치명 오버플로(75% 초과 크리뎀)를 스킬에도 적용. 장착 패시브에서 주입. */
  passiveSkillCritOverflow?: boolean;
  /** 스킬 치명타 피해 +% — 액티브 스킬 치명타 배율에 /100 가산. */
  passiveSkillCritDmgPct?: number;
  /** 원초 증폭 — 장비 치명타 배율을 직접 마법 스킬 치명타 배율로 변환. */
  passiveEquipmentMagicSkillCritConversion?: boolean;
  /** 흑월지배 — 회피 후 다음 직접 피해 스킬 확정 치명타. 장착 패시브에서 주입. */
  passiveSkillCritAfterEvade?: boolean;
  /** 절초 — 누적 적중 4타째마다 해당 타격 피해 +%. 장착 패시브에서 주입. */
  passiveComboFinisherBonusPct?: number;
  /** 현재 결투가 계보·로드아웃에서 스냅샷한 평타 최종 피해 보너스. */
  duelistStanceBonusPct?: number;
  /** 태세를 막은 공격 스킬 이름. 로드아웃 UI 설명용. */
  duelistStanceBlockingSkillName?: string | null;
  /** 장착 패시브의 평타 전용 방어 관통. */
  passiveBasicDefPenetrationPct?: number;
  /** 평타 치명타 뒤 다음 행동 1회 단축률. */
  passiveBasicCritHastePct?: number;
  /** 평타 전용 치명타 확률 상한. */
  passiveBasicCritChanceCap?: number;
};



export function derivePlayerCombatV2Pure(
  input: DerivePlayerCombatV2PureInput,
): DerivedPlayerCombatV2 {
  const level = Math.max(1, input.level ?? 1);
  const v2Equipped = input.v2Equipped ?? {};
  const equipAcc = aggregateV2Equipment(v2Equipped, input.v2StatRolls);
  const liberation = input.liberationEffects;
  // 발동형 시그니처(Phase 2) — 활성 세트/마퀴 단품. 없으면 빈 배열(아래서 undefined 로).
  const equipSignatures = collectEquipSignatures(v2Equipped);

  const playerClass = input.playerClass ?? "none";
  const { baseAllocatedStats, totalStats } = derivePrimaryStats(input);

  // PR-S1 5배 스케일 — float 누적 후 atk/def/maxHp/maxMp 만 최종 floor.
  // crit/eva/acc/extraAtk 는 float 그대로 (엔진이 확률 비교만, 0.1%p 단위 보존).
  // PR-T2: atk 에 DEX/SPD 보조 ×0.04 추가 (옛 라이브 dex/5+spd/5 의 ×5 환산).
  // PR-T3: LUK 보조도 같은 패턴으로 추가. crit-only axis 였으나 wr 부족.
  // strict §4 — 물리공격력 = 힘 단독 + 장비 atk(무기 위력). dex/spd/luk atk 보조 없음.
  // 4대 전투 스탯엔 초반 완화용 플랫 보너스(V2_BASE_COMBAT_BONUS)를 가산.
  // 예기 — DEX 보조 공격력. 코어루프(직업 킷)는 장착 패시브 스킬 예기에서 계수 주입
  //   (atkPerDexCoef, 미장착=0). flag-off/sim 은 도적 직군 하드코딩 베이스라인 폴백.
  const atkPerDexCoef =
    input.atkPerDexCoef ?? (playerClass === "rogue" ? ROGUE_ATK_PER_DEX : 0);
  const atk =
    Math.floor(
      totalStats.str * ATK_PER_STR +
        totalStats.dex * atkPerDexCoef +
        totalStats.luk * (input.atkPerLukCoef ?? 0) +
        totalStats.vit * VIT_ATK_COEF +
        equipAcc.atk,
    ) + V2_BASE_COMBAT_BONUS;
  // 물리 방어력 — 활력 + 장비 def. 다양성 패시브(철벽) 방어% 는 곱연산(미지정=곱 생략, byte-동일).
  const baseDef =
    Math.floor(totalStats.vit * DEF_PER_VIT + equipAcc.def) +
    V2_BASE_COMBAT_BONUS;
  const effectivePassiveDefPct = stackedDefenseIncreasePct(
    input.passiveDefPct ?? 0,
  );
  const def = effectivePassiveDefPct
    ? Math.floor(baseDef * (1 + effectivePassiveDefPct / 100))
    : baseDef;
  // 수호자 반사 — 피격 시 (확정 방어력 × thornsDefPct%) 만큼 적에게 고정 반사.
  //   미보유=0 → 키 생략(아래 spread)으로 byte-identical.
  const thornsFlatFromDef = input.passiveThornsDefPct
    ? Math.floor((def * input.passiveThornsDefPct) / 100)
    : 0;
  // 마법 공격력 — 지능 주력 + 정신 보조 + 무기 위력(magicAtk). 정신은 항상 소량 기여하고,
  // 지능보다 높은 부분은 추가 전환해 SPI 주력 빌드에 솔로 공격 수단을 준다.
  const excessSpi = Math.max(0, totalStats.spi - totalStats.int);
  const magicAtk =
    Math.floor(
      totalStats.int * MAGIC_ATK_PER_INT +
        totalStats.spi * MAGIC_ATK_PER_SPI +
        excessSpi * MAGIC_ATK_PER_EXCESS_SPI,
    ) +
    equipAcc.magicAtk +
    V2_BASE_COMBAT_BONUS;
  // 마법 방어력 — 정신 major + 지능 minor + 장신구 위력. 방어% 패시브는 방벽 계열 공통 내구
  // 보정으로 마방에도 적용한다. 결계술의 전용 magicDefPct 와 합산 후 1회 곱한다.
  const baseMagicDef =
    Math.floor(
      totalStats.spi * MAGIC_DEF_PER_SPI +
        totalStats.int * MAGIC_DEF_PER_INT +
        equipAcc.magicDef,
    ) + V2_BASE_COMBAT_BONUS;
  const passiveMagicDefPct =
    effectivePassiveDefPct + (input.passiveMagicDefPct ?? 0);
  const magicDef = passiveMagicDefPct
    ? Math.floor(baseMagicDef * (1 + passiveMagicDefPct / 100))
    : baseMagicDef;
  // 직접 피해 스킬 최소 데미지 — 물리(힘 major+활력 minor)와 마법(지능 major+정신 minor)을
  // 분리해 반대 계열 스탯이 스킬 하한까지 함께 올리는 교차 효율을 막는다.
  const minDamage = Math.floor(
    totalStats.str * MIN_DMG_PER_STR +
      totalStats.vit * MIN_DMG_PER_VIT,
  );
  const magicMinDamage = Math.floor(
    totalStats.int * MIN_DMG_PER_INT +
      totalStats.spi * MIN_DMG_PER_SPI,
  );
  // 회복량 배수(신규) — 정신(주력)·활력(보조). heal effect 스케일(1.0 기준). 회복강화는 곱연산
  //   ×(1+%/100) — 패시브(신술 지원) + 장비 옵션(SPI PR-2) 합산. 미지정/0 = ×1(byte-identical).
  const healMult =
    (1 +
      totalStats.vit * HEAL_MULT_PER_VIT +
      totalStats.spi * HEAL_MULT_PER_SPI) *
    (1 +
      ((input.passiveHealPowerPct ?? 0) +
        equipAcc.healPowerPct +
        (liberation?.combat.healingOutputPct ?? 0)) /
        100);
  // HP%는 캐릭터 자체 HP만 강화한다. 장비 HP는 마지막에 더해 장비 HP와 HP% 패시브가
  // 서로를 중복 증폭하던 생존 편중을 제거한다.
  const intrinsicHp = input.lifeResourceGrowth
    ? input.lifeResourceGrowth.baseHp + input.lifeResourceGrowth.gainedHp
    : V2_BASE_HP + Math.max(0, level - 1) * V2_HP_PER_LEVEL;
  const characterHp =
    intrinsicHp +
    totalStats.str * HP_PER_STR +
    totalStats.vit * HP_PER_VIT +
    (input.liberationCycleGrowth?.hp ?? 0) +
    (liberation?.flat.maxHp ?? 0);
  const maxHp = Math.floor(
    characterHp *
      coreLoopMaxHpMult(playerClass, V2_CORE_LOOP_V2) *
      (1 +
        stackedMaxHpIncreasePct(
          (input.maxHpPct ?? 0) + (liberation?.pct.maxHp ?? 0),
        ) /
          100) +
      equipAcc.hp,
  );
  const intrinsicMp = input.lifeResourceGrowth
    ? input.lifeResourceGrowth.baseMp + input.lifeResourceGrowth.gainedMp
    : V2_BASE_MP +
      Math.max(0, level - 1) * V2_MP_PER_LEVEL +
      totalStats.int * MP_PER_INT;
  const trainedMp =
    input.lifeResourceGrowth?.version === 2
      ? trainedIntSpiMpBonus(baseAllocatedStats)
      : 0;
  const maxMp = Math.floor(
    (intrinsicMp +
      trainedMp +
      (input.liberationCycleGrowth?.mp ?? 0) +
      (liberation?.flat.maxMp ?? 0) +
      equipAcc.mp) *
      (1 + (input.maxMpPct ?? 0) / 100),
  );
  // 치명타 확률 — 행운 + 장비 + 장착 패시브(급소·치명, A 메타 다양성). 미지정 +0.
  const critChancePct =
    totalStats.luk * CRIT_PER_LUK +
    equipAcc.crit +
    (input.passiveCritPct ?? 0) +
    (liberation?.combat.critChancePp ?? 0);
  // 치명타 피해 가산원(선형 합) — 행운 major + 힘 minor + 장비 + 장착 패시브(맹공, %→/100).
  //   base/천장은 critMultCurve(점감)에서 1회 적용. 인술(passive)·spec 가산도 같은 풀에 합류.
  const critBonus =
    totalStats.luk * CRIT_DMG_PER_LUK +
    totalStats.str * CRIT_DMG_PER_STR +
    equipAcc.critMult / 100 + // 반지 슬롯 고유 축(백분의 일 정수 → 배수).
    ((input.passiveCritDmgPct ?? 0) +
      (liberation?.combat.critDamagePp ?? 0)) /
      100;
  // 치명타 저항 — 정신·장비·해방 효과를 합산해 상대 원본 치명 확률에서 먼저 차감한다.
  // 공격자의 확률 상한과 초과 치명 피해 전환은 이 저항을 적용한 뒤 계산한다.
  const critResistPct = Math.max(
    0,
    totalStats.spi * CRIT_RESIST_PER_SPI +
      equipAcc.critResist +
      (liberation?.combat.critResistPp ?? 0),
  );
  // 회피도 — 기본 15를 넘긴 DEX·LUK 성장분과 경갑 위력·옵션을 합산한 뒤 패시브로 증폭한다.
  // 전 캐릭터가 시작 스탯만으로 높은 경감을 얻지 않게 하고 실제 투자분에 생존 가치를 준다.
  const baseEvaRating =
    Math.max(0, totalStats.dex - V2_BASE_STATS.dex) * EVA_PER_DEX +
    Math.max(0, totalStats.luk - V2_BASE_STATS.luk) * EVA_PER_LUK +
    equipAcc.eva;
  const evaRating =
    baseEvaRating * (1 + Math.max(0, input.passiveEvasionPct ?? 0) / 100) +
    (liberation?.flat.evasion ?? 0);
  const evasionPct = Math.min(evaRating, EVASION_PCT_CAP);
  // 적중도 — 기본 적중과 스탯·장비를 합산한다. 직업·장착 패시브의 적중도%는 아래에서
  // 합산해 한 번만 곱한다.
  const baseAccuracyRating = Math.max(
    0,
    ACC_BASE_RATING +
      totalStats.dex * ACCURACY_PCT_PER_DEX +
      totalStats.str * ACC_PER_STR +
      totalStats.int * ACC_PER_INT +
      totalStats.spi * ACC_PER_SPI +
      equipAcc.accuracy,
  );
  // 속도 = 민첩 파생(1차 아님) − 장비 무게×계수(중갑일수록 느림). 음수 0 클램프.
  const spd = Math.max(
    0,
    totalStats.dex * SPD_PER_DEX -
      equipAcc.weight * WEIGHT_SPD_PENALTY +
      equipAcc.spd + // 신발 슬롯 고유 축.
      totalStats.luk * (input.passiveSpdPerLukCoef ?? 0),
  );
  // v2 레거시 다중공격 — SPD × 0.5%p 원시 확률을 아래 반환 단계에서 점감시킨다.
  const extraAttackChancePct = spd * EXTRA_ATTACK_PCT_PER_SPD;

  // hp 클램프 (저장값이 maxHp 초과 안 되게)
  const savedHp = input.hp ?? maxHp;
  const hp = Math.max(0, Math.min(savedHp, maxHp));

  // mp 클램프 (저장값이 maxMp 초과 안 되게). 미지정이면 maxMp 풀충 (옛 캐릭 호환).
  const savedMp = input.mp ?? maxMp;
  const mp = Math.max(0, Math.min(savedMp, maxMp));

  // 구 직업군 패시브(V2_CLASS_PASSIVE)는 P4(2026-06-04)에 은퇴 → 효과 패시브(jobPassive→specEff)가
  // 대체. 과거 atk/magicAtk/critBonus 에 더하던 직업군 가산은 항상 0 이었으므로 그대로 통과시킨다.
  // (finalAtk/finalMagicAtk 은 아래 specEff 곱연산 직전의 베이스 — 이름·역할 유지.)
  const finalAtk = atk;
  const finalMagicAtk = magicAtk;
  const critBonusWithPassive = critBonus;

  // ── 직업 효과 패시브 (jobPassive → specEff 경로) ───────────────────────
  // 래퍼가 jobPassive(jobId) 를 주입. 미정의 직업/sim·테스트 미지정 = {} (전부 항등·inert).
  const specEff: V2JobPassiveEffect = input.jobPassiveEffect ?? {};
  // 합산(없거나 0 = undefined 유지 → 미보유 시 객체 모양 불변).
  const sumOrUndef = (a: number | undefined, b: number | undefined) => {
    const t = (a ?? 0) + (b ?? 0);
    return t > 0 ? t : undefined;
  };
  // 물공%·속도% = 곱(0이면 곱/floor 미적용 — inert 보장). 명중%·크리뎀·추가타 = 가산(+0 항등).
  const totalAtkPct = specEff.atkPctAdd ?? 0;
  let specAtk = totalAtkPct
    ? Math.floor(finalAtk * (1 + totalAtkPct / 100))
    : finalAtk;
  const totalMagicAtkPct = specEff.magicAtkPctAdd ?? 0;
  let specMagicAtk = totalMagicAtkPct
    ? Math.floor(finalMagicAtk * (1 + totalMagicAtkPct / 100))
    : finalMagicAtk;
  const specSpdBase = specEff.spdPctAdd
    ? Math.floor(spd * (1 + specEff.spdPctAdd / 100))
    : spd;
  const specSpd = Math.max(0, specSpdBase + (liberation?.flat.speed ?? 0));
  // 광폭 — 자신 방어력 감소(derive). 미보유면 def 그대로(inert).
  const specDefBase = specEff.selfDefReductionPct
    ? Math.floor(def * (1 - specEff.selfDefReductionPct / 100))
    : def;
  // 방패치기 — 방어력의 일부를 공격력에 가산(derive). 방어 감소(광폭) 적용 후 def 기준.
  if (specEff.atkFromDefPct) {
    specAtk += Math.floor(specDefBase * (specEff.atkFromDefPct / 100));
  }
  // 광폭 — 가하는 피해 +%: atk·magicAtk 에 환산(평타·스킬 스케일 모두 반영, derive 근사).
  if (specEff.dmgDealtPctAdd) {
    const m = 1 + specEff.dmgDealtPctAdd / 100;
    specAtk = Math.floor(specAtk * m);
    specMagicAtk = Math.floor(specMagicAtk * m);
  }

  // 해방의 직접 파생 옵션은 기존 직업/패시브 계산이 끝난 최종 축에 한 번만 적용한다.
  const liberationAllDamagePct = liberation?.pct.allDamage ?? 0;
  const applyLiberationAttack = (value: number, flat: number, pct: number) =>
    Math.floor(
      (value + flat) *
        (1 + pct / 100) *
        (1 + liberationAllDamagePct / 100),
    );
  specAtk = applyLiberationAttack(
    specAtk,
    liberation?.flat.atk ?? 0,
    liberation?.pct.atk ?? 0,
  );
  specMagicAtk = applyLiberationAttack(
    specMagicAtk,
    liberation?.flat.magicAtk ?? 0,
    liberation?.pct.magicAtk ?? 0,
  );
  const specDef = Math.floor(
    (specDefBase + (liberation?.flat.physicalDef ?? 0)) *
      (1 + (liberation?.pct.physicalDef ?? 0) / 100),
  );
  const finalMagicDef = Math.floor(
    (magicDef + (liberation?.flat.magicDef ?? 0)) *
      (1 + (liberation?.pct.magicDef ?? 0) / 100),
  );

  // 적중도% 패시브는 스탯과 장비에서 얻은 기본 적중도를 함께 증폭한다.
  const accuracyIncreasePct =
    (specEff.accuracyPctAdd ?? 0) + (input.passiveAccuracyPct ?? 0);
  const accRating =
    baseAccuracyRating * (1 + Math.max(0, accuracyIncreasePct) / 100) +
    (liberation?.flat.accuracy ?? 0);
  if (weaponTypeOf(v2Equipped.weapon) === "bow") {
    const excessAccuracy = Math.max(0, accRating - BOW_HIT_THRESHOLD);
    specAtk += Math.floor(excessAccuracy * BOW_ACCURACY_TO_ATK_COEF);
  }
  // 천궁 속도 전환 — 전체 SPD를 공격력으로 환원하되 SPD 무한에서 상한값으로 점근한다.
  if (input.passiveSpdToAtkMaxPct) {
    const pct = speedToAttackBonusPct(specSpd, input.passiveSpdToAtkMaxPct);
    specAtk += Math.floor(specAtk * (pct / 100));
  }
  // 기존 accuracyPct 필드는 호환용 표시값이며 실제 전투는 accRating을 사용한다.
  const finalAccuracyPct = Math.min(ACCURACY_PCT_CAP, accRating);

  // 직업 효과 패시브 + 장착 패시브 합산. 0 이면 spread 생략(inert).
  const totalDamageTakenReductionPct = stackedDamageReductionPct(
    (specEff.damageTakenReductionPct ?? 0) +
      (input.passiveDamageTakenReductionPct ?? 0) +
      (liberation?.combat.damageTakenReductionPct ?? 0),
  ); // 장착 패시브(방벽) — 합산 후 다중 중첩 점감.
  const totalStatusDamageReductionPct = Math.min(
    100,
    Math.max(
      0,
      equipAcc.statusDamageReductionPct +
        (input.passiveStatusDamageReductionPct ?? 0) +
        (liberation?.combat.statusDamageReductionPct ?? 0),
    ),
  );
  const totalBleedDmgPerStack = specEff.bleedDmgPerStack ?? 0;
  const totalPoisonStrength = specEff.poisonPctPerStackBase ?? 0;
  const totalLifestealPct =
    (specEff.lifestealPct ?? 0) +
    (input.passiveLifestealPct ?? 0); // 장착 패시브(포식) — 저수치.
  const totalPoisonedEnemyDefReductionPct = combineDefReductionPcts(
    specEff.poisonedEnemyDefReductionPct ?? 0,
    input.passivePoisonedEnemyDefReductionPct ?? 0,
  );
  const totalPoisonDamagePct = Math.max(0, input.passivePoisonDamagePct ?? 0);
  const totalMagicSkillDamagePct =
    (specEff.magicSkillDamagePct ?? 0) +
    (input.passiveMagicSkillDamagePct ?? 0);
  const magicBarrier = input.passiveMagicBarrier
    ? magicBarrierStats(totalStats.int, maxMp)
    : {
        maxDurability: 0,
        pveAbsorbPct: 0,
        pvpAbsorbPct: 0,
        pveEfficiencyPct: 0,
        pvpEfficiencyPct: 0,
      };

  const player: PlayerCombat = {
    hp,
    maxHp,
    mp,
    maxMp,
    ...((input.passiveMpCostReductionPct ?? 0) +
      (liberation?.combat.skillMpCostReductionPct ?? 0)
      ? {
          mpCostReductionPct:
            (input.passiveMpCostReductionPct ?? 0) +
            (liberation?.combat.skillMpCostReductionPct ?? 0),
        }
      : {}),
    intStat: totalStats.int,
    ...((input.passiveFreezeDamagePct ?? 0) > 0
      ? { freezeDamagePct: input.passiveFreezeDamagePct }
      : {}),
    ...((input.passiveFreezeDelayPct ?? 0) > 0
      ? { freezeDelayPct: input.passiveFreezeDelayPct }
      : {}),
    ...((input.passiveFreezeRetainStacks ?? 0) > 0
      ? { freezeRetainStacks: input.passiveFreezeRetainStacks }
      : {}),
    ...(magicBarrier.maxDurability > 0
      ? {
          magicBarrierMax: magicBarrier.maxDurability,
          magicBarrierAbsorbPct: magicBarrier.pveAbsorbPct,
          magicBarrierPvpAbsorbPct: magicBarrier.pvpAbsorbPct,
          magicBarrierEfficiencyPct: magicBarrier.pveEfficiencyPct,
          magicBarrierPvpEfficiencyPct: magicBarrier.pvpEfficiencyPct,
        }
      : {}),
    strStat: totalStats.str,
    // 스킬 스케일/차수용 — 나한권(vit 비례 딜)·전문화 스킬 차수 flat(baseFlatByTier).
    vitStat: totalStats.vit,
    // scaling:"dex"/"luk" 비례 딜(도적 직군 스킬)용 total. % 패시브/내장보너스 반영된 최종값.
    dexStat: totalStats.dex,
    lukStat: totalStats.luk,
    spiStat: totalStats.spi,
    allStatTotal: V2_STAT_KEYS.reduce((sum, stat) => sum + totalStats[stat], 0),
    classTier: input.classTier,
    // 발동형 시그니처(Phase 2) — 활성분 있을 때만 키 추가(빈 배열이면 키 자체 생략 →
    //   미장착 액터의 player 객체·스냅샷 byte-identical, 엔진 훅 미발화).
    ...(equipSignatures.length > 0 ? { equipSignatures } : {}),
    // 치명 한계 확장 — 스킬 치명 오버플로 플래그. 미보유(false/undefined)면 키 생략 → player 객체 byte-identical.
    ...(input.passiveSkillCritOverflow ? { skillCritOverflow: true as const } : {}),
    ...((input.passiveSkillCritDmgPct ?? 0) +
      (liberation?.combat.skillCritDamagePp ?? 0)
      ? {
          skillCritDmgPct:
            (input.passiveSkillCritDmgPct ?? 0) +
            (liberation?.combat.skillCritDamagePp ?? 0),
        }
      : {}),
    ...(input.passiveEquipmentMagicSkillCritConversion
      ? {
          equipmentMagicSkillCritDmgPct:
            equipmentCritMultToMagicSkillCritBonus(equipAcc.critMult / 100) *
            100,
        }
      : {}),
    // 흑월지배 — 회피 뒤 다음 직접 피해 스킬 확정 치명타 플래그.
    ...(input.passiveSkillCritAfterEvade ? { skillCritAfterEvade: true as const } : {}),
    atk: specAtk,
    magicAtk: specMagicAtk,
    ...(weaponTypeOf(v2Equipped.weapon) === "staff"
      ? { displayAttack: "magic" as const }
      : {}),
    ...(excessSpi > 0 && specMagicAtk > specAtk
      ? { passiveMagicBasicAttack: true as const }
      : {}),
    def: specDef,
    spd: specSpd,
    evasionPct,
    evaRating, // 회피 대결형 — 전투에서 쓰는 캡 없는 raw(evasionPct 는 표시 전용).
    accuracyPct: finalAccuracyPct, // 표시 전용(캡 35). 전투 명중은 accRating.
    accRating, // 회피 대결형 Slice 2 — 명중이 방어자 회피 대결을 누르는 캡 없는 raw.
    attackCount: 1,
    extraAttackChancePct:
      diminishingExtraAttackChancePct(extraAttackChancePct) +
      (specEff.extraAttackChancePct ?? 0),
    critChancePct: critChancePct + (specEff.critChancePctAdd ?? 0), // 급습
    // 치명타 피해 — 전 가산원(luk/str/장비/맹공/인술/spec) 합을 점감 곡선으로 1회 환산.
    critMult: critMultCurve(critBonusWithPassive + (specEff.critMultAdd ?? 0)),
    // PR-2 신규 v2 축 — PlayerCombat 옵셔널 필드 (라이브 미사용, combatShared/engine v2 경로만).
    magicDef: finalMagicDef,
    critResistPct,
    ...(totalStatusDamageReductionPct > 0
      ? {
          statusDamageReductionPct: totalStatusDamageReductionPct,
        }
      : {}),
    minDamage,
    magicMinDamage,
    healMult,
    ...((liberation?.combat.receivedHealingPct ?? 0) > 0
      ? {
          receivedHealMult:
            1 + (liberation?.combat.receivedHealingPct ?? 0) / 100,
        }
      : {}),
    ...((liberation?.combat.finalEvasionEffectPp ?? 0) > 0
      ? {
          finalEvasionReductionPctAdd:
            liberation?.combat.finalEvasionEffectPp,
        }
      : {}),
    ...((liberation?.combat.shieldMaxHpPct ?? 0) > 0
      ? { enchantBarrierPctMaxHp: liberation?.combat.shieldMaxHpPct }
      : {}),
    ...((liberation?.combat.bossDamagePct ?? 0) > 0
      ? { enchantBreakerBossBonusPct: liberation?.combat.bossDamagePct }
      : {}),
    // 직업 효과 패시브 — 엔진이 읽어 적용. 미보유면 undefined(no-op). 합산(sumOrUndef).
    // (구 직업군 패시브는 은퇴 → specEff/input 만 합류.)
    passiveTurnHealPctMaxHp: sumOrUndef(
      undefined,
      specEff.hpRegenPctPerTurn,
    ), // 신성 회복류(기존 턴회복 훅 재사용)
    passiveDefPenetrationPct: sumOrUndef(
      undefined,
      specEff.defPenetrationPct,
    ), // 광검류
    passiveCounterChancePct: sumOrUndef(
      input.passiveCounterChancePct,
      sumOrUndef(undefined, specEff.counterChancePct),
    ), // 절정 반격(장착 패시브·input) + 철벽검류(전문화)
    ...(input.passiveCounterDamageUsesReflectBoost
      ? { passiveCounterDamageUsesReflectBoost: true }
      : {}),
    // 직업 효과 패시브 — 미보유 시 키 생략(spread)으로 inert. 받피감(P3b 훅)·반사(thornsPct)·출혈/중독.
    ...(totalDamageTakenReductionPct > 0
      ? { passiveDamageTakenReductionPct: totalDamageTakenReductionPct }
      : {}),
    ...((input.passiveOpeningMagicDamageReductionPct ?? 0) > 0 &&
    (input.passiveOpeningMagicDamageReductionPhases ?? 0) > 0
      ? {
          passiveOpeningMagicDamageReductionPct:
            input.passiveOpeningMagicDamageReductionPct,
          passiveOpeningMagicDamageReductionPhases:
            input.passiveOpeningMagicDamageReductionPhases,
        }
      : {}),
    ...(specEff.reflectPct ? { thornsPct: specEff.reflectPct } : {}),
    ...(thornsFlatFromDef > 0
      ? {
          thornsDefPct: input.passiveThornsDefPct,
          thornsFlatFromDef,
        }
      : {}),
    ...(input.passiveFortressImpactOnHit
      ? { fortressImpactOnHit: true }
      : {}),
    ...((input.passiveFortressImpactDamagePctPerStack ?? 0) > 0
      ? {
          fortressImpactDamagePctPerStack:
            input.passiveFortressImpactDamagePctPerStack,
        }
      : {}),
    ...((input.passiveFortressDefSkillStatCoefPct ?? 0) > 0
      ? {
          fortressDefSkillStatCoefPct:
            input.passiveFortressDefSkillStatCoefPct,
        }
      : {}),
    ...(input.passiveLawInscription ? { lawInscription: true } : {}),
    ...((input.passiveBleedPhysicalSkillDamagePctPerStack ?? 0) > 0
      ? {
          bleedPhysicalSkillDamagePctPerStack:
            input.passiveBleedPhysicalSkillDamagePctPerStack,
        }
      : {}),
    ...((input.passiveStoneskinDefPctPerWeight ?? 0) > 0
      ? {
          stoneskinDefPctPerWeight: input.passiveStoneskinDefPctPerWeight,
        }
      : {}),
    ...(totalBleedDmgPerStack > 0
      ? {
          bleedOnHit: {
            flatPerStack: totalBleedDmgPerStack,
            atkCoefPerStack: PLAYER_BLEED_ATK_COEF_PER_STACK,
          },
        }
      : {}),
    ...(totalPoisonStrength > 0
      ? {
          poisonOnHit: {
            pctMaxHpPerStack: totalPoisonStrength * POISON_PCT_PER_POINT,
          },
        }
      : {}),
    // 흡정공/흡정 — 기존 흡혈 훅(enchantLifestealPct) 재사용: 가한 피해의 % HP 회복.
    ...(totalLifestealPct > 0
      ? { enchantLifestealPct: totalLifestealPct }
      : {}),
    // 주문 연사 — 엔진이 resolveV2SkillCast 의 procChance 에 합산.
    ...(specEff.skillProcChanceAdd
      ? { skillProcChanceAdd: specEff.skillProcChanceAdd }
      : {}),
    // 마력 순환 — 엔진이 매 플레이어 턴 종료 시 MP 를 flat 회복.
    ...(specEff.mpRegenPerTurn
      ? { mpRegenPerTurn: specEff.mpRegenPerTurn }
      : {}),
    // 흘려막기 — 엔진이 피격 시 % 확률로 피해 완전 무효(가드 동류 지점).
    ...(specEff.damageNullifyChancePct
      ? { damageNullifyChancePct: specEff.damageNullifyChancePct }
      : {}),
    // 난사 — 엔진이 추가타(첫 타 외) 데미지에 % 가산.
    ...(specEff.extraHitDmgPct
      ? { extraHitDmgPct: specEff.extraHitDmgPct }
      : {}),
    // 부식 — 엔진이 중독된 적의 DEF 를 % 감산(playerFacingEnemyDef).
    ...(totalPoisonedEnemyDefReductionPct
      ? { poisonedEnemyDefReductionPct: totalPoisonedEnemyDefReductionPct }
      : {}),
    ...(totalPoisonDamagePct ? { poisonDamagePct: totalPoisonDamagePct } : {}),
    ...((input.passiveEnemyPhysicalDefReductionPct ?? 0) +
      (liberation?.combat.physicalPenetrationPct ?? 0)
      ? {
          enemyPhysicalDefReductionPct:
            (input.passiveEnemyPhysicalDefReductionPct ?? 0) +
            (liberation?.combat.physicalPenetrationPct ?? 0),
        }
      : {}),
    ...((input.passiveEnemyMagicDefReductionPct ?? 0) +
      (liberation?.combat.magicPenetrationPct ?? 0)
      ? {
          enemyMagicDefReductionPct:
            (input.passiveEnemyMagicDefReductionPct ?? 0) +
            (liberation?.combat.magicPenetrationPct ?? 0),
        }
      : {}),
    ...(input.duelistStanceBonusPct != null
      ? {
          duelistStanceBonusPct: Math.max(0, input.duelistStanceBonusPct),
          ...(input.duelistStanceBlockingSkillName
            ? { duelistStanceBlockingSkillName: input.duelistStanceBlockingSkillName }
            : {}),
        }
      : {}),
    ...(input.passiveBasicDefPenetrationPct
      ? { basicDefPenetrationPct: input.passiveBasicDefPenetrationPct }
      : {}),
    ...(input.passiveBasicCritHastePct
      ? { basicCritHastePct: input.passiveBasicCritHastePct }
      : {}),
    ...((input.passiveBasicCritChanceCap ?? 75) > 75
      ? { basicCritChanceCap: input.passiveBasicCritChanceCap }
      : {}),
    ...(input.passiveBerserkAtkPctPerLostHpPct
      ? {
          berserkAtkPctPerLostHpPct:
            input.passiveBerserkAtkPctPerLostHpPct,
        }
      : {}),
    ...((input.berserkerMadnessRank ?? 0) > 0
      ? {
          berserkerMadnessRank: input.berserkerMadnessRank as
            | 1
            | 2
            | 3
            | 4,
        }
      : {}),
    ...(input.passiveEnemyMagicVulnPctPerStack
      ? {
          enemyMagicVulnPctPerStack:
            input.passiveEnemyMagicVulnPctPerStack,
          enemyMagicVulnApplyChancePct:
            input.passiveEnemyMagicVulnApplyChancePct ?? 100,
        }
      : {}),
    ...(totalMagicSkillDamagePct > 0
      ? { magicSkillDamagePct: totalMagicSkillDamagePct }
      : {}),
    ...(input.passiveSingleHitPhysicalSkillDamagePct
      ? {
          singleHitPhysicalSkillDamagePct:
            input.passiveSingleHitPhysicalSkillDamagePct,
        }
      : {}),
    // 혈광 — 엔진이 적 출혈 중일 때 그 턴 공격 횟수 굴림에 추가 공격 확률 가산.
    ...(specEff.extraAttackChancePctWhileEnemyBleeding
      ? {
          extraAttackChancePctWhileEnemyBleeding:
            specEff.extraAttackChancePctWhileEnemyBleeding,
        }
      : {}),
    // 강체 — 엔진이 받은 피해 비례로 DEF 누적(state.stacks.braceDefBonus).
    ...(specEff.defGainOnHitPct
      ? { defGainOnHitPct: specEff.defGainOnHitPct }
      : {}),
    // 연격세 — 엔진이 적중당 ATK 누적(state.stacks.comboAtkBonus).
    ...(specEff.comboAtkPctPerHit
      ? { comboAtkPctPerHit: specEff.comboAtkPctPerHit }
      : {}),
    // 절초 — 엔진이 N타째 본타에 마무리 강타 데미지 가산.
    ...((specEff.comboFinisherBonusPct ?? 0) +
      (input.passiveComboFinisherBonusPct ?? 0)
      ? {
          comboFinisherBonusPct:
            (specEff.comboFinisherBonusPct ?? 0) +
            (input.passiveComboFinisherBonusPct ?? 0),
        }
      : {}),
    // 주문 중첩 — 엔진이 스킬 시전 누적당 스킬 데미지 가산.
    ...(specEff.skillDmgPctPerCast
      ? { skillDmgPctPerCast: specEff.skillDmgPctPerCast }
      : {}),
    // 약점 노출 — 엔진이 스킬 적중 시 적 마법취약 스택 누적(받는 마법피해 +%).
    ...(specEff.enemyMagicVulnPctPerStack
      ? {
          enemyMagicVulnPctPerStack: specEff.enemyMagicVulnPctPerStack,
          enemyMagicVulnApplyChancePct:
            specEff.enemyMagicVulnApplyChancePct ?? 100,
        }
      : {}),
  };

  // PR-5b — 장착 무기 속성. 무기 없음·무속성이면 neutral.
  const weaponId = v2Equipped.weapon;
  const weaponElement: V2Element = weaponId
    ? (V2_EQUIPMENT[weaponId].element ?? "neutral")
    : "neutral";

  return {
    player,
    totalStats,
    baseAllocatedStats,
    maxHp,
    selectedStance: normalizeStance(input.selectedStanceRaw),
    weaponElement,
    classTier: input.classTier ?? 1,
  };
}
