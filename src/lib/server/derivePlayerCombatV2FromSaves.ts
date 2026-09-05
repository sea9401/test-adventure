import {
  parseV2Class,
  tier1ClassOf
} from "@/adventure/data/v2/classes";
import {
  V2_EQUIPMENT_LIBERATION
} from "@/adventure/data/v2/coreLoopConfig";
import {
  deriveEquippedLiberationEffects
} from "@/adventure/data/v2/equipmentLiberationEffects";
import {
  parseProficiencyForChar
} from "@/adventure/data/v2/proficiency";
import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import {
  parseEquipmentSave,
  resolveEquippedForAggregate
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  jobPassive
} from "@/adventure/data/v2/v2JobPassives";
import {
  aggregateEquippedPassives,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  V2_STAT_KEYS,
  type V2StatKey
} from "@/adventure/data/v2/v2StatKeys";
import { duelistStanceSnapshot } from "@/adventure/v2/combat/duelistCombat";
import { activeCookingBuff } from "@/adventure/v2/cooking/food";
import { DerivedPlayerCombatV2, SavedCharacterV2, derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2Pure";

// 이미 읽은 4개 save 값(character/equipment/proficiency/skills)에서 전투 스탯 derive — DB select
//   없이. derivePlayerCombatV2(select 래퍼)가 read 후 호출한다. 사냥 라우트처럼 save 를 이미
//   lock-read 한 곳이 중복 select 없이 직접 derive 하도록 분리(behavior 는 래퍼와 byte-동일).
//   character 없으면 null(래퍼와 동일).
export function derivePlayerCombatV2FromSaves(saves: {
  character: SavedCharacterV2 | undefined;
  equipmentSave: unknown;
  proficiencyRaw: unknown;
  skillsRaw: unknown;
  /** 아레나·훈련 대련처럼 음식 효과를 제외할 때 false. 기본은 PvE 적용. */
  includeCookingBuff?: boolean;
}): DerivedPlayerCombatV2 | null {
  const { character, equipmentSave, proficiencyRaw, skillsRaw } = saves;
  if (!character) return null;

  const { owned: v2Owned, equipped: v2EquippedIids } =
    parseEquipmentSave(equipmentSave);
  // 개체(iid) → aggregate 입력(슬롯→id, id→굴림) 해석. aggregate 시그니처 불변 유지.
  const { equipped: v2Equipped, statRolls: v2StatRolls } =
    resolveEquippedForAggregate(v2Owned, v2EquippedIids);
  // PR-prof — 1차 스탯 = 랜덤 레벨 성장(prof.grown), cap = 수행(prof.caps).
  // 옛 수동 분배(training.allocated) 폐기.
  const prof = parseProficiencyForChar(proficiencyRaw, character);
  // 직업 패시브 티어 산정용 — 학습 시그니처. equipped 는 무관(패시브는 장착 불요).
  const learnedSkillIds = parseV2SkillsState(skillsRaw).learned;

  const parsedClass = parseV2Class(character.class);

  // 현재 직업 = jobIdFromLegacy(class, specChoice). save 의 specChoice 는 브리지 해석에만 쓰고,
  //   옛 계파 specEff/트레이트는 미적용(직업 패시브 스킬로 대체). raw specChoice 만 필요.
  const specId =
    typeof character.specChoice === "string" ? character.specChoice : undefined;

  // 직업 시스템 v2 — 패시브는 "장착 패시브 스킬"에서 집계(근력/강건/총명 스탯 + 예기
  //   atkPerDexCoef + 상위 % 패시브 + 다양성 효과 crit/critDmg/evasion/lifesteal). 모험가(none)=
  //   빈 집계(HP% 는 별도).
  //   🔑 이 집계는 V2_CORE_LOOP_V2 와 무관하게 무조건 적용된다 — 직업 시스템은 PR-6(#799)에서
  //   무조건화됐고(플래그 제거), 운영은 NEXT_PUBLIC_V2_CORE_LOOP_V2=true. 다양성 효과 필드도
  //   같은 기존 무조건 경로를 그대로 탄다(신규 게이팅 아님). 플래그-off 는 테스트뿐이고 그쪽은
  //   FromSaves 가 아니라 Pure 를 직접 호출(골든)하므로 이 경로를 타지 않아 바이트 동일 유지.
  const v2JobId = jobIdFromLegacy(parsedClass, specId ?? null);
  const equippedSkillIds = parseV2SkillsState(skillsRaw).equipped;
  const passiveAgg = aggregateEquippedPassives(equippedSkillIds);
  // 직업 내장 보너스 — 현재 직업 1개분(카탈로그 jobBonus, "이 직업에 머무를 이유")을 휴대용
  //   패시브 스탯과 합산. 직업은 하나뿐이라 내장분은 상한이 잡히고, 패시브는 SP 예산 내 누적.
  const innateBonus = V2_JOB_CATALOG[v2JobId]?.jobBonus ?? {};
  const jobBonus: Partial<Record<V2StatKey, number>> = { ...passiveAgg.stat };
  for (const k of V2_STAT_KEYS) {
    const b = innateBonus[k];
    if (b) jobBonus[k] = (jobBonus[k] ?? 0) + b;
  }
  const atkPerDexCoef = passiveAgg.atkPerDexCoef;
  const statPct: Partial<Record<V2StatKey, number>> = { ...passiveAgg.statPct };
  const foodPrimaryPct: Partial<Record<V2StatKey, number>> = {};
  const foodBuff = saves.includeCookingBuff === false
    ? null
    : activeCookingBuff(character.activeFoodBuff);
  if (foodBuff) {
    for (const k of V2_STAT_KEYS) {
      const flat = foodBuff.effect.primaryFlat?.[k];
      if (flat) jobBonus[k] = (jobBonus[k] ?? 0) + flat;
      const pct = foodBuff.effect.primaryPct?.[k];
      if (pct) foodPrimaryPct[k] = pct;
    }
  }
  const maxHpPct = passiveAgg.maxHpPct;
  const maxMpPct = passiveAgg.maxMpPct;
  // 직업 효과 패시브(받피감·spd 등) — specEff 경로로 주입(현재 V2_JOB_PASSIVES 비어 inert).
  const jobPassiveEffect = jobPassive(v2JobId);
  const duelistStance = duelistStanceSnapshot(v2JobId, equippedSkillIds, []);

  const derived = derivePlayerCombatV2Pure({
    level: character.level ?? 1,
    lifeResourceGrowth: prof.lifeResourceGrowth,
    allocatedStats: prof.grown,
    statCaps: prof.caps,
    statFloors: computeStatFloors(prof),
    v2Equipped,
    v2StatRolls,
    hp: character.hp,
    mp: character.mp,
    selectedStanceRaw: character.selectedStance,
    playerClass: parsedClass,
    // 차수 = 현 직업의 proficiency.groups[job].tier (없으면 1차).
    classTier: prof.groups[tier1ClassOf(parsedClass)]?.tier ?? 1,
    learnedSkillIds,
    jobBonus,
    jobPassiveEffect,
    atkPerDexCoef,
    atkPerLukCoef: passiveAgg.atkPerLukCoef,
    statPct,
    foodPrimaryPct,
    liberationEffects: V2_EQUIPMENT_LIBERATION
      ? deriveEquippedLiberationEffects(equipmentSave)
      : undefined,
    liberationCycleGrowth: V2_EQUIPMENT_LIBERATION
      ? prof.liberationCycleGrowth
      : undefined,
    maxHpPct,
    maxMpPct,
    passiveMpCostReductionPct: passiveAgg.mpCostReductionPct,
    passiveFreezeDamagePct: passiveAgg.freezeDamagePct,
    passiveFreezeDelayPct: passiveAgg.freezeDelayPct,
    passiveFreezeRetainStacks: passiveAgg.freezeRetainStacks,
    passiveMagicBarrier: passiveAgg.magicBarrier,
    // 다양성 패시브(A 메타) — 장착 합산분을 엔진 레버로 전달.
    passiveCritPct: passiveAgg.critPct,
    passiveCritDmgPct: passiveAgg.critDmgPct,
    passiveEvasionPct: passiveAgg.evasionPct,
    passiveLifestealPct: passiveAgg.lifestealPct,
    passiveCounterChancePct: passiveAgg.counterChancePct,
    passiveCounterDamageUsesReflectBoost:
      passiveAgg.counterDamageUsesReflectBoost,
    passiveDefPct: passiveAgg.defPct,
    passiveThornsDefPct: passiveAgg.thornsDefPct,
    passiveFortressImpactOnHit: passiveAgg.fortressImpactOnHit,
    passiveFortressImpactDamagePctPerStack:
      passiveAgg.fortressImpactDamagePctPerStack,
    passiveFortressDefSkillStatCoefPct:
      passiveAgg.fortressDefSkillStatCoefPct,
    passiveLawInscription: passiveAgg.lawInscription,
    passiveAccuracyPct: passiveAgg.accuracyPct,
    passiveHealPowerPct: passiveAgg.healPowerPct,
    passiveDamageTakenReductionPct: passiveAgg.damageTakenReductionPct,
    passiveStatusDamageReductionPct: passiveAgg.statusDamageReductionPct,
    passiveBleedPhysicalSkillDamagePctPerStack:
      passiveAgg.bleedPhysicalSkillDamagePctPerStack,
    passiveStoneskinDefPctPerWeight: passiveAgg.stoneskinDefPctPerWeight,
    passiveMagicDefPct: passiveAgg.magicDefPct,
    passiveOpeningMagicDamageReductionPct:
      passiveAgg.openingMagicDamageReductionPct,
    passiveOpeningMagicDamageReductionPhases:
      passiveAgg.openingMagicDamageReductionPhases,
    passivePoisonedEnemyDefReductionPct:
      passiveAgg.poisonedEnemyDefReductionPct,
    passivePoisonDamagePct: passiveAgg.poisonDamagePct,
    passiveEnemyPhysicalDefReductionPct:
      passiveAgg.enemyPhysicalDefReductionPct,
    passiveEnemyMagicDefReductionPct: passiveAgg.enemyMagicDefReductionPct,
    passiveBerserkAtkPctPerLostHpPct:
      passiveAgg.berserkAtkPctPerLostHpPct,
    berserkerMadnessRank: passiveAgg.berserkerMadnessRank,
    passiveEnemyMagicVulnPctPerStack:
      passiveAgg.enemyMagicVulnPctPerStack,
    passiveEnemyMagicVulnApplyChancePct:
      passiveAgg.enemyMagicVulnApplyChancePct,
    passiveMagicSkillDamagePct: passiveAgg.magicSkillDamagePct,
    passiveSingleHitPhysicalSkillDamagePct:
      passiveAgg.singleHitPhysicalSkillDamagePct,
    passiveSpdToAtkMaxPct: passiveAgg.spdToAtkMaxPct,
    passiveSpdPerLukCoef: passiveAgg.spdPerLukCoef,
    passiveSkillCritOverflow: passiveAgg.skillCritOverflow,
    passiveSkillCritDmgPct: passiveAgg.skillCritDmgPct,
    passiveEquipmentMagicSkillCritConversion:
      passiveAgg.equipmentMagicSkillCritConversion,
    passiveSkillCritAfterEvade: passiveAgg.skillCritAfterEvade,
    passiveComboFinisherBonusPct: passiveAgg.comboFinisherBonusPct,
    ...(v2JobId in V2_JOB_CATALOG &&
    ["duelist", "contender", "undefeated", "grandchampion"].includes(v2JobId)
      ? {
          duelistStanceBonusPct: duelistStance.bonusPct,
          duelistStanceBlockingSkillName: duelistStance.blockingSkillName,
        }
      : {}),
    passiveBasicDefPenetrationPct: passiveAgg.basicDefPenetrationPct,
    passiveBasicCritHastePct: passiveAgg.basicCritHastePct,
    passiveBasicCritChanceCap: passiveAgg.basicCritChanceCap,
  });
  if (!foodBuff?.effect.combatFlat) return derived;
  const flat = foodBuff.effect.combatFlat;
  const maxHp = derived.maxHp + (flat.maxHp ?? 0);
  const maxMp = (derived.player.maxMp ?? 0) + (flat.maxMp ?? 0);
  return {
    ...derived,
    maxHp,
    player: {
      ...derived.player,
      atk: derived.player.atk + (flat.atk ?? 0),
      magicAtk: (derived.player.magicAtk ?? derived.player.atk) + (flat.magicAtk ?? 0),
      def: derived.player.def + (flat.def ?? 0),
      magicDef: (derived.player.magicDef ?? 0) + (flat.magicDef ?? 0),
      accRating: (derived.player.accRating ?? 0) + (flat.accuracy ?? 0),
      maxHp,
      maxMp,
    },
  };
}
