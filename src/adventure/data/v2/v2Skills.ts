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
import {
  parseCombatPattern,
  parseCombatPresets,
  type V2CombatCondition,
  type V2CombatPattern,
  type V2CombatPreset,
} from "@/adventure/v2/combat/combatPattern";
import {
  type V2LoadoutPreset,
  PRESET_NAME_MAX,
  totalPresetSlots,
} from "./v2LoadoutPresets";

export type V2SkillCategory = "attack" | "heal" | "buff" | "debuff" | "passive";

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
  /** 민첩→공격력 보조 계수(예기). */
  atkPerDexCoef?: number;
  // ── 다양성 확장(A 메타) — 스탯 크기 외 "작동 방식" 사이드그레이드. 모두 가산 합산.
  //   엔진 레버에 직결: critPct→critChancePct · critDmgPct→critMult(/100) · evasionPct→eva(cap)
  //   · lifestealPct→흡혈(낮게). 미지정=무적용(byte-identical).
  /** 치명타 확률 +%p 가산(급소·치명). */
  critPct?: number;
  /** 치명타 피해 +% 가산(맹공) — critMult 에 /100 환산 가산. */
  critDmgPct?: number;
  /** 회피 +%p 가산(허보) — eva 캡 적용 대상. */
  evasionPct?: number;
  /** 흡혈 +% — 가한 피해의 일부 체력 흡수(포식). 자동전투 눈덩이 방지로 의도적 저수치. */
  lifestealPct?: number;
  /** 반격 확률 +%p — 피격 생존 시 이 확률로 적에게 ATK 반격(절정 반격). 엔진 passiveCounterChancePct
   *  훅에 합산(PvE enemyPhase 전용·반격의 룬과 동일 패턴). 미지정=무적용. */
  counterChancePct?: number;
  // ── 다양성 2차(A 메타) — 둘 다 PvE/PvP 양쪽 적용(def=damageBetween 공용·명중=PvP도 소비).
  /** 물리 방어력 +% 가산(철벽) — def 에 곱연산. */
  defPct?: number;
  /** 반사(가시) — 피격 시 내 방어력의 이 %만큼을 적에게 고정 데미지로 반사(수호자 패시브).
   *  derive 가 def × %/100 → PlayerCombat.thornsFlatFromDef, 엔진이 피격 시 가산(PvE enemyPhase +
   *  PvP applyOnHitReflect 양쪽). 미지정=무적용(byte-identical). 100 = "방어 계수의 수치만큼". */
  thornsDefPct?: number;
  /** 명중 +%p 가산(정밀) — accuracyPct 에 가산(캡 적용). */
  accuracyPct?: number;
  // ── SPI 부활(신술 지원) — 회복 강화. healMult 에 곱연산(딜 아님 → INT 와 역할 분리·파워크립 차단).
  /** 회복 +% 가산(치유 강화) — healMult ×(1+합산%/100). 신술 지원 라인 패시브. */
  healPowerPct?: number;
  // ── 받피감(방벽) — 받는 피해 -% 곱연산. specEff.damageTakenReductionPct 와 같은 훅에 합산.
  //   PvE/PvP 양쪽 작동(#835 PvP 미러 후). 미지정=무적용(byte-identical).
  /** 받는 피해 -% 가산(방벽) — totalDamageTakenReductionPct 에 합산. */
  damageTakenReductionPct?: number;
  // ── 원소 통달(원소술사) — 속성 상성 양방향 강화. 유리 시 추가 딜·불리(받을 때) 추가 감소.
  //   derive 가 player.elementAdvPctBonus/DisPctBonus 로 합산 → cast 의 elementAdvPct/disPct 에 가산.
  /** 속성 유리 배수 +%p 가산(원소 통달) — V2_ELEMENT_ADV_PCT 에 더해 전달. */
  elementAdvPctBonus?: number;
  /** 속성 불리 감소 +%p 가산(원소 통달) — V2_ELEMENT_DIS_PCT 에 더해 전달(받피 추가 경감·딜 추가 손해). */
  elementDisPctBonus?: number;
  // ── 경제(비전투) — 장착 시 사냥 처치당 숙달 포인트 획득 +N. 전투 derive 무관(hunt 지급부에서 소비).
  profPerKillBonus?: number;
};

// 스킬 학습 비용 — 숙련도(직군 숙달 포인트)로 지불. 모든 학습 스킬 고정 단가. 스타터(자동 보유)는
// 학습 경로를 타지 않는다. 킬당 +proficiencyPerKillAtDepth(깊이 밴드 비례 2~5) 포인트 기준 →
// 들판 기준 ~750킬/종(심층일수록 단축). learn-skill 라우트(차감) + state 라우트(UI 가격 표기)가 참조.
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
  | "v2_skill_meditate" // INT 명상
  // ── 몬스터 전용 상태이상 (PR-9) — 플레이어 미학습, 몹 v2Skills 로만 ──────
  | "mob_venom_bite" // 독니 — 중독(DoT)
  | "mob_chilling_touch" // 한기 — 둔화(속도−)
  | "mob_rending_claw" // 살점 뜯기 — 출혈(DoT)
  // (위 3종은 V2MonsterStatusSkillId 로도 재노출 — 몹 부착 타입 안전)
  // ── 몬스터 전용 마법 시전 (사냥터 마법몹 castSkill) — scaling magic·플레이어 미학습 ──
  | "mob_arcane_bolt" // 마력탄 — 마법 단일딜(magicDef 경감)
  | "mob_arcane_burst" // 비전 작렬 — 강한 마법 단일딜
  // ── 스킬 재설계 — 공용 액티브 18종 (직군당 5, 마력구/예기 패시브 제외) ───
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
  | "mob_rending_claw";

// 몬스터 전용 마법 시전 스킬 id (DungeonEnemy.castSkill 부착 타입 안전). 사냥터 마법몹이
//   마법 평타 대신 시전(시전 턴엔 평타 생략 → DPS 대략 중립·"체감"↑). scaling magic → 플레이어
//   magicDef(정신)로 경감. attackerMagicAtk 미지정(몹) → atk 폴백(combatShared). statusSkill 과 병합 가능.
export type V2MonsterCastSkillId = "mob_arcane_bolt" | "mob_arcane_burst";

// baseFlatByTier: 전문화 스킬 차수 flat 성장(2/3/4차). 지정 시 시전자 차수로 baseFlat 대체(엔진 PR2).
//   공용 스킬은 차수 무관이라 미지정(baseFlat 고정).
// scaling "def": 방어비례딜(방패 가격) — atk/magicAtk 대신 DEF 스케일.
// scaling "vit": VIT 비례 딜(나한권) — 금강(VIT 앵커) 정체성, 기사 DEF비례와 다른 축.
//   def/vit/dex/luk 은 시전자 그 스탯 값이 필요 → 엔진(combatShared.damageWith) 배선(미배선 스탯은
//   physical 대체). dex/luk = 도적 직군 직접 비례딜(원시 스탯이 크므로 계수는 작게 — str→atk 0.15급).
export type V2DamageScaling =
  | "physical"
  | "magic"
  | "def"
  | "vit"
  | "dex"
  | "luk";
export type V2SkillEffect =
  | {
      kind: "damage";
      statCoef: number;
      baseFlat?: number;
      baseFlatByTier?: readonly [number, number, number];
      scaling?: V2DamageScaling;
      // 관통(방어 무시) 추가타 — 이 타의 "방어 미적용(0방어) 피해"의 pierceDamagePct% 를
      //   방어로 감산되지 않는 추가 데미지로 더한다(같은 타에 합산). 미지정=0(관통 없음).
      //   고방어 적일수록 본타는 줄지만 관통분은 그대로라 "꿰뚫는" 페이오프(관통사).
      pierceDamagePct?: number;
    }
  // pctLostHp: 잃은 체력 비례 회복(기공 순환).
  | { kind: "heal"; pctMaxHp?: number; flat?: number; pctLostHp?: number }
  | { kind: "selfBuff"; stat: StatKey; pct: number; turns: number }
  // 파생 스탯 버프 — StatKey 밖(회피=선풍각, 크리율=연환 집중, 받피감 등).
  | { kind: "selfBuffPct"; target: "evasion" | "crit" | "damageReduction"; pct: number; turns: number }
  // 매턴 HP 리젠(운기).
  | { kind: "selfRegen"; pctMaxHpPerTurn: number; turns: number }
  // 보호막 — maxHP·maxMP 비례 흡수(마나 보호막).
  | { kind: "shield"; pctMaxHp?: number; pctMaxMp?: number; turns: number }
  // 마나 회복(명상).
  | { kind: "manaRestore"; pctMaxMp: number }
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
  // HP 소모 딜 — 현재 HP pctCurrentHp% 소모 + 소모량×soakRatio 추가딜(사혈격).
  | {
      kind: "hpCostDamage";
      pctCurrentHp: number;
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      soakRatio: number;
      scaling?: V2DamageScaling;
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
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      hpThresholdPct: number;
      bonusMult: number;
      scaling?: V2DamageScaling;
    }
  // 스택 비례 딜 — 적 DoT/취약 스택당 추가딜(참절·중독 폭발·비전 작렬).
  | {
      kind: "stackPayoffDamage";
      tag: "bleed" | "poison" | "magicVuln";
      statCoef: number;
      baseFlatByTier?: readonly [number, number, number];
      perStackFlat: number;
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
  /** 발동 후 N턴 동안 재발동 불가. 0 = 매 턴 가능. */
  cooldown: number;
  /** 발동 확률 % (0~100). 미지정=100=조건 충족 시 항상 발동. <100 이면 매 발동 판정마다
   *  procRoll 롤 — 실패하면 미발동(평타로 폴백, MP·쿨다운 미소모). 스킬 발동확률 패시브 토대. */
  procChance?: number;
  effects: readonly V2SkillEffect[];
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
  /** SP 로드아웃 코스트(코어루프) — 미지정이면 (category, tier) 루브릭 표(spCostOf)에서 도출.
   *  PR-5 sim 튜닝 때 아웃라이어만 명시 override. flag-off 미사용. */
  spCost?: number;
  /** 학습 비용 오버라이드(숙달 포인트) — 미지정이면 tier 스케일(V2_SKILL_LEARN_COST_BY_TIER). */
  learnCost?: number;
  /** 패시브 스킬(category "passive") 의 상시 효과 — 장착 시 derive 가 적용(캐스트 아님).
   *  액티브 스킬은 미지정. 직업 킷 재설계 — 근력/강건/총명/예기 등. */
  passive?: V2PassiveSkillEffect;
};

// === SP 코스트 = 스킬 성능(power)에 비례 (2026-06-21 재설계) ====================
// 옛 (category, tier) 표는 차수만으로 가격을 매겨, 같은 차수의 강·약 스킬이 같은 값이고 차수 간
// 격차도 작았다(저렴=약함 트레이드오프 붕괴, 오너 피드백 "성능에 비례해 책정하라"). 대신 각 스킬의
// effects/passive 를 합산한 power 점수를 산출해 그에 비례하는 코스트(1~10)를 도출한다.
//   - power 단위 ≈ "ATK 한 방 가치"(dmg(1.0,140) ≈ 1.0). 카테고리 교차 정규화.
//   - 액티브는 발동확률(procChance)로 가중(신뢰성=성능) — 단 √소프트닝으로, 큰 한방·저확률
//     스킬이 "기댓값 낮음"으로 너무 싸지지 않게(원시 ×proc 면 최강 누크가 최저가가 되는 역전 방지).
//   - 패시브는 상시 효과라 발동 가중 없이 효과 크기 합산.
//   🔑 SP 보유량(calcSpBudget)은 별도로 끌어올릴 예정(오너) — 코스트만 성능비례로 재조정.
const SP_FLAT_NORM = 140; // baseFlat ~140 ≈ statCoef 1.0 (정규화 기준).

function spAvgTier(byTier?: readonly [number, number, number]): number {
  return byTier ? (byTier[0] + byTier[1] + byTier[2]) / 3 : 0;
}

// 액티브 effect 1개의 가치(statCoef-등가 단위).
function spEffectValue(e: V2SkillEffect): number {
  switch (e.kind) {
    case "damage":
      return (
        e.statCoef +
        ((e.baseFlat ?? 0) + spAvgTier(e.baseFlatByTier)) / SP_FLAT_NORM
      );
    case "hpCostDamage": {
      const base = e.statCoef + spAvgTier(e.baseFlatByTier) / SP_FLAT_NORM;
      return (base + 0.3 * e.soakRatio) * 0.85; // 자체 HP 소모 할인.
    }
    case "healToDamage": {
      const base = e.healStatCoef + spAvgTier(e.healFlatByTier) / SP_FLAT_NORM;
      return base * (1 + 0.5 * e.damageRatio); // 자힐 + 미러 데미지.
    }
    case "executeDamage": {
      const base = e.statCoef + spAvgTier(e.baseFlatByTier) / SP_FLAT_NORM;
      return base * (1 + 0.25 * (e.bonusMult - 1)); // 조건부 처형 배수 = 약하게.
    }
    case "ambushDamage": {
      const base = e.statCoef + spAvgTier(e.baseFlatByTier) / SP_FLAT_NORM;
      return base * (1 + 0.2 * (e.bonusMult - 1)); // 풀피 한정(첫 턴 1회) — 처형보다 더 약하게.
    }
    case "stackPayoffDamage": {
      const base = e.statCoef + spAvgTier(e.baseFlatByTier) / SP_FLAT_NORM;
      return base + (e.perStackFlat / SP_FLAT_NORM) * 2 * 0.6; // ~2 스택·조건부.
    }
    case "dot": {
      const perStack =
        e.flatPerStack / SP_FLAT_NORM + e.atkCoefPerStack + e.pctMaxHpPerStack / 12;
      return e.stacks * e.turns * perStack;
    }
    case "heal":
      return (e.pctMaxHp ?? e.pctLostHp ?? 0) / 16 + (e.flat ?? 0) / SP_FLAT_NORM;
    case "shield":
      return (((e.pctMaxHp ?? 0) + (e.pctMaxMp ?? 0)) / 20) * Math.max(1, e.turns) * 0.5;
    case "selfRegen":
      return (e.pctMaxHpPerTurn * e.turns) / 16;
    case "manaRestore":
      return e.pctMaxMp / 30;
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
    case "selfHaste":
    case "enemyDelay":
      return e.pct / 60; // 1회성 ATB 템포(턴 없음).
  }
  const _ex: never = e;
  return _ex;
}

// 스킬 power 점수 — 액티브는 effects 합×proc소프트닝×쿨다운, 패시브는 효과 크기 합.
export function skillPowerScore(def: V2SkillDefinition): number {
  if (def.passive) {
    const p = def.passive;
    let mag = 0;
    for (const v of Object.values(p.stat ?? {})) mag += Math.abs(v ?? 0) / 10;
    for (const v of Object.values(p.statPct ?? {})) mag += Math.abs(v ?? 0) / 10;
    mag += (p.maxHpPct ?? 0) / 10;
    mag += (p.maxMpPct ?? 0) / 12;
    mag += (p.atkPerDexCoef ?? 0) * 12;
    mag += (p.critPct ?? 0) / 6;
    mag += (p.critDmgPct ?? 0) / 25;
    mag += (p.evasionPct ?? 0) / 8;
    mag += (p.lifestealPct ?? 0) / 4;
    mag += (p.counterChancePct ?? 0) / 12;
    mag += (p.defPct ?? 0) / 12;
    mag += (p.thornsDefPct ?? 0) / 40;
    mag += (p.accuracyPct ?? 0) / 12;
    mag += (p.healPowerPct ?? 0) / 16;
    mag += (p.damageTakenReductionPct ?? 0) / 8;
    mag += (p.elementAdvPctBonus ?? 0) / 15;
    mag += (p.elementDisPctBonus ?? 0) / 20;
    return mag;
  }
  const sumEffects = (effects: readonly V2SkillEffect[]): number => {
    let r = 0;
    for (const e of effects) r += spEffectValue(e);
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
  // proc 가중 — 0~1 클램프(손상된 음수 procChance 방어). √소프트닝 + 바닥(0.55): 저확률 스킬에
  //   일부 할인은 주되 최강 누크가 최저가가 되지 않게. 10%→0.69 · 30%→0.80 · 100%→1.0.
  const proc = Math.min(1, Math.max(0, (def.procChance ?? 100) / 100));
  raw *= 0.55 + 0.45 * Math.sqrt(proc);
  if (def.cooldown > 0) raw /= 1 + def.cooldown / 4;
  return raw;
}

// 성능비례 코스트 바닥(루브릭) — power 점수 → SP(1~10 선형). override 트립와이어 기준.
//   기존 호출부/테스트가 rubricSpCost 이름을 쓰므로 유지(이제 "표"가 아니라 power 도출).
export function rubricSpCost(skill: V2SkillDefinition): number {
  const sp = Math.round(0.7 + 3.0 * skillPowerScore(skill));
  return Math.max(1, Math.min(10, sp));
}

// 스킬 1종의 SP 코스트 — 명시 spCost override 는 "위로만"(루브릭 이상) 허용(아웃라이어 너프).
//   아래로 깎으면 값싼+강한 공용 스택(정체성 붕괴) 길이 열린다 → max(루브릭, override).
//   v2Skills.test 트립와이어가 spCostOf ≥ rubricSpCost 를 강제.
export function spCostOf(skill: V2SkillDefinition): number {
  if (typeof skill.spCost === "number" && skill.spCost > 0) {
    return Math.max(rubricSpCost(skill), Math.floor(skill.spCost));
  }
  return rubricSpCost(skill);
}

// === 카탈로그 — 스타터 6종 (Tier 1) ──────────────────────────────────
// 수치는 의도적으로 낮게 (사용자 spec "성장형 느낌"). 후속 PR 에서 강화 요소 도입.


export const V2_SKILLS: Record<V2SkillId, V2SkillDefinition> = {
  ...V2_BASE_SKILLS,
  ...V2_COMMON_SKILLS,
};

// 장착(로드아웃)된 패시브 스킬들의 상시 효과 합산 — derive 가 flag-on 일 때 호출.
//   stat 가산(근력 등) + atkPerDexCoef 합(예기). 패시브 아닌 스킬·미존재 id 는 무시.
export function aggregateEquippedPassives(equipped: readonly V2SkillId[]): {
  stat: Partial<Record<V2StatKey, number>>;
  statPct: Partial<Record<V2StatKey, number>>;
  maxHpPct: number;
  maxMpPct: number;
  atkPerDexCoef: number;
  critPct: number;
  critDmgPct: number;
  evasionPct: number;
  lifestealPct: number;
  counterChancePct: number;
  defPct: number;
  thornsDefPct: number;
  accuracyPct: number;
  healPowerPct: number;
  damageTakenReductionPct: number;
  elementAdvPctBonus: number;
  elementDisPctBonus: number;
} {
  const stat: Partial<Record<V2StatKey, number>> = {};
  const statPct: Partial<Record<V2StatKey, number>> = {};
  let maxHpPct = 0;
  let maxMpPct = 0;
  let atkPerDexCoef = 0;
  let critPct = 0;
  let critDmgPct = 0;
  let evasionPct = 0;
  let lifestealPct = 0;
  let counterChancePct = 0;
  let defPct = 0;
  let thornsDefPct = 0;
  let accuracyPct = 0;
  let healPowerPct = 0;
  let damageTakenReductionPct = 0;
  let elementAdvPctBonus = 0;
  let elementDisPctBonus = 0;
  for (const id of equipped) {
    const p = V2_SKILLS[id]?.passive;
    if (!p) continue;
    for (const [k, v] of Object.entries(p.stat ?? {})) {
      if (v) stat[k as V2StatKey] = (stat[k as V2StatKey] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(p.statPct ?? {})) {
      if (v) statPct[k as V2StatKey] = (statPct[k as V2StatKey] ?? 0) + v;
    }
    maxHpPct += p.maxHpPct ?? 0;
    maxMpPct += p.maxMpPct ?? 0;
    atkPerDexCoef += p.atkPerDexCoef ?? 0;
    critPct += p.critPct ?? 0;
    critDmgPct += p.critDmgPct ?? 0;
    evasionPct += p.evasionPct ?? 0;
    lifestealPct += p.lifestealPct ?? 0;
    counterChancePct += p.counterChancePct ?? 0;
    defPct += p.defPct ?? 0;
    thornsDefPct += p.thornsDefPct ?? 0;
    accuracyPct += p.accuracyPct ?? 0;
    healPowerPct += p.healPowerPct ?? 0;
    damageTakenReductionPct += p.damageTakenReductionPct ?? 0;
    elementAdvPctBonus += p.elementAdvPctBonus ?? 0;
    elementDisPctBonus += p.elementDisPctBonus ?? 0;
  }
  return {
    stat,
    statPct,
    maxHpPct,
    maxMpPct,
    atkPerDexCoef,
    critPct,
    critDmgPct,
    evasionPct,
    lifestealPct,
    counterChancePct,
    defPct,
    thornsDefPct,
    accuracyPct,
    healPowerPct,
    damageTakenReductionPct,
    elementAdvPctBonus,
    elementDisPctBonus,
  };
}

// 장착 패시브의 "처치당 숙달 포인트 보너스" 합산(경제 — 전투 aggregate 와 분리). hunt 지급부에서 소비.
export function equippedProfPerKillBonus(equipped: readonly V2SkillId[]): number {
  let n = 0;
  for (const id of equipped) n += V2_SKILLS[id]?.passive?.profPerKillBonus ?? 0;
  return n;
}

// 스킬 효과 1개를 사람이 읽을 한 줄로. UI 상세 옵션 칩에 사용.
const DERIVED_BUFF_LABEL: Record<"evasion" | "crit" | "damageReduction", string> = {
  evasion: "회피",
  crit: "치명률",
  damageReduction: "받는 피해 감소",
};
const STACK_TAG_LABEL: Record<"bleed" | "poison" | "magicVuln", string> = {
  bleed: "출혈",
  poison: "중독",
  magicVuln: "마법취약",
};
// 차수 flat(baseFlatByTier) 이면 범위로, 아니면 단일 baseFlat 으로 표기.
function flatChip(baseFlat?: number, byTier?: readonly [number, number, number]): string {
  if (byTier) return ` +${byTier[0]}~${byTier[2]}`;
  return baseFlat ? ` +${baseFlat}` : "";
}
function scalingChip(scaling?: V2DamageScaling): string {
  if (scaling === "magic") return " (마법)";
  if (scaling === "def") return " (방어비례)";
  if (scaling === "vit") return " (활력비례)";
  if (scaling === "dex") return " (민첩비례)";
  if (scaling === "luk") return " (행운비례)";
  return "";
}

function describeV2Effect(e: V2SkillEffect): string {
  switch (e.kind) {
    case "damage":
      return `피해 공격력×${e.statCoef}${flatChip(e.baseFlat, e.baseFlatByTier)}${scalingChip(e.scaling)}`;
    case "heal":
      if (e.pctLostHp != null) return `회복 잃은 체력 ${e.pctLostHp}%`;
      return e.pctMaxHp != null ? `회복 최대HP ${e.pctMaxHp}%` : `회복 +${e.flat ?? 0}`;
    case "selfBuff":
      return `${STAT_LABELS[e.stat]} +${e.pct}% (${e.turns}턴)`;
    case "selfBuffPct":
      return `${DERIVED_BUFF_LABEL[e.target]} +${e.pct}% (${e.turns}턴)`;
    case "selfRegen":
      return `매턴 최대HP ${e.pctMaxHpPerTurn}% 회복 (${e.turns}턴)`;
    case "shield": {
      const parts: string[] = [];
      if (e.pctMaxHp) parts.push(`최대HP ${e.pctMaxHp}%`);
      if (e.pctMaxMp) parts.push(`최대MP ${e.pctMaxMp}%`);
      return `보호막 (${parts.join(" + ")}) (${e.turns}턴)`;
    }
    case "manaRestore":
      return `마나 ${e.pctMaxMp}% 회복`;
    case "enemyDebuff":
      return `적 ${STAT_LABELS[e.stat]} −${e.pct}% (${e.turns}턴)`;
    case "enemyVuln":
      return `적 받는 피해 +${e.pct}% (${e.turns}턴)`;
    case "enemyEvasionDown":
      return `적 회피 −${e.pct}%p (${e.turns}턴)`;
    case "enemyAccuracyDown":
      return `적 명중 −${e.pct}%p (${e.turns}턴)`;
    case "selfHaste":
      return `내 다음 행동 속도 +${e.pct}% (1회)`;
    case "enemyDelay":
      return `적 다음 행동 지연 +${e.pct}% (1회)`;
    case "enemyHealReduce":
      return `적 회복 −${e.pct}% (${e.turns}턴)`;
    case "hpCostDamage":
      return `HP ${e.pctCurrentHp}% 소모 → 피해 공격력×${e.statCoef}${flatChip(undefined, e.baseFlatByTier)} + 소모량×${e.soakRatio}`;
    case "healToDamage":
      return `자힐 공격력×${e.healStatCoef}${flatChip(undefined, e.healFlatByTier)} → 힐량×${e.damageRatio} 피해`;
    case "executeDamage":
      return `피해 공격력×${e.statCoef}${flatChip(undefined, e.baseFlatByTier)} (적 HP ${e.hpThresholdPct}%↓ 시 ×${e.bonusMult})`;
    case "ambushDamage":
      return `피해 공격력×${e.statCoef}${flatChip(undefined, e.baseFlatByTier)} (적 HP ${e.hpThresholdPct}%↑ 시 ×${e.bonusMult})`;
    case "stackPayoffDamage":
      return `피해 공격력×${e.statCoef}${flatChip(undefined, e.baseFlatByTier)} + 적 ${STACK_TAG_LABEL[e.tag]} 스택당 +${e.perStackFlat}`;
    case "dot":
      return `${e.label} 지속피해 +${e.stacks}스택 (${e.turns}턴)`;
  }
  // 모든 효과 종류 처리됨 — 새 kind 추가 시 컴파일 에러로 누락 방지.
  const _exhaustive: never = e;
  return _exhaustive;
}

// 스킬의 상세 옵션을 칩 문자열 배열로 — 효과(피해/회복/버프/디버프/DoT) 먼저, 그 뒤
// MP·쿨다운·속성 메타. UI(학습/장착 화면)에서 작은 칩으로 표기.
//
// mpCost: 표시할 실효 MP. 시그니처(직업 전용)는 카탈로그 mpCost 가 0(센티넬)이고 실제
// 비용은 엔진이 차수별로 산정(combatShared.v2SkillMpCost) — 그 실효값을 넘기면 "MP N" 으로
// 정확히 표기된다. 미전달이면 카탈로그 mpCost(시그니처는 0=표기 생략).
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
  if (p.atkPerDexCoef) chips.push("민첩이 공격력을 보조");
  if (p.critPct) chips.push(`치명타 확률 +${p.critPct}%`);
  if (p.critDmgPct) chips.push(`치명타 피해 +${p.critDmgPct}%`);
  if (p.evasionPct) chips.push(`회피 +${p.evasionPct}%`);
  if (p.lifestealPct) chips.push(`흡혈 +${p.lifestealPct}%`);
  if (p.counterChancePct) chips.push(`피격 시 ${p.counterChancePct}% 반격`);
  if (p.defPct) chips.push(`방어력 +${p.defPct}%`);
  if (p.thornsDefPct) chips.push(`피격 시 방어력의 ${p.thornsDefPct}% 반사`);
  if (p.accuracyPct) chips.push(`명중 +${p.accuracyPct}`);
  if (p.healPowerPct) chips.push(`회복 +${p.healPowerPct}%`);
  if (p.damageTakenReductionPct)
    chips.push(`받는 피해 -${p.damageTakenReductionPct}%`);
  // 원소 통달(원소술사) — 속성 상성 양방향 강화. 누락 시 로드아웃/학습 화면에 칩이 안 떴음.
  if (p.elementAdvPctBonus)
    chips.push(`속성 유리 피해 +${p.elementAdvPctBonus}%`);
  if (p.elementDisPctBonus)
    chips.push(`속성 불리 받피 -${p.elementDisPctBonus}%`);
  return chips;
}

export function describeV2Skill(
  skill: V2SkillDefinition,
  mpCost: number = skill.mpCost,
): string[] {
  const chips = skill.passive
    ? describePassive(skill.passive)
    : skill.effects.map(describeV2Effect);
  if (mpCost > 0) chips.push(`MP ${mpCost}`);
  if (skill.cooldown > 0) chips.push(`쿨 ${skill.cooldown}턴`);
  if (skill.element && skill.element !== "neutral") {
    chips.push(`속성 ${V2_ELEMENT_LABEL[skill.element]}`);
  }
  return chips;
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

// === 저장 형태 ───────────────────────────────────────────────────────
// saves_kv 키 "skills.v2" — 서버 권위 (equipment.v2 와 동일 패턴, SYNCED_KEYS 외).
// 학습: 교관 NPC API 만 변경 가능. 장착: equip API 만 변경 가능.

export type V2SkillsState = {
  /** 학습 보유 스킬 id 목록 (영구, 중복 없음). */
  learned: V2SkillId[];
  /** 슬롯 장착 스킬 id 목록 (배열 순서 = 자동 발동 우선순위, learned 의 부분집합). */
  equipped: V2SkillId[];
  /** 전투 패턴(갬빗, C2) — 우선순위 {조건→행동} 블록. 미설정(undefined)이면 엔진이 장착 슬롯에서
   *  기본 패턴 도출(defaultPatternFromEquipped). combat-pattern 라우트만 변경. */
  pattern?: V2CombatPattern;
  /** 전투 패턴 프리셋(C4) — 이름 붙인 패턴 라이브러리(빠른 스왑용). 활성 패턴(pattern)과 별개,
   *  엔진 미사용(순수 저장). combat-pattern/presets 라우트만 변경. 미설정=빈 라이브러리. */
  presets?: V2CombatPreset[];
  /** 로드아웃 프리셋 — 이름 붙인 장착 스킬 묶음(빠른 빌드 전환). 엔진 미사용(순수 저장).
   *  loadout-presets 라우트만 변경. 슬롯 수 = totalPresetSlots()(무료 고정). 옛
   *  loadoutPresetSlotsBought 필드는 폐기(수집 포인트 경제 제거) — 옛 세이브에 남아도 inert. */
  loadoutPresets?: V2LoadoutPreset[];
};

export function emptyV2SkillsState(): V2SkillsState {
  return { learned: [], equipped: [] };
}

// 손상/누락 raw 도 안전하게 정규화. learned 의 부분집합인 equipped 만 유지하고
// equipped 길이는 caller (호출자가 슬롯 수 알고 있을 때) 잘라야 한다.
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
  let base: V2SkillsState = pattern
    ? { learned, equipped, pattern }
    : { learned, equipped };
  if (presets.length > 0) base = { ...base, presets };
  if (loadoutPresets.length > 0) base = { ...base, loadoutPresets };
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
  "healToDamage",
  "executeDamage",
  "stackPayoffDamage",
]);

// 스킬 1종의 기본 발동 조건 — 적에게 피해를 주면(직접/DoT) "항상"(평타 자리), 순수 유틸은 종류별 조건.
export function smartDefaultConditionForSkill(
  def: V2SkillDefinition,
): V2CombatCondition {
  const effs = def.effects;
  // 기습(ambushDamage) — 풀피 적에게만 큰 딜(처형의 역). 기본딜이 낮아 깎인 적엔 평타 이하라, 기본
  //   조건을 "첫 턴만(turn≤1)"으로 깔아 자동전투가 오프너 1회만 쏘게 한다("딱 첫 턴만"). 더 정교하게
  //   쓰려면 패턴 편집(예: 적 풀피일 때 재발동) — 패턴 사용 유도. DAMAGE_EFFECT_KINDS 의 "항상"보다 먼저.
  if (effs.some((e) => e.kind === "ambushDamage")) {
    return { kind: "turn", op: "atMost", value: 1 };
  }
  // 적에게 피해를 주는 스킬(부가 DoT/디버프 동반 포함)은 평타 대체 = 항상 발동.
  if (effs.some((e) => DAMAGE_EFFECT_KINDS.has(e.kind))) return { kind: "always" };
  // 순수 유틸 — 매 턴 스팸 방지로 종류별 조건.
  if (effs.some((e) => e.kind === "heal")) {
    return { kind: "self_hp", op: "below", pct: 50 }; // 힐 = HP 낮을 때.
  }
  if (effs.some((e) => e.kind === "shield" || e.kind === "selfRegen")) {
    return { kind: "self_hp", op: "below", pct: 60 }; // 보호막·리젠 = 피해 입을 때.
  }
  if (effs.some((e) => e.kind === "manaRestore")) {
    return { kind: "self_mp", op: "below", pct: 40 }; // 마나 회복(명상) = MP 낮을 때.
  }
  const statBuff = effs.find((e) => e.kind === "selfBuff");
  if (statBuff && statBuff.kind === "selfBuff") {
    return { kind: "self_buff", stat: statBuff.stat, active: false }; // 스탯 버프 = 안 걸렸을 때.
  }
  if (effs.some((e) => e.kind === "enemyVuln")) {
    return { kind: "enemy_status", tag: "vuln", op: "none", stacks: 0 }; // 취약 = 적이 취약 아닐 때.
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

// 장착 스킬을 스마트 기본 조건으로 묶은 패턴(슬롯 순서 = 우선순위 유지). 미설정 캐릭의 폴백.
//   카탈로그에 없는 id 는 안전하게 "항상". 엔진·에디터·PvP 가 공유(단일 소스).
export function smartDefaultPatternFromEquipped(
  equipped: readonly string[],
): V2CombatPattern {
  return {
    blocks: equipped
      // 패시브 스킬(category "passive")은 캐스트 대상 아님(상시 효과) — 자동 패턴에서 제외.
      .filter((skillId) => V2_SKILLS[skillId as V2SkillId]?.category !== "passive")
      .map((skillId) => {
        const def = V2_SKILLS[skillId as V2SkillId];
        return {
          condition: def
            ? smartDefaultConditionForSkill(def)
            : ({ kind: "always" } as V2CombatCondition),
          action: { kind: "skill" as const, skillId },
        };
      }),
  };
}
