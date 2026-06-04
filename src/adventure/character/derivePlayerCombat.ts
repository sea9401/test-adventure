// 캐릭터 영구 데이터 (저장된 stats / 장비 / 스킬) → 전투 엔진용 PlayerCombat 변환.
// page.tsx (클라이언트) 와 협동 보스 라우트 (서버) 가 공유 — 클라이언트 위변조 차단을 위해
// 서버는 같은 derive 로 재계산해 클라가 보낸 값을 무시한다.

// v2 마법 풀 환산 — INT 1pt 당 MP +N. INT 가 0 인 라이브 캐릭은 maxMp = 0 → 자동
// 비활성. 1차 다이얼: INT 10 = MP 100. 마법 소비 비용은 PR-4+ 에서 같이 튜닝.
export const MP_PER_INT = 10;

import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import type { EquipItem } from "@/adventure/data/items";
import {
  enchantCombatBonus,
  type EnchantSlot,
} from "@/adventure/character/enchant";
import {
  EVASION_PCT_CAP,
  EVA_OVERFLOW_PIERCE_CAP,
  EVA_OVERFLOW_PIERCE_PER_PCT,
  EXTRA_ATTACK_PCT_PER_SPD,
  STAT_KEYS,
  type StatKey,
} from "@/adventure/data/stats";
import { maxHpForLevel } from "./defaults";
import type { Skill } from "./types";
import {
  computeRuneBonus,
  pctToMultiplier,
  type RuneBonusMap,
} from "./runeBonus";
import {
  computeParagonBonus,
  type ParagonTrackKey,
} from "@/lib/paragon";
import type { EquippedRune } from "@/adventure/data/runes";
import {
  AP_SKILLS,
  DEFAULT_AP_SKILL_CONDITION,
  type APSkillCondition,
} from "./apSkills";
import type { EquippedAPSkill } from "@/adventure/v2/combat/engine";
import {
  acrobatEvadeHealFor,
  analysisPerTurnFor,
  assassinateDmgMultFor,
  balanceCritPctPerSpdDiffFor,
  berserkerAtkPctPerLostHpPctFor,
  bleedDmgPerStackFor,
  bloodfeastPctFor,
  bramblePctFor,
  bulwarkShieldFor,
  counterAtkBonusFor,
  critChancePctFor,
  critMultFor,
  crushDefReductionFor,
  cyclingChiPerTurnFor,
  deriveFeats,
  deriveSkills,
  doubleLuckBonusesFor,
  doubleStrikeIntervalFor,
  effectiveFeatNames,
  effectiveSkillNames,
  enduranceActiveFor,
  enduranceMaxHpBonusPctFor,
  enduringStrikeMultFor,
  eternalGaleBonusPctFor,
  eternalGaleNoCapFor,
  evadeBonusPctFor,
  evadeGuaranteedFor,
  executionDamageMultFor,
  executionHpFractionFor,
  fatedChainActiveFor,
  flurryAttacksFor,
  galeChainChancePctFor,
  gustAtkPerAttackFor,
  guardFor,
  heavenDecreeChancePctFor,
  impactWaveHpPctFor,
  infiniteThornsAtkPctFor,
  lifestealCritHealPctFor,
  lightHandExtraAttackFor,
  lightspeedExtraAttackPctFor,
  luckyLifestealPctFor,
  luckyShieldBlockPctFor,
  luckyStarChancePctFor,
  powerAttackBonusFor,
  precisionArmorPierceFractionFor,
  precisionEvasionMultFor,
  rampagePerTurnFor,
  reflexEvadeMultFor,
  regenFor,
  baselineRegenFor,
  riposteExtraAttacksFor,
  shadowCloneAtkPctFor,
  shadowLegionExtraClonesFor,
  shadowStepPctFor,
  skillLayout,
  skirmishNextTurnBonusFor,
  steadfastWillFlatFor,
  SHADOW_CLONE_ATK_PCT,
  thornsPctFor,
  universalLuckBonusPctFor,
  vanguardFirstTurnBonusFor,
  weakpointExtraAttacksFor,
  type SkillLayout,
} from "./skills";

// 장착 슬롯에 들어가는 아이템 — derivePlayerCombat 가 enchant slots 까지 보존해서 받아야
// 인스턴스 기반 별빛 무구의 발동형 affix 가 합산된다. EquippedItem 전체를 노출하지 않고
// 필요한 필드만 추리는 좁은 타입.
export type EquippedItemForDerive = EquipItem & {
  enchantSlots?: EnchantSlot[];
};

export type DerivePlayerCombatInput = {
  level: number;
  /** 캐릭터 base 스탯 (baseCharacter.stats 와 같은 형태). */
  baseStats: Record<StatKey, number>;
  /** training.v2 의 allocated. */
  allocatedStats: Record<StatKey, number>;
  /** 장착 슬롯 — 무기/방어구/장신구. null 슬롯은 무시. */
  equipped: {
    weapon: EquippedItemForDerive | null;
    armor: EquippedItemForDerive | null;
    accessory: EquippedItemForDerive | null;
  };
  /** 장착 스킬 이름 목록 (일반 슬롯). undefined 면 자동 (보유 첫 N개). */
  equippedSkills: string[] | undefined;
  /** 학습한 AP 스킬 이름 목록. equippedSkills 에 들어간 이름이 여기에도 있으면 AP 스킬로 인식. */
  learnedAPSkills?: ReadonlyArray<string>;
  /** 슬롯별 발동 조건 (skillName 키). 미지정 = always (기본). */
  apSkillConditions?: Readonly<Partial<Record<string, APSkillCondition>>>;
  /** 장착 특기 이름들 — 슬롯 인덱스 별. null = 그 슬롯 미장착. undefined/[] = 모두 미장착. */
  equippedFeats?: ReadonlyArray<string | null>;
  /** 장착 룬 슬롯 — 인덱스 별. null = 비움. undefined/[] = 모두 미장착. */
  equippedRunes?: ReadonlyArray<EquippedRune | null>;
  /** 보유 스토리 플래그 id 집합 — 슬롯 해금(skillLayout) 판정용. 미지정 = 빈 집합. */
  storyFlagIds?: ReadonlySet<string>;
  /** 파라곤 트랙 할당. 미지정 = 빈 객체 = 보너스 없음. */
  paragonAllocations?: Partial<Record<ParagonTrackKey, number>>;
  /** 현재 hp — 협동 공격 시 시작값. */
  hp: number;
};

export type DerivedPlayerCombat = {
  player: PlayerCombat;
  totalStats: Record<StatKey, number>;
  /** base + 분배 만 합산 (장비 보너스 제외). character.stats 는 totalStats 와 같으므로,
   * UI 에서 "기본 vs 장비" 분리 표시가 필요할 때 이 값을 사용한다. */
  baseAllocatedStats: Record<StatKey, number>;
  maxHp: number;
  /** 장착 룬에서 합산된 효과 보너스 — UI 표시 + onBattleEnd 의 EXP/드롭 적용에 사용. */
  runeBonus: RuneBonusMap;
  /** 도감/표시용 보유 스탯 스킬. */
  characterSkills: Skill[];
  /** 도감/표시용 보유 특기. */
  characterFeats: Skill[];
  /** 현재 발동 중인 일반 스킬 이름 (슬롯 한도 반영). */
  effectiveSkillNames: string[];
  /** 현재 발동 중인 특기 이름들 — 슬롯 인덱스를 보존. 길이 = featSlots, 빈 슬롯은 null. */
  effectiveFeatNames: (string | null)[];
  /** effective 일반 스킬 + 특기를 합친 Set (엔진 합성에 사용). */
  effectiveSkillSet: Set<string>;
  /** 현재 슬롯 레이아웃 (일반 칸 수 / 특기 칸 수). */
  layout: SkillLayout;
};

/**
 * 페이지 렌더링과 서버 시뮬이 동일한 결과를 내도록 보장하는 단일 source-of-truth.
 * 변경 시 page.tsx 의 playerCombat 빌드 코드와 동기화 필수.
 */
export function derivePlayerCombat(
  input: DerivePlayerCombatInput,
): DerivedPlayerCombat {
  // 장비 stat 보너스 합산.
  const equipStatBonuses: Record<StatKey, number> = {
    str: 0,
    dex: 0,
    vit: 0,
    spd: 0,
    luk: 0,
    int: 0,
  };
  const items: (EquippedItemForDerive | null)[] = [
    input.equipped.weapon,
    input.equipped.armor,
    input.equipped.accessory,
  ];
  // 별빛 마법부여 발동형 affix 합산 — 3 슬롯의 enchantSlots 를 한 acc 에 누적.
  const enchant = enchantCombatBonus(items.map((i) => i?.enchantSlots));
  for (const item of items) {
    if (!item?.bonus) continue;
    for (const k of STAT_KEYS) {
      equipStatBonuses[k] += item.bonus[k] ?? 0;
    }
  }

  const baseAllocatedStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = (input.baseStats[k] ?? 0) + (input.allocatedStats[k] ?? 0);
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );
  const totalStats: Record<StatKey, number> = STAT_KEYS.reduce(
    (acc, k) => {
      acc[k] = baseAllocatedStats[k] + equipStatBonuses[k];
      return acc;
    },
    { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 } as Record<StatKey, number>,
  );

  const layout = skillLayout({
    level: input.level,
    hasFlag: (id) => input.storyFlagIds?.has(id) ?? false,
  });
  const characterSkills = deriveSkills(totalStats);
  const characterFeats = deriveFeats(totalStats);
  // AP 스킬 — 학습 + equippedSkills 에 슬롯 자리 차지 한 것만 발동 대상. 슬롯 순서 보존.
  const learnedAPNameSet = new Set(input.learnedAPSkills ?? []);
  const apByName = new Map(AP_SKILLS.map((s) => [s.name, s]));
  const effectiveNames = effectiveSkillNames(
    characterSkills,
    input.equippedSkills,
    layout.normalSlots,
    learnedAPNameSet,
  );
  // effectiveNames 안에 AP 스킬 이름이 섞여 있으면 분리 — engine 발동 로직은 APSkill + 조건 필요.
  const equippedAPSkills: EquippedAPSkill[] = [];
  const statEffectiveNames: string[] = [];
  for (const name of effectiveNames) {
    const ap = apByName.get(name);
    if (ap && learnedAPNameSet.has(name)) {
      const condition =
        input.apSkillConditions?.[name] ?? DEFAULT_AP_SKILL_CONDITION;
      equippedAPSkills.push({ skill: ap, condition });
    } else {
      statEffectiveNames.push(name);
    }
  }
  const featNames = effectiveFeatNames(
    characterFeats,
    input.equippedFeats ?? [],
    layout.featSlots,
  );
  // 스탯 스킬 효과 합성용 set — AP 스킬은 제외 (별도 발동 경로).
  const effectiveSkillSet = new Set(statEffectiveNames);
  for (const f of featNames) {
    if (f) effectiveSkillSet.add(f);
  }

  // VIT 1pt 당 maxHp +3, 불굴 장착 시 +N%, 생명의 룬 합산 +N%.
  // (몬스터 다대시 도입 후 모든 빌드 생존성 보강 — 이전 ×2)
  const enduranceHpBonusPct = enduranceMaxHpBonusPctFor(
    totalStats,
    effectiveSkillSet,
  );
  const runeBonus = computeRuneBonus(input.equippedRunes);
  // 파라곤 — 만렙 도달 후 트랙 할당의 효과 (PR-C 에서 적용).
  // - flat ATK/DEF: 모든 곱셈 끝나고 가산 (rune scaling 안 받음 — true flat 의도).
  // - pctMaxHp: endurance 와 함께 additive 합 (compounding 회피).
  // - ppCritRate / ppCritDmg: 합산.
  const paragonBonus = computeParagonBonus(input.paragonAllocations);
  const maxHp = Math.floor(
    (maxHpForLevel(input.level) + totalStats.vit * 3) *
      (1 + (enduranceHpBonusPct + paragonBonus.pctMaxHp) / 100) *
      pctToMultiplier(runeBonus.hp_pct),
  );

  // 장비 atk/def 합산.
  const equipAtk = items.reduce(
    (sum, item) => sum + (item?.bonus?.atk ?? 0),
    0,
  );
  const equipDef = items.reduce(
    (sum, item) => sum + (item?.bonus?.def ?? 0),
    0,
  );
  const playerDef = totalStats.vit + equipDef;

  // 광속 격투 (2티어 특기) — 기본 공격 횟수 +1. derive 단계에서 attackCount 에 미리 합산.
  const lightHandExtra = lightHandExtraAttackFor(totalStats, effectiveSkillSet);
  // 룬 atk/def % — atk 공식의 중간값(playerDef/5) 에 def% 를 끼우면 def 룬이 atk 도 미세하게
  // 올려버리는 cross-bleed 가 생긴다. 그래서 def% 는 최종 def 필드에만 적용, atk 공식의
  // playerDef 는 원본 유지. atk% 는 최종 atk 합산값에 곱한다.
  // ATK 공식 — STR 1pt = 1ATK, DEX/LUK/SPD 5pt = 1ATK, VIT(DEF) 5pt = 1ATK.
  // 레벨 기반 floor 가 별도로 깔리므로 (아래 levelBaseAtk) DEX/LUK 의 3pt 강화는 롤백.
  // SPD 화력 보상은 추가타 시스템(SPD 1pt = +2%)이 별도 담당.
  const rawAtk =
    totalStats.str +
    Math.floor(totalStats.dex / 5) +
    Math.floor(playerDef / 5) +
    Math.floor(totalStats.luk / 5) +
    Math.floor(totalStats.spd / 5) +
    equipAtk;
  // 레벨 기반 base ATK/DEF — Lv 1pt 당 +0.5 (Lv 100 = +50). ATK 공식·룬 atk_pct/def_pct 와 분리 —
  // 화력 빌드(STR 외)의 ATK floor, 화력 빌드의 DEF floor 양쪽 다 보강.
  const levelBaseAtk = Math.floor(input.level / 2);
  const levelBaseDef = Math.floor(input.level / 2);
  // v2 마법 풀 — INT × MP_PER_INT. INT 0(라이브) 이면 0 — MP 자원·UI 자동 비활성.
  // 1차 다이얼: INT 10 = MP 100. 마법 소비 비용은 PR-4+ 에서 정해지면 같이 튜닝.
  const maxMp = totalStats.int * MP_PER_INT;
  const player: PlayerCombat = {
    hp: Math.max(0, Math.min(input.hp, maxHp)),
    maxHp,
    maxMp,
    intStat: totalStats.int,
    atk:
      Math.floor(rawAtk * pctToMultiplier(runeBonus.atk_pct)) +
      levelBaseAtk +
      paragonBonus.flatAtk,
    def:
      Math.floor(playerDef * pctToMultiplier(runeBonus.def_pct)) +
      levelBaseDef +
      paragonBonus.flatDef,
    spd: totalStats.spd,
    // 회피: DEX·스킬·부여 합산. EVASION_PCT_CAP(75%) 도달 후 초과분은 방어 무시로 자동 변환.
    // 캡이 cliff 가 아니라 "전환점" — 캡 도달 후에도 DEX 투자 의미가 유지되어 빌드 다양성 보존.
    evasionPct: Math.min(
      EVASION_PCT_CAP,
      totalStats.dex * 0.5 +
        evadeBonusPctFor(totalStats, effectiveSkillSet) +
        enchant.dodgePct,
    ),
    attackCount: 1 + lightHandExtra,
    // SPD × 2% — 캡 없음. 100% 초과는 정수 부분만큼 확정 추가타 (rollPlayerAttackCount).
    extraAttackChancePct: totalStats.spd * EXTRA_ATTACK_PCT_PER_SPD,
    powerAttackBonus: powerAttackBonusFor(totalStats, effectiveSkillSet),
    crushDefReduction: crushDefReductionFor(totalStats, effectiveSkillSet),
    armorPierceFraction:
      precisionArmorPierceFractionFor(totalStats, effectiveSkillSet) +
      // 회피 오버플로 → 방어 무시 변환. 정확 스킬과 별개로 가산되며 자체 캡(EVA_OVERFLOW_PIERCE_CAP) 적용.
      Math.min(
        EVA_OVERFLOW_PIERCE_CAP,
        Math.max(
          0,
          totalStats.dex * 0.5 +
            evadeBonusPctFor(totalStats, effectiveSkillSet) +
            enchant.dodgePct -
            EVASION_PCT_CAP,
        ) * EVA_OVERFLOW_PIERCE_PER_PCT,
      ),
    guaranteedEvades: evadeGuaranteedFor(totalStats, effectiveSkillSet),
    counterAtkBonus: counterAtkBonusFor(totalStats, effectiveSkillSet),
    extraAttackEveryNTurns: doubleStrikeIntervalFor(
      totalStats,
      effectiveSkillSet,
    ),
    vanguardFirstTurnBonus: vanguardFirstTurnBonusFor(
      totalStats,
      effectiveSkillSet,
    ),
    critChancePct:
      critChancePctFor(totalStats, effectiveSkillSet) +
      runeBonus.crit_pct +
      paragonBonus.ppCritRate +
      enchant.critPct,
    critMult:
      critMultFor(totalStats, effectiveSkillSet) +
      paragonBonus.ppCritDmg / 100,
    doubleLuck: doubleLuckBonusesFor(totalStats, effectiveSkillSet),
    guard: guardFor(totalStats, effectiveSkillSet),
    regen: regenFor(totalStats, effectiveSkillSet),
    baselineRegen: baselineRegenFor(maxHp),
    executionDamageMult: executionDamageMultFor(totalStats, effectiveSkillSet),
    executionHpFraction: executionHpFractionFor(totalStats, effectiveSkillSet),
    precisionEvasionMult: precisionEvasionMultFor(
      totalStats,
      effectiveSkillSet,
    ),
    enduranceActive: enduranceActiveFor(totalStats, effectiveSkillSet),
    lightspeedExtraAttackPct: lightspeedExtraAttackPctFor(
      totalStats,
      effectiveSkillSet,
    ),
    lifestealCritHealPct: lifestealCritHealPctFor(totalStats, effectiveSkillSet),
    evadeHealAmount: acrobatEvadeHealFor(totalStats, effectiveSkillSet),
    balanceCritPctPerSpdDiff: balanceCritPctPerSpdDiffFor(
      totalStats,
      effectiveSkillSet,
    ),
    luckyShieldBlockPct: luckyShieldBlockPctFor(totalStats, effectiveSkillSet),
    bleedDmgPerStack: bleedDmgPerStackFor(totalStats, effectiveSkillSet),
    // 6티어 그림자 군단 단독 보유 시도 분신 발동 가능하도록 atkPct 폴백.
    shadowCloneAtkPct: (() => {
      const base = shadowCloneAtkPctFor(totalStats, effectiveSkillSet);
      if (base > 0) return base;
      return shadowLegionExtraClonesFor(totalStats, effectiveSkillSet) > 0
        ? SHADOW_CLONE_ATK_PCT
        : 0;
    })(),
    bulwarkShield: bulwarkShieldFor(totalStats, effectiveSkillSet),
    flurryAttacks: flurryAttacksFor(totalStats, effectiveSkillSet),
    heavenDecreeChancePct: heavenDecreeChancePctFor(
      totalStats,
      effectiveSkillSet,
    ),
    berserkAtkPctPerLostHpPct: berserkerAtkPctPerLostHpPctFor(
      totalStats,
      effectiveSkillSet,
    ),
    assassinateDmgMult: assassinateDmgMultFor(totalStats, effectiveSkillSet),
    gustAtkPerAttack: gustAtkPerAttackFor(totalStats, effectiveSkillSet),
    riposteExtra: riposteExtraAttacksFor(totalStats, effectiveSkillSet),
    skirmishNextTurnBonus: skirmishNextTurnBonusFor(
      totalStats,
      effectiveSkillSet,
    ),
    thornsPct: thornsPctFor(totalStats, effectiveSkillSet),
    rampagePerTurn: rampagePerTurnFor(totalStats, effectiveSkillSet),
    analysisPerTurn: analysisPerTurnFor(totalStats, effectiveSkillSet),
    bramblePct: bramblePctFor(totalStats, effectiveSkillSet),
    galeChainChancePct: galeChainChancePctFor(totalStats, effectiveSkillSet),
    luckyStarChancePct: luckyStarChancePctFor(totalStats, effectiveSkillSet),
    impactWaveHpPct: impactWaveHpPctFor(totalStats, effectiveSkillSet),
    shadowLegionExtraClones: shadowLegionExtraClonesFor(
      totalStats,
      effectiveSkillSet,
    ),
    bloodfeastPct: bloodfeastPctFor(totalStats, effectiveSkillSet),
    eternalGaleBonusPct: eternalGaleBonusPctFor(totalStats, effectiveSkillSet),
    eternalGaleNoCap: eternalGaleNoCapFor(totalStats, effectiveSkillSet),
    universalLuckBonusPct: universalLuckBonusPctFor(
      totalStats,
      effectiveSkillSet,
    ),
    // ── 별빛 마법부여 발동형 affix ──────────────────────────────────────
    enchantGuardBlockPct: enchant.guardBlockPct || undefined,
    enchantEndurePct: enchant.endurePct || undefined,
    enchantReflectPct: enchant.reflectPct || undefined,
    enchantRegenPctPerTurn: enchant.regenPctPerTurn || undefined,
    enchantBarrierPctMaxHp: enchant.barrierPct || undefined,
    enchantAwakenApChancePct: enchant.awakenApChancePct || undefined,
    enchantPierceFlat: enchant.pierceFlat || undefined,
    enchantBerserkBonusPct: enchant.berserkBonusPct || undefined,
    enchantBreakerBossBonusPct: enchant.breakerBossBonusPct || undefined,
    enchantLifestealPct: enchant.lifestealPct || undefined,
    enchantVenomChancePct: enchant.venomChancePct || undefined,
    enchantVenomDmgPerStack: enchant.venomDmg || undefined,
    enchantExecuteBonusPct: enchant.executeBonusPct || undefined,
    // ── 2티어 특기 (각 스탯 50) ─────────────────────────────────────────
    enduringStrikeMult: enduringStrikeMultFor(totalStats, effectiveSkillSet),
    weakpointExtraAttacks: weakpointExtraAttacksFor(
      totalStats,
      effectiveSkillSet,
    ),
    lightHandExtraAttack: lightHandExtra,
    fatedChainActive: fatedChainActiveFor(totalStats, effectiveSkillSet),
    reflexEvadeMult: reflexEvadeMultFor(totalStats, effectiveSkillSet),
    shadowStepPct: shadowStepPctFor(totalStats, effectiveSkillSet),
    luckyLifestealPct: luckyLifestealPctFor(totalStats, effectiveSkillSet),
    infiniteThornsAtkPct: infiniteThornsAtkPctFor(
      totalStats,
      effectiveSkillSet,
    ),
    steadfastWillFlat: steadfastWillFlatFor(totalStats, effectiveSkillSet),
    cyclingChiPerTurn: cyclingChiPerTurnFor(totalStats, effectiveSkillSet),
    potionHealPct: runeBonus.potion_pct,
    runeCounterChancePct: runeBonus.counter_pct,
    runeLifestealPct: runeBonus.lifesteal_pct,
    equippedAPSkills: equippedAPSkills.length > 0 ? equippedAPSkills : undefined,
  };

  return {
    player,
    totalStats,
    baseAllocatedStats,
    maxHp,
    runeBonus,
    characterSkills,
    characterFeats,
    effectiveSkillNames: effectiveNames,
    effectiveFeatNames: featNames,
    effectiveSkillSet,
    layout,
  };
}
