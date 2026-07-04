// v2 전용 PlayerCombat derive — 라이브 derivePlayerCombat 호출 안 함.
//
// PR-S1 (5배 해상도): 6스탯 raw 값을 5배 스케일로 늘리고(레벨업당 5pt + 베이스/장비 ×5),
// 효과 계수는 1/5 로 줄임. 동일 빌드 최종 전투력은 그대로지만 미세 조정 해상도 5배.
// Codex 권고: 각 스탯 기여를 float 으로 누적 후 최종 단계에서만 floor.
// critChancePct 는 floor 제거 — 0.1%p 단위 허용 (해상도 이득 보존).
//
// 5배 스케일 6스탯 axis (옛 1pt 동등 = 새 5pt):
//   str → atk 주력 (atk += str×0.15)
//   dex → 회피 (eva += dex×0.1, cap 75) + 명중 (acc += dex×0.05) + atk 보조 (PR-T4 ×0.06)
//   vit → maxHp 주력 (vit×1), def 약화 (vit×0.1)
//   spd → 다중공격 확률 (extra += spd×0.5%p, 100%↑ 정수확정) + 선공권
//   luk → 치명 확률(crit += luk×0.12) + 치명 데미지(critMult 점감곡선 bonus += luk×0.007). 항상 작동
//   int → maxMp (int×2). 마법 axis 는 PR-7
//
// 장비(PR-4a 위력/무게/옵션 모델):
//   - 위력 → 슬롯별 분기(지팡이=마공 / 기타 무기=물공 / 방어구=물방 / 장신구=마방). 결과 후-가산.
//   - 무게 → 속도 −(선형, weight×WEIGHT_SPD_PENALTY).
//   - 옵션(crit/mp/eva/hp) → 결과 후-가산. 장비는 6스탯 token 을 안 준다(정체성=훈련 분배).
//
// 반환 타입 DerivedPlayerCombatV2 는 라이브 DerivedPlayerCombat 와 독립 — v2 전투는
// player 만 소비하고 rune/skill/feat/affix/layout 은 일절 안 읽으므로 담지 않는다.

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv } from "@/db/schema";
import type { DbExecutor } from "@/lib/server/savesKv";
import {
  BLEED_ATK_COEF_PER_STACK,
  CRIT_MULT_BASE,
  POISON_PCT_PER_POINT,
} from "@/adventure/data/v2/v2CombatConstants";
import { normalizeStance, type StanceId } from "@/adventure/character/stance";
import {
  V2_CLASS_DEFS,
  V2_TIER_STAT_BONUS_PCT,
  parseV2Class,
  tier1ClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  effectiveStatCap,
} from "@/adventure/data/v2/proficiency";
import {
  parseV2SkillsState,
  aggregateEquippedPassives,
} from "@/adventure/data/v2/v2Skills";
import { computeStatFloors } from "@/adventure/data/v2/statGrowth";
import {
  V2_CORE_LOOP_V2,
  coreLoopMaxHpMult,
} from "@/adventure/data/v2/coreLoopConfig";
import { EVASION_PCT_CAP } from "@/adventure/data/stats";
import {
  V2_STAT_KEYS,
  emptyV2StatMap,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_BASE_STATS,
  V2_HP_PER_LEVEL,
  V2_MP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
  resolveEquippedForAggregate,
  weaponTypeOf,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  jobPassive,
  type V2JobPassiveEffect,
} from "@/adventure/data/v2/v2JobPassives";
import type { V2Element } from "@/adventure/data/v2/elements";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
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
  CRIT_RESIST_PCT_CAP,
  CRIT_RESIST_PER_SPI,
  DEF_PER_VIT,
  EVA_PER_DEX,
  EVA_PER_LUK,
  EXTRA_ATTACK_PCT_PER_SPD,
  HEAL_MULT_PER_SPI,
  HEAL_MULT_PER_VIT,
  HP_PER_VIT,
  MAGIC_ATK_PER_INT,
  MAGIC_DEF_PER_INT,
  MAGIC_DEF_PER_SPI,
  MIN_DMG_PER_INT,
  MIN_DMG_PER_STR,
  MIN_DMG_PER_VIT,
  MP_PER_INT,
  ROGUE_ATK_PER_DEX,
  SPD_OVERFLOW_SCALE,
  SPD_OVERFLOW_THRESHOLD,
  SPD_PER_DEX,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF,
  WEIGHT_SPD_PENALTY,
} from "./v2CombatCoefficients";

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
};

export type DerivedPlayerCombatV2 = {
  player: PlayerCombat;
  totalStats: Record<V2StatKey, number>;
  baseAllocatedStats: Record<V2StatKey, number>;
  maxHp: number;
  selectedStance: StanceId | null;
  /** PR-5b — 장착 무기의 속성(평타/공격 속성). 무기 없음·미부여면 neutral.
   *  hunt·arena 가 basicAttackElement = weaponElement ?? characterElement 산출에 사용. */
  weaponElement: V2Element;
  /** 직업 차수(입력 classTier, 1~4; 미지정 1). 앵커 보정에 쓰인 값을 그대로 노출 —
   *  사냥 라우트가 레벨 캡(tierLevelCap) 산출 시 proficiency 재select 없이 재사용. */
  classTier: number;
};

export {
  aggregateV2Equipment,
  collectEquipSignatures,
  type V2EquipAggregate,
} from "./derivePlayerEquipmentV2";
import {
  aggregateV2Equipment,
  collectEquipSignatures,
} from "./derivePlayerEquipmentV2";

// 외부 import 경로 안정성 — 옛 derivePlayerCombatV2 의 public 상수를 v2CombatCoefficients
//   에서 그대로 재-export 한다(derivePlayerCombatV2.test.ts 등이 이 경로로 import).
export {
  CRIT_MULT_CEIL,
  CRIT_MULT_SCALE,
  MAGIC_ATK_PER_INT,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF,
} from "./v2CombatCoefficients";

// 레벨업 1회분 maxHp/maxMp 성장량 — maxHp/maxMp 파생식과 동일 계수(드리프트 방지). 레벨업
// 결과 카드 표기용. HP = 레벨당 고정(V2_HP_PER_LEVEL) + 오른 VIT × HP_PER_VIT,
// MP = 레벨당 고정(V2_MP_PER_LEVEL) + 오른 INT × MP_PER_INT. 모든 계수 정수라 floor 불필요.
export function v2LevelGrowthHpMp(args: {
  levelsGained: number;
  vitGained: number;
  intGained: number;
}): { hp: number; mp: number } {
  return {
    hp: args.levelsGained * V2_HP_PER_LEVEL + args.vitGained * HP_PER_VIT,
    mp: args.levelsGained * V2_MP_PER_LEVEL + args.intGained * MP_PER_INT,
  };
}

function critMultCurve(bonus: number): number {
  return (
    CRIT_MULT_CEIL -
    (CRIT_MULT_CEIL - CRIT_MULT_BASE) *
      Math.exp(-Math.max(0, bonus) / CRIT_MULT_SCALE)
  );
}

// PR-S2: V2_BASE_STATS / V2_STAT_POINTS_PER_LEVEL 은 v2Stats.ts 로 분리 (클라 import 가능).
// 여기서는 backward compat 을 위해 re-export.
export { V2_BASE_STATS, V2_STAT_POINTS_PER_LEVEL } from "@/adventure/data/v2/v2Stats";

// PR-S2: pure 함수 추출 — DB 의존 없이 (level/allocated/v2Equipped/hp) 입력으로 derive.
// saves 없이 PlayerCombat 을 빌드해야 하는 곳(sim·단위 테스트)에서 호출. DB wrapper 는
// saves 로드 후 이 함수에 위임(FromSaves → Pure).
export type DerivePlayerCombatV2PureInput = {
  level: number;
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
  /**
   * 상위 직업 % 스탯 패시브(근력 II 힘 +15% 등). 여러 패시브 %는 합산(가산) 후 1회 적용.
   * 플랫 jobBonus 가산 뒤에 곱해 "스탯 → % 증폭" 순서. flag off/sim 이면 미지정 → 무적용.
   */
  statPct?: Partial<Record<V2StatKey, number>>;
  /** 최대 HP % 패시브(체력) — 합산 후 maxHp 에 1회 적용. 미지정 = 무적용. */
  maxHpPct?: number;
  /** 최대 MP % 패시브(마나) — 합산 후 maxMp 에 1회 적용. 미지정 = 무적용. */
  maxMpPct?: number;
  // ── 다양성 확장(A 메타) — 장착 패시브 합산분. 엔진 레버에 가산. 미지정 = 무적용(byte-identical).
  /** 치명타 확률 +%p(급소·치명) — critChancePct 에 가산. */
  passiveCritPct?: number;
  /** 치명타 피해 +%(맹공) — critMult 점감 곡선 bonus 에 /100 환산 가산. */
  passiveCritDmgPct?: number;
  /** 회피 +%p(허보) — evasionPct 에 가산(캡 적용). */
  passiveEvasionPct?: number;
  /** 흡혈 +%(포식, 저수치) — totalLifestealPct 에 가산. */
  passiveLifestealPct?: number;
  /** 반격 확률 +%p(절정 반격) — passiveCounterChancePct 에 가산(클래스 패시브·전문화와 합산). */
  passiveCounterChancePct?: number;
  /** 방어력 +%(철벽, 다양성 2차) — def 와 magicDef 에 곱연산. PvE/PvP 양쪽. */
  passiveDefPct?: number;
  /** 반사(수호자) — 피격 시 내 방어력의 이 %만큼 고정 데미지 반사. def 확정 후 thornsFlatFromDef 로 환산. */
  passiveThornsDefPct?: number;
  /** 명중 +%p(정밀, 다양성 2차) — accuracyPct 에 가산(캡 적용). PvE/PvP 양쪽. */
  passiveAccuracyPct?: number;
  /** 회복 강화 +%(신술 지원 패시브, SPI 부활) — healMult 에 곱연산(×(1+%/100)). 미지정 = 무적용. */
  passiveHealPowerPct?: number;
  /** 받는 피해 -%(방벽 패시브) — totalDamageTakenReductionPct 에 합산. PvE/PvP 양쪽(#835). */
  passiveDamageTakenReductionPct?: number;
  /** 마법 방어력 +%(결계술 패시브) — magicDef 에 곱연산. */
  passiveMagicDefPct?: number;
  /** 초반 마법형 평타 받는 피해 -%(결계술 패시브). */
  passiveOpeningMagicDamageReductionPct?: number;
  /** 초반 마법 피해 감소가 적용되는 적 행동 횟수. */
  passiveOpeningMagicDamageReductionPhases?: number;
  /** 속성 유리/불리 +%p(원소 통달 패시브) — player.elementAdvPctBonus/DisPctBonus 로 출력. */
  passiveElementAdvPctBonus?: number;
  passiveElementDisPctBonus?: number;
  /** 중독된 적 방어 -%(부식 패시브) — poisonedEnemyDefReductionPct 에 가산. */
  passivePoisonedEnemyDefReductionPct?: number;
  /** 광전 — 잃은 HP 비율만큼 공격력 가산. 엔진 computeBerserkBonus 로 소비. */
  passiveBerserkAtkPctPerLostHpPct?: number;
  /** 약점 노출 — 스킬 적중 시 적 마법취약 누적. */
  passiveEnemyMagicVulnPctPerStack?: number;
  /** 약점 노출 누적 확률. */
  passiveEnemyMagicVulnApplyChancePct?: number;
  /** 검의 집중(검호) — 행동 속도 한계 초과분을 공격력 %로 환산(점근, 값=상한%). 장착 패시브 합산분. */
  passiveSpdOverflowToAtkPct?: number;
  /** 밤의 장막(밤그림자) — 치명 오버플로(75% 초과 크리뎀)를 스킬에도 적용. 장착 패시브에서 주입. */
  passiveSkillCritOverflow?: boolean;
  /** 절초 — 누적 적중 4타째마다 해당 타격 피해 +%. 장착 패시브에서 주입. */
  passiveComboFinisherBonusPct?: number;
};

export function derivePlayerCombatV2Pure(
  input: DerivePlayerCombatV2PureInput,
): DerivedPlayerCombatV2 {
  const level = Math.max(1, input.level ?? 1);
  const v2Equipped = input.v2Equipped ?? {};
  const equipAcc = aggregateV2Equipment(v2Equipped, input.v2StatRolls);
  // 발동형 시그니처(Phase 2) — 활성 세트/마퀴 단품. 없으면 빈 배열(아래서 undefined 로).
  const equipSignatures = collectEquipSignatures(v2Equipped);

  // baseAllocatedStats = V2_BASE_STATS + 성장분, stat 별 cap 으로 클램프(수행으로 cap 상향).
  // PR-prof — 랜덤 레벨 성장은 cap 까지만(docs §2). statCaps 미지정이면 무클램프(sim 호환).
  const baseAllocatedStats: Record<V2StatKey, number> = V2_STAT_KEYS.reduce(
    (acc, k) => {
      // 스탯 = floor(저점) + 성장분, 유효 cap(=floor+헤드룸+수행이득)으로 클램프. floor 미지정=base.
      // statCaps(수행 이득 맵) 미지정이면 무클램프(sim/테스트 호환).
      const floor = input.statFloors?.[k] ?? (V2_BASE_STATS[k] ?? 0);
      const raw = floor + (input.allocatedStats?.[k] ?? 0);
      acc[k] = input.statCaps
        ? Math.min(raw, effectiveStatCap(floor, input.statCaps[k] ?? 0))
        : raw;
      return acc;
    },
    emptyV2StatMap(),
  );
  // PR-4a — totalStats = baseAllocated 그대로. 장비는 더 이상 6스탯 token 을 안 준다
  // (위력/무게/옵션만). 1차 스탯 정체성은 훈련 분배 + 직업 보정에서만 나온다.
  const totalStats: Record<V2StatKey, number> = { ...baseAllocatedStats };

  // PR-1 직업 보정 — 직업 앵커 스탯에 차수별 보정 %. (전사 1차 = STR +10%, 4차 = +35%)
  // 차수(classTier)는 proficiency.groups[job].tier 에서. none 은 보정 없음.
  const playerClass = input.playerClass ?? "none";
  const classDef = V2_CLASS_DEFS[playerClass];
  const bonusPct =
    playerClass === "none"
      ? 0
      : (V2_TIER_STAT_BONUS_PCT[Math.max(1, Math.floor(input.classTier ?? 1))] ??
        0);
  if (bonusPct > 0) {
    const k = classDef.anchorStat;
    totalStats[k] = Math.floor(totalStats[k] * (1 + bonusPct / 100));
  }

  // 직업 시스템 v2 — 직업 보너스(플랫 스탯) 가산. 앵커 % 보정 뒤에 더해 "순수 플랫"으로 유지
  //   (앵커 스탯 보너스가 % 배수를 받지 않음). cap 무관(보너스라 cap 위로). flag off/sim 이면
  //   jobBonus 미지정 → 무가산(byte-identical). 가산 후 아래 모든 파생 스탯에 자연 반영.
  if (input.jobBonus) {
    for (const k of V2_STAT_KEYS) {
      const b = input.jobBonus[k];
      if (b) totalStats[k] += b;
    }
  }

  // 직업 시스템 v2 — 상위 직업 % 스탯 패시브(근력 II 등). 플랫 가산 뒤에 곱해 "최종 스탯 ×
  //   (1 + %/100)". 여러 패시브 %는 호출부에서 이미 합산됨. floor 로 정수 유지. flag off/sim
  //   이면 statPct 미지정 → 무적용(byte-identical).
  if (input.statPct) {
    for (const k of V2_STAT_KEYS) {
      const pct = input.statPct[k];
      if (pct) totalStats[k] = Math.floor(totalStats[k] * (1 + pct / 100));
    }
  }

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
        totalStats.vit * VIT_ATK_COEF +
        equipAcc.atk,
    ) + V2_BASE_COMBAT_BONUS;
  // 물리 방어력 — 활력 + 장비 def. 다양성 패시브(철벽) 방어% 는 곱연산(미지정=곱 생략, byte-동일).
  const baseDef =
    Math.floor(totalStats.vit * DEF_PER_VIT + equipAcc.def) +
    V2_BASE_COMBAT_BONUS;
  const def = input.passiveDefPct
    ? Math.floor(baseDef * (1 + input.passiveDefPct / 100))
    : baseDef;
  // 수호자 반사 — 피격 시 (확정 방어력 × thornsDefPct%) 만큼 적에게 고정 반사.
  //   미보유=0 → 키 생략(아래 spread)으로 byte-identical.
  const thornsFlatFromDef = input.passiveThornsDefPct
    ? Math.floor((def * input.passiveThornsDefPct) / 100)
    : 0;
  // 마법 공격력 — 지능 + 무기 위력(magicAtk). +기본 보너스(마법 빌드 0 빌드도 베이스 확보).
  const magicAtk =
    Math.floor(totalStats.int * MAGIC_ATK_PER_INT) +
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
    (input.passiveDefPct ?? 0) + (input.passiveMagicDefPct ?? 0);
  const magicDef = passiveMagicDefPct
    ? Math.floor(baseMagicDef * (1 + passiveMagicDefPct / 100))
    : baseMagicDef;
  // 최소 데미지(신규) — 힘·지능 major + 활력 minor. 데미지 하한.
  const minDamage = Math.floor(
    totalStats.str * MIN_DMG_PER_STR +
      totalStats.int * MIN_DMG_PER_INT +
      totalStats.vit * MIN_DMG_PER_VIT,
  );
  // 회복량 배수(신규) — 정신(주력)·활력(보조). heal effect 스케일(1.0 기준). 회복강화는 곱연산
  //   ×(1+%/100) — 패시브(신술 지원) + 장비 옵션(SPI PR-2) 합산. 미지정/0 = ×1(byte-identical).
  const healMult =
    (1 +
      totalStats.vit * HEAL_MULT_PER_VIT +
      totalStats.spi * HEAL_MULT_PER_SPI) *
    (1 + ((input.passiveHealPowerPct ?? 0) + equipAcc.healPowerPct) / 100);
  // 코어루프 모험가 HP 패시브 — on + 무직(=모험가)일 때만 ×1.1. off = ×1.0(무변경).
  // 직업 시스템 v2 — 최대 HP/MP % 패시브(체력/마나). 미지정(flag off/sim) = ×1(무변경).
  const maxHp = Math.floor(
    (V2_BASE_HP +
      Math.max(0, level - 1) * V2_HP_PER_LEVEL +
      totalStats.vit * HP_PER_VIT +
      equipAcc.hp) *
      coreLoopMaxHpMult(playerClass, V2_CORE_LOOP_V2) *
      (1 + (input.maxHpPct ?? 0) / 100),
  );
  const maxMp = Math.floor(
    (V2_BASE_MP +
      Math.max(0, level - 1) * V2_MP_PER_LEVEL +
      totalStats.int * MP_PER_INT +
      equipAcc.mp) *
      (1 + (input.maxMpPct ?? 0) / 100),
  );
  // 치명타 확률 — 행운 + 장비 + 장착 패시브(급소·치명, A 메타 다양성). 미지정 +0.
  const critChancePct =
    totalStats.luk * CRIT_PER_LUK +
    equipAcc.crit +
    (input.passiveCritPct ?? 0);
  // 치명타 피해 가산원(선형 합) — 행운 major + 힘 minor + 장비 + 장착 패시브(맹공, %→/100).
  //   base/천장은 critMultCurve(점감)에서 1회 적용. 인술(passive)·spec 가산도 같은 풀에 합류.
  const critBonus =
    totalStats.luk * CRIT_DMG_PER_LUK +
    totalStats.str * CRIT_DMG_PER_STR +
    equipAcc.critMult / 100 + // 반지 슬롯 고유 축(백분의 일 정수 → 배수).
    (input.passiveCritDmgPct ?? 0) / 100;
  // 치명타 저항(신규) — 정신. 피격 시 상대 치명 확률 차감(%p). cap 적용(완전 봉인 방지).
  //   ⚠️ 파생 스탯이라 PvE(치명형 몹)·PvP(engine.pvpPhase) **양쪽** 캡 — spi>500 빌드는 PvP
  //   치명저항도 50%p 에서 멈춘다(현 플레이어 범위 밖이나 명시).
  const critResistPct = Math.min(
    CRIT_RESIST_PCT_CAP,
    totalStats.spi * CRIT_RESIST_PER_SPI + equipAcc.critResist,
  );
  // 회피 — 민첩 + 행운 minor + 장비 + 장착 패시브(허보).
  //   evaRating = 캡 없는 raw 합. 회피 대결형(Slice 1 PvE 몹→플레이어 + Slice 2 플레이어→몹·PvP 양방향)이
  //   전투에서 쓰는 값. evasionPct = min(evaRating, 75) 은 이제 표시 전용(캡=UI 한정·전투 미사용).
  const evaRating =
    totalStats.dex * EVA_PER_DEX +
    totalStats.luk * EVA_PER_LUK +
    equipAcc.eva +
    (input.passiveEvasionPct ?? 0);
  const evasionPct = Math.min(evaRating, EVASION_PCT_CAP);
  // 명중 — 민첩 major + 힘·정신 minor.
  const accuracyPct = Math.max(
    0,
    totalStats.dex * ACCURACY_PCT_PER_DEX +
      totalStats.str * ACC_PER_STR +
      totalStats.int * ACC_PER_INT +
      totalStats.spi * ACC_PER_SPI,
  );
  // 속도 = 민첩 파생(1차 아님) − 장비 무게×계수(중갑일수록 느림). 음수 0 클램프.
  const spd = Math.max(
    0,
    totalStats.dex * SPD_PER_DEX -
      equipAcc.weight * WEIGHT_SPD_PENALTY +
      equipAcc.spd, // 신발 슬롯 고유 축.
  );
  // v2 다중공격 — SPD × 0.5%p 추가공격 확률 (SPD 200=100% 확정 +1, …).
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
  const specSpd = specEff.spdPctAdd
    ? Math.floor(spd * (1 + specEff.spdPctAdd / 100))
    : spd;
  // 광폭 — 자신 방어력 감소(derive). 미보유면 def 그대로(inert).
  const specDef = specEff.selfDefReductionPct
    ? Math.floor(def * (1 - specEff.selfDefReductionPct / 100))
    : def;
  // 방패치기 — 방어력의 일부를 공격력에 가산(derive). 방어 감소(광폭) 적용 후 def 기준.
  if (specEff.atkFromDefPct) {
    specAtk += Math.floor(specDef * (specEff.atkFromDefPct / 100));
  }
  // 광폭 — 가하는 피해 +%: atk·magicAtk 에 환산(평타·스킬 스케일 모두 반영, derive 근사).
  if (specEff.dmgDealtPctAdd) {
    const m = 1 + specEff.dmgDealtPctAdd / 100;
    specAtk = Math.floor(specAtk * m);
    specMagicAtk = Math.floor(specMagicAtk * m);
  }

  // 명중 — 상한 적용 전 raw(스탯+전문화+장착 패시브 정밀). 궁사 활 패시브는 이 raw 의 적중 임계
  //   초과분을 공격력으로. 다양성 패시브(정밀)는 명중에 가산(PvE/PvP 양쪽 소비).
  const rawAccuracyPct =
    accuracyPct + (specEff.accuracyPctAdd ?? 0) + (input.passiveAccuracyPct ?? 0);
  if (weaponTypeOf(v2Equipped.weapon) === "bow") {
    const excessAccuracy = Math.max(0, rawAccuracyPct - BOW_HIT_THRESHOLD);
    specAtk += Math.floor(excessAccuracy * BOW_ACCURACY_TO_ATK_COEF);
  }
  // 5차 물리 캡스톤(검호·명궁) — 행동빈도 데드존(SPD>292) 초과 속도를 공격력 %로. SPD 무한 →
  //   점근(재폭주 방지). 상한 수렴·절대 도달X = 속도 죽은 스탯 X. %라 무기/레벨로 큰 atk 풀에 비례.
  if (input.passiveSpdOverflowToAtkPct) {
    const excessSpd = Math.max(0, specSpd - SPD_OVERFLOW_THRESHOLD);
    const pct =
      input.passiveSpdOverflowToAtkPct * (1 - Math.exp(-excessSpd / SPD_OVERFLOW_SCALE));
    specAtk += Math.floor(specAtk * (pct / 100));
  }
  // accRating = 캡 없는 raw + 기본 명중(회피 대결형 Slice 2 — 명중이 방어자 회피 대결을 누르는
  //   레이팅·evaRating 대칭). ACC_BASE_RATING 는 대결 퇴화(acc0→75%) 방지·회피몹 옛 느낌 보존용.
  //   finalAccuracyPct(캡 35)는 이제 표시 전용. 궁사 활 잉여 딜 환원은 위 raw 기준이라 영향 없음.
  const accRating = rawAccuracyPct + ACC_BASE_RATING;
  const finalAccuracyPct = Math.min(ACCURACY_PCT_CAP, rawAccuracyPct);

  // 직업 효과 패시브 + 장착 패시브 합산. 0 이면 spread 생략(inert).
  const totalDamageTakenReductionPct =
    (specEff.damageTakenReductionPct ?? 0) +
    (input.passiveDamageTakenReductionPct ?? 0); // 장착 패시브(방벽) — 가산.
  const totalBleedDmgPerStack = specEff.bleedDmgPerStack ?? 0;
  const totalPoisonStrength = specEff.poisonPctPerStackBase ?? 0;
  const totalLifestealPct =
    (specEff.lifestealPct ?? 0) +
    (input.passiveLifestealPct ?? 0); // 장착 패시브(포식) — 저수치.
  const totalPoisonedEnemyDefReductionPct =
    (specEff.poisonedEnemyDefReductionPct ?? 0) +
    (input.passivePoisonedEnemyDefReductionPct ?? 0);

  const player: PlayerCombat = {
    hp,
    maxHp,
    mp,
    maxMp,
    intStat: totalStats.int,
    // 스킬 스케일/차수용 — 나한권(vit 비례 딜)·전문화 스킬 차수 flat(baseFlatByTier).
    vitStat: totalStats.vit,
    // scaling:"dex"/"luk" 비례 딜(도적 직군 스킬)용 total. % 패시브/내장보너스 반영된 최종값.
    dexStat: totalStats.dex,
    lukStat: totalStats.luk,
    allStatTotal: V2_STAT_KEYS.reduce((sum, stat) => sum + totalStats[stat], 0),
    classTier: input.classTier,
    // 발동형 시그니처(Phase 2) — 활성분 있을 때만 키 추가(빈 배열이면 키 자체 생략 →
    //   미장착 액터의 player 객체·스냅샷 byte-identical, 엔진 훅 미발화).
    ...(equipSignatures.length > 0 ? { equipSignatures } : {}),
    // 밤그림자 — 스킬 치명 오버플로 플래그. 미보유(false/undefined)면 키 생략 → player 객체 byte-identical.
    ...(input.passiveSkillCritOverflow ? { skillCritOverflow: true as const } : {}),
    atk: specAtk,
    magicAtk: specMagicAtk,
    def: specDef,
    spd: specSpd,
    evasionPct,
    evaRating, // 회피 대결형 — 전투에서 쓰는 캡 없는 raw(evasionPct 는 표시 전용).
    accuracyPct: finalAccuracyPct, // 표시 전용(캡 35). 전투 명중은 accRating.
    accRating, // 회피 대결형 Slice 2 — 명중이 방어자 회피 대결을 누르는 캡 없는 raw.
    attackCount: 1,
    extraAttackChancePct:
      extraAttackChancePct + (specEff.extraAttackChancePct ?? 0),
    critChancePct: critChancePct + (specEff.critChancePctAdd ?? 0), // 급습
    // 치명타 피해 — 전 가산원(luk/str/장비/맹공/인술/spec) 합을 점감 곡선으로 1회 환산.
    critMult: critMultCurve(critBonusWithPassive + (specEff.critMultAdd ?? 0)),
    // PR-2 신규 v2 축 — PlayerCombat 옵셔널 필드 (라이브 미사용, combatShared/engine v2 경로만).
    magicDef,
    critResistPct,
    minDamage,
    healMult,
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
    // 원소 통달(원소술사) — 속성 상성 양방향 강화. 미보유=0 → 키 생략(inert·byte-identical).
    ...((input.passiveElementAdvPctBonus ?? 0) > 0
      ? { elementAdvPctBonus: input.passiveElementAdvPctBonus }
      : {}),
    ...((input.passiveElementDisPctBonus ?? 0) > 0
      ? { elementDisPctBonus: input.passiveElementDisPctBonus }
      : {}),
    ...(specEff.reflectPct ? { thornsPct: specEff.reflectPct } : {}),
    ...(thornsFlatFromDef > 0 ? { thornsFlatFromDef } : {}),
    ...(totalBleedDmgPerStack > 0
      ? {
          bleedOnHit: {
            flatPerStack: totalBleedDmgPerStack,
            atkCoefPerStack: BLEED_ATK_COEF_PER_STACK,
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
    ...(input.passiveBerserkAtkPctPerLostHpPct
      ? {
          berserkAtkPctPerLostHpPct:
            input.passiveBerserkAtkPctPerLostHpPct,
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

// 이미 읽은 4개 save 값(character/equipment/proficiency/skills)에서 전투 스탯 derive — DB select
//   없이. derivePlayerCombatV2(select 래퍼)가 read 후 호출한다. 사냥 라우트처럼 save 를 이미
//   lock-read 한 곳이 중복 select 없이 직접 derive 하도록 분리(behavior 는 래퍼와 byte-동일).
//   character 없으면 null(래퍼와 동일).
export function derivePlayerCombatV2FromSaves(saves: {
  character: SavedCharacterV2 | undefined;
  equipmentSave: unknown;
  proficiencyRaw: unknown;
  skillsRaw: unknown;
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
  const statPct = passiveAgg.statPct;
  const maxHpPct = passiveAgg.maxHpPct;
  const maxMpPct = passiveAgg.maxMpPct;
  // 직업 효과 패시브(받피감·spd 등) — specEff 경로로 주입(현재 V2_JOB_PASSIVES 비어 inert).
  const jobPassiveEffect = jobPassive(v2JobId);

  return derivePlayerCombatV2Pure({
    level: character.level ?? 1,
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
    statPct,
    maxHpPct,
    maxMpPct,
    // 다양성 패시브(A 메타) — 장착 합산분을 엔진 레버로 전달.
    passiveCritPct: passiveAgg.critPct,
    passiveCritDmgPct: passiveAgg.critDmgPct,
    passiveEvasionPct: passiveAgg.evasionPct,
    passiveLifestealPct: passiveAgg.lifestealPct,
    passiveCounterChancePct: passiveAgg.counterChancePct,
    passiveDefPct: passiveAgg.defPct,
    passiveThornsDefPct: passiveAgg.thornsDefPct,
    passiveAccuracyPct: passiveAgg.accuracyPct,
    passiveHealPowerPct: passiveAgg.healPowerPct,
    passiveDamageTakenReductionPct: passiveAgg.damageTakenReductionPct,
    passiveMagicDefPct: passiveAgg.magicDefPct,
    passiveOpeningMagicDamageReductionPct:
      passiveAgg.openingMagicDamageReductionPct,
    passiveOpeningMagicDamageReductionPhases:
      passiveAgg.openingMagicDamageReductionPhases,
    passiveElementAdvPctBonus: passiveAgg.elementAdvPctBonus,
    passiveElementDisPctBonus: passiveAgg.elementDisPctBonus,
    passivePoisonedEnemyDefReductionPct:
      passiveAgg.poisonedEnemyDefReductionPct,
    passiveBerserkAtkPctPerLostHpPct:
      passiveAgg.berserkAtkPctPerLostHpPct,
    passiveEnemyMagicVulnPctPerStack:
      passiveAgg.enemyMagicVulnPctPerStack,
    passiveEnemyMagicVulnApplyChancePct:
      passiveAgg.enemyMagicVulnApplyChancePct,
    passiveSpdOverflowToAtkPct: passiveAgg.spdOverflowToAtkPct,
    passiveSkillCritOverflow: passiveAgg.skillCritOverflow,
    passiveComboFinisherBonusPct: passiveAgg.comboFinisherBonusPct,
  });
}

// DB select 래퍼 — v2 save 를 read 후 FromSaves 로 derive. 9개 라우트가 그대로 사용.
//   preloaded — 호출부가 이미 lock-read 한 save 를 넘기면 그 키는 재select 하지 않는다
//   (사냥 배치의 판당 중복 read 절감). character/equipment 뿐 아니라 proficiency/skills 도
//   preload 가능 — 4개 모두 넘기면 select 자체를 건너뛴다(사냥 라우트가 4개를 upfront lock-read).
//   넘긴 값은 같은 tx 의 락-read 라 select 결과와 동일 → derive 결과 byte-동일.
export async function derivePlayerCombatV2(
  userId: string,
  executor: DbExecutor = db,
  preloaded?: {
    character?: SavedCharacterV2;
    equipmentSave?: unknown;
    proficiencyRaw?: unknown;
    skillsRaw?: unknown;
  },
): Promise<DerivedPlayerCombatV2 | null> {
  const haveChar = preloaded?.character !== undefined;
  const haveEquip = preloaded?.equipmentSave !== undefined;
  const haveProf = preloaded?.proficiencyRaw !== undefined;
  const haveSkills = preloaded?.skillsRaw !== undefined;
  const keys = [
    ...(haveChar ? [] : (["character.v2"] as const)),
    ...(haveEquip ? [] : (["equipment.v2"] as const)),
    ...(haveProf ? [] : (["proficiency.v2"] as const)),
    ...(haveSkills ? [] : (["skills.v2"] as const)),
  ];

  let character: SavedCharacterV2 | undefined = preloaded?.character;
  let equipmentSave: unknown = preloaded?.equipmentSave;
  let proficiencyRaw: unknown = preloaded?.proficiencyRaw;
  let skillsRaw: unknown = preloaded?.skillsRaw;
  // 미preload 키만 select. 4개 모두 preload(사냥 라우트)면 빈 배열 → DB 왕복 0.
  if (keys.length > 0) {
    const rows = await executor
      .select({ key: savesKv.key, value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), inArray(savesKv.key, [...keys])));
    for (const r of rows) {
      if (r.key === "character.v2") character = r.value as SavedCharacterV2;
      else if (r.key === "equipment.v2") equipmentSave = r.value;
      else if (r.key === "proficiency.v2") proficiencyRaw = r.value;
      else if (r.key === "skills.v2") skillsRaw = r.value;
    }
  }
  return derivePlayerCombatV2FromSaves({
    character,
    equipmentSave,
    proficiencyRaw,
    skillsRaw,
  });
}
