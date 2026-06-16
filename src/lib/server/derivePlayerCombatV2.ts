// v2 전용 PlayerCombat derive — 라이브 derivePlayerCombat 호출 안 함.
//
// PR-S1 (5배 해상도): 6스탯 raw 값을 5배 스케일로 늘리고(레벨업당 5pt + 베이스/장비 ×5),
// 효과 계수는 1/5 로 줄임. 동일 빌드 최종 전투력은 그대로지만 미세 조정 해상도 5배.
// Codex 권고: 각 스탯 기여를 float 으로 누적 후 최종 단계에서만 floor.
// critChancePct 는 floor 제거 — 0.1%p 단위 허용 (해상도 이득 보존).
//
// 5배 스케일 6스탯 axis (옛 1pt 동등 = 새 5pt):
//   str → atk 주력 (atk += str×0.2)
//   dex → 회피 (eva += dex×0.1, cap 75) + 명중 (acc += dex×0.05) + atk 보조 (PR-T4 ×0.06)
//   vit → maxHp 주력 (vit×1), def 약화 (vit×0.1)
//   spd → 다중공격 확률 (extra += spd×0.5%p, 100%↑ 정수확정) + 선공권 + atk 보조 (×0.06)
//   luk → 치명 확률(crit += luk×0.15) + 치명 데미지(critMult += luk×0.006) + atk 보조(×0.04). 항상 작동
//   int → maxMp (int×2). 마법 axis 는 PR-7
//
// 장비(PR-4a 위력/무게/옵션 모델):
//   - 위력 → 슬롯별 분기(무기=물공+마공 / 방어구=물방 / 장신구=물방+마방). 결과 후-가산.
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
import { resolveClassPassive } from "@/adventure/data/v2/v2Passives";
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
  V2_EQUIP_SETS,
  parseEquipmentSave,
  resolveEquippedForAggregate,
  weaponTypeOf,
  type V2EquipmentId,
  type V2EquipRoll,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  aggregateSpecPassives,
  getSpecById,
  resolveSpecTrait,
  type V2JobSpec,
  type V2SpecPassiveEffect,
} from "@/adventure/data/v2/v2JobSpecs";
import {
  V2_JOB_SYSTEM_V2,
  jobIdFromLegacy,
} from "@/adventure/data/v2/v2JobCatalog";
import { jobPassive } from "@/adventure/data/v2/v2JobPassives";
import { effectiveStats } from "@/adventure/data/v2/v2EquipVariance";
import type { V2Element } from "@/adventure/data/v2/elements";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";

type SavedCharacterV2 = {
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
  // 전문화(스펙) 시스템 — docs/v2-job-spec-passives-plan.md. specChoice = 선택 전문화 id,
  // unlockedPassives = 해금한 전문화 패시브 id들. 둘 다 없으면(현 캐릭) 전문화 효과 없음(inert).
  specChoice?: unknown;
  unlockedPassives?: unknown;
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

// PR-4a 장비 위력/무게 합산 — equipment.v2 슬롯 6개에서 위력을 슬롯별로 분기 누적 +
// 무게 합산 + 옵션(crit/mp/eva/hp) 누적. 장비는 더 이상 6스탯 token 을 안 준다(정체성은
// 훈련 분배). 단위 테스트가 검증할 수 있도록 export.
export type V2EquipAggregate = {
  // 위력 슬롯별 분기 (derive 결과 후-가산)
  atk: number; // Σ 무기 위력 (물리 공격력)
  magicAtk: number; // Σ 무기 위력 (마법 공격력)
  def: number; // Σ 방어구 위력 + Σ 장신구 위력 (물리 방어력)
  magicDef: number; // Σ 장신구 위력 (마법 방어력)
  // 무게 — 속도 페널티 (derive 에서 −weight×계수)
  weight: number;
  // 옵션 — derive 결과 후-가산
  crit: number;
  mp: number;
  eva: number;
  hp: number;
  critMult: number; // 백분의 일 정수 합(100=+1.0×). derive 에서 /100 환산.
  spd: number; // flat 속도 합.
};

const EMPTY_AGGREGATE = (): V2EquipAggregate => ({
  atk: 0,
  magicAtk: 0,
  def: 0,
  magicDef: 0,
  weight: 0,
  crit: 0,
  mp: 0,
  eva: 0,
  hp: 0,
  critMult: 0,
  spd: 0,
});

export function aggregateV2Equipment(
  v2Equipped: Partial<Record<V2EquipSlot, V2EquipmentId>>,
  // PR-편차-9 — id별 개체 굴림. 있으면 카탈로그 대신 굴림값(effectiveStats). 없으면 카탈로그
  // (상점 구매·옛 세이브) → 기존 동작 그대로(비파괴).
  statRolls?: Partial<Record<V2EquipmentId, V2EquipRoll>>,
): V2EquipAggregate {
  const acc = EMPTY_AGGREGATE();
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const id = v2Equipped[slot];
    if (!id) continue;
    const item = V2_EQUIPMENT[id];
    const eff = effectiveStats(item, statRolls?.[id]);
    const power = eff.power;
    // 위력 슬롯별 분기: 무기=물공+마공 / 갑옷·장갑·신발=물방 / 반지·목걸이=마방.
    if (slot === "weapon") {
      acc.atk += power;
      acc.magicAtk += power;
    } else if (slot === "ring" || slot === "necklace") {
      acc.magicDef += power;
    } else {
      // armor / gloves / boots
      acc.def += power;
    }
    acc.weight += eff.weight;
    const o = eff.options ?? {};
    acc.crit += o.crit ?? 0;
    acc.mp += o.mp ?? 0;
    acc.eva += o.eva ?? 0;
    acc.hp += o.hp ?? 0;
    acc.critMult += o.critMult ?? 0;
    acc.spd += o.spd ?? 0;
    acc.def += o.def ?? 0; // 물방 옵션(신설) — 갑옷 위력 def 와 같은 축에 가산.
  }
  // 세트 보너스 — 한 세트의 모든 조각을 장착했으면 옵션 보너스 후-가산(crit/eva/mp/hp).
  const equippedIds = new Set<V2EquipmentId>();
  for (const slot of [
    "weapon",
    "armor",
    "gloves",
    "boots",
    "ring",
    "necklace",
  ] as const) {
    const id = v2Equipped[slot];
    if (id) equippedIds.add(id);
  }
  for (const set of V2_EQUIP_SETS) {
    if (!set.pieces.every((p) => equippedIds.has(p))) continue;
    const b = set.bonus;
    acc.crit += b.crit ?? 0;
    acc.eva += b.eva ?? 0;
    acc.mp += b.mp ?? 0;
    acc.hp += b.hp ?? 0;
    acc.critMult += b.critMult ?? 0;
    acc.spd += b.spd ?? 0;
    acc.def += b.def ?? 0; // 세트 보너스 def(신설).
  }
  return acc;
}

// PR-S1 5배 스케일 다이얼 — 각 계수 = 옛값 / 5.
// 모두 float — 합산은 derive 내부에서 누적 후 최종 floor 한 번만.
const MP_PER_INT = 2; // 옛 10. 5×INT × 2 = 10 MP (동등)
const HP_PER_VIT = 1; // 옛 5.  5×VIT × 1 = 5 HP (동등)

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
const DEF_PER_VIT = 0.1; // 옛 0.5. 5×VIT × 0.1 = 0.5 DEF (동등)
// PR-T3: 0.1 → 0.15 (×1.5 버프). sim-v2-progression 측정에서 LUK 가 Lv75 wr 2%·
// hpL% 80% (crit-only axis 라 atk 부족 + Lv100 도 crit 48% 로 cap 도달 못 함). LUK
// 빌드 정체성 유지하면서 crit 도달 속도를 빠르게. STR/BAL 같이 LUK 부 투자 빌드도
// 소폭 버프 (Lv75 STR 보조 luk 162 → crit 16.2%→24.3%).
const CRIT_PER_LUK = 0.15;
const ATK_PER_STR = 0.15; // PR-무기위력 0.2→0.15 (무기 위력 ~2배 상향 상쇄, sim 캘리브).
// 도적 직군 패시브 "예기" — 공격력에 DEX×계수 가산(도적 한정). 죽은 축 DEX 부활.
// 스킬 재설계(docs/v2-skill-system-plan.md). sim 캘리브 대상.
const ROGUE_ATK_PER_DEX = 0.08;
// PR-2 strict §4 — 물리공격력 = 힘(STR) 단독. dex/spd/luk atk 보조 폐기(Codex 매핑).
// 무기 위력 = 모든 빌드 atk 바닥. DEX/SPD/LUK 데미지는 무기 위력 + 다중공격·크리·스킬로.
// PR-무기위력 재밸런스 — STR 빌드에선 무기가 atk 의 ~20% 뿐이라 무기 교체 체감이 약했고,
// atk 가 거의 무기뿐인 off-STR 빌드(중반 골짜기)도 빈약 → 무기 위력 ~2배 + 이 계수 0.2→0.15.
// 순수 STR/INT 는 정확히 중립(winT 불변), off-STR(DEX/LUK/SPI)·중반 골짜기는 상향(격차 압축).
// sim-v2-progression --skills + sim-v2-pvp-weapon 검증: 천장 빌드 불변, 신규 지배자 없음.

// 속도 = 민첩 파생 (1차 아님). 옛 base spd 30 ≈ dex 15 × 2.0.
const SPD_PER_DEX = 2.0;
// 무게 → 속도 페널티 (선형). 무게 1 = 속도 −WEIGHT_SPD_PENALTY.
// 1.0→2.0 (2026-06-08): 전 장비 위력 ×2 됐는데 무게는 그대로라 "무게당 위력"이 2배 = 무거운
//   장비의 속도 대가가 상대적으로 절반으로 약해짐. 페널티 2.0 으로 ×2 위력에 맞춰 트레이드오프 복원.
//   풀 중갑 무게~20 → −40 spd = −20% 추가공격(전 −10%). 속도는 DEX·신발·spd옵션으로 보전 가능.
//   weight 값 자체는 불변(per-item churn 회피) — 단일 다이얼. sim-v2-progression 으로 탱커 비파괴 확인.
const WEIGHT_SPD_PENALTY = 2.0;
// 최소 데미지(데미지 하한) — 힘·지능 major, 활력 minor.
const MIN_DMG_PER_STR = 0.1;
const MIN_DMG_PER_INT = 0.05;
const MIN_DMG_PER_VIT = 0.03;
// 명중 — 힘·지능·정신 minor (민첩은 ACCURACY_PCT_PER_DEX). 회피 — 행운 minor (민첩은 EVA_PER_DEX).
//   지능(ACC_PER_INT)=마법사 명중 바닥: 명중 기여 스탯이 없던 순수 INT 빌드가 회피·기본미스를
//   홀로 떠안던 문제 해소(STR 과 대칭). 마법도 빗나가지 않게.
const ACC_PER_STR = 0.02;
const ACC_PER_INT = 0.02; // 마법사 명중 바닥(STR 대칭).
const ACC_PER_SPI = 0.015;
const EVA_PER_LUK = 0.08;
// 치명타 피해 — 힘 minor (행운은 CRIT_DMG_PER_LUK major).
const CRIT_DMG_PER_STR = 0.002;
// 마법 방어력 — 정신 major + 지능 minor. 마법 데미지 경감.
const MAGIC_DEF_PER_SPI = 0.12;
const MAGIC_DEF_PER_INT = 0.03;
// 치명타 저항 — 정신. 피격 시 상대 치명 확률 차감(%p).
const CRIT_RESIST_PER_SPI = 0.1;
// 회복량 배수 — 활력·정신 (1.0 기준 + 비례).
const HEAL_MULT_PER_VIT = 0.004;
const HEAL_MULT_PER_SPI = 0.0025;
// PR-luk-critdmg — LUK → 크리 데미지 배수. v2 는 그동안 luk 를 크리 확률(CRIT_PER_LUK)에만
// 쓰고 크리 데미지는 CRIT_MULT_BASE(2.0×) 고정이었다. 그래서 LUK 빌드는 atk 가 낮아(luk×0.04)
// 크리가 터져도 약했다(sim: 전 빌드 중 최약). luk 가 크리 데미지도 키우게 해 '크리 빌드'
// 정체성에 투자 비례 보상. 크리율 낮은 STR/BAL 등은 크리 발동이 드물어 영향 미미(타겟팅).
// sim-v2-progression --skills 캘리브 0.006: LUK Lv75 67→75%·Lv100 85→89%(DEX/BAL 동률,
// 파크 진입), winT 대폭↓(킬 속도 개선). Lv50 은 크리율 29% 로 낮아 보너스 발동이 적어 67%
// 유지(DEX 동률 — 크리/피네스 빌드의 중반 변동성, LUK 단독 문제 아님).
// 0.006→0.007 상향(2026-06-08): CRIT_MULT_BASE 2.0→1.4 동반 하향의 LUK 보전 — 바닥(무투자
//   크리)은 내리고 LUK 투자분은 per-luk 로 되살려 "크리 데미지=LUK 투자 보상"으로. 고럭 엔드빌드는
//   cap(5.0) 바인딩이라 거의 불변, 무/저투자 크리만 약화(스윙·원샷 완화). sim 재검증=LUK 비최약.
const CRIT_DMG_PER_LUK = 0.007;
// 크리 데미지 배수 안전 상한 — 현재 Lv100 LUK(luk~349)는 4.09× 라 미바인딩이지만, 미래
// 장비/스탯 인플레가 무한정 키우지 않게 cap. luk 500 에서 바인딩(현 만렙 도달 불가).
const CRIT_MULT_CAP = 5.0;
// PR-magic — 마법 공격력(magicAtk = INT 환산 + 무기 위력). scaling="magic" 스킬만 이 값으로
// 스케일(combatShared.v2DamageAmount). INT 0 빌드는 magicAtk 0(+무기 위력) → 마법 경로 비활성.
// PR-8 캘리브 — 0.35 → **0.2 (= ATK_PER_STR 대칭)**. PR-4a 에서 무기 위력이 magicAtk 에 합산되며
// "무기+지능" 데미지가 물리 "무기+힘"을 압도(sim --skills: INT winT 2.8~3.7 로 STR 7~9 의 2~3배)
// → 문서 §8 의도대로 지능 단독계수를 힘과 대칭으로 낮춤. 재측정: INT winT Lv50 4.8·Lv75 6.5·
// Lv100 6.6 으로 STR(7~9)과 동률대, wr 도 STR 동률(Lv75 89%). 마법 버스트 정체성은 스킬 coef
// 프리미엄(메테오 2.8 등)으로 유지. 알려진 공백: Lv18 전 마법 공격 스킬 부재(상수 무관, 후속).
const MAGIC_ATK_PER_INT = 0.15; // PR-무기위력 0.2→0.15 (ATK_PER_STR 대칭 유지 + 지팡이 위력 상향 상쇄).
const EVA_PER_DEX = 0.1; // 옛 0.5. 5×DEX × 0.1 = 0.5% (동등)
const ACCURACY_PCT_PER_DEX = 0.05; // 옛 0.25. 5×DEX × 0.05 = 0.25%p (동등)
// 명중 상한 — 명중이 스탯(STR·INT·SPI·DEX) 비례라 후반엔 수백까지 치솟아 몬스터 회피를
//   무조건 상쇄했다(회피축 무력화). cap 으로 제한 → 명중을 cap 까지 채우면 회피를 상쇄,
//   덜 채운/저명중 빌드는 회피만큼 빗나감 → 회피가 유효한 축이 된다. sim 캘리브 대상.
const ACCURACY_PCT_CAP = 35;
// 궁사 활 패시브 — 적중 임계(=base miss 10, 명중 이만큼이면 0-회피 적중 100%) 초과 명중을 공격력
//   으로 변환. 활 한정. cap(35)은 hit 에만 적용 — 궁사는 명중 특화라 명중을 hit+딜 양쪽으로 활용
//   (의도된 이중 활용; 다른 빌드는 hit 한 번만). coef·임계는 sim 캘리브 대상.
const BOW_HIT_THRESHOLD = 10;
const BOW_ACCURACY_TO_ATK_COEF = 3;

// v2 SPD → 다중공격. SPD 1 당 +0.5%p 추가공격 확률 (옛 2 — 전 빌드 타수 과다로 0.5 하향).
// SPD = DEX×2 라 추가확률 = DEX×1 %p. DEX 100 → 100%(확정 +1타) · DEX 200 → 200%(확정 +2타).
// 다중공격을 DEX 특화 빌드의 강점으로 — 일반 빌드(DEX 15~60)는 1~1.6타.
// rollAttackCount(combatShared) 가 100%↑를 정수부 확정 + 소수부 확률로 처리. cap 없음.
const EXTRA_ATTACK_PCT_PER_SPD = 0.5;

// 초반 난이도 완화 — 4대 전투 스탯(공격력·마법공격력·방어력·마법방어력)에 더하는 플랫 보너스.
// 스탯이 작은 초반엔 비중이 커 체감 큰 완화, 후반엔 미미(Lv100 atk~75 대비 +5). 플레이어·아레나
// 봇 모두 같은 derive 를 거치므로 PvP 중립. 난이도 재튜닝은 이 한 숫자만 조정한다.
export const V2_BASE_COMBAT_BONUS = 5;

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
  /** 선택 전문화(스펙). 미지정 = 전문화 효과 없음(inert). docs/v2-job-spec-passives-plan.md. */
  spec?: V2JobSpec;
  /** 해금한 전문화 패시브 id들. spec 과 함께. 무기 게이트 통과 + 해금된 것만 적용. */
  unlockedPassives?: readonly string[];
  /**
   * 직업 시스템 v2(V2_JOB_SYSTEM_V2) 직업 보너스 — 전직 직업의 플랫 스탯 보너스(카탈로그).
   * totalStats 에 가산 → 모든 파생 스탯에 자연 반영. 미지정 = 무가산(flag off / sim 호환).
   * docs/v2-skill-job-redesign.md §3. 옛 계파 % 트레이트를 대체(래퍼가 flag on 일 때 spec 을
   * inert 로 두고 이 값을 주입 — 더블딥 방지).
   */
  jobBonus?: Partial<Record<V2StatKey, number>>;
  /**
   * 직업 시스템 v2 직업 효과 패시브(받피감·spd 등 V2SpecPassiveEffect). 지정 시 옛 계파
   * specEff 대신 이 값을 적용(래퍼가 flag on 일 때 주입). 미지정 = 옛 aggregateSpecPassives.
   */
  jobPassiveEffect?: V2SpecPassiveEffect;
  /**
   * 예기(민첩→공격력) 계수 — 장착 패시브 스킬에서 주입(flag on). 지정 시 도적 직군 하드코딩
   * 베이스라인 대신 이 값 사용(0 = 미장착). 미지정 = 도적 베이스라인 폴백(flag off / sim).
   */
  atkPerDexCoef?: number;
};

export function derivePlayerCombatV2Pure(
  input: DerivePlayerCombatV2PureInput,
): DerivedPlayerCombatV2 {
  const level = Math.max(1, input.level ?? 1);
  const v2Equipped = input.v2Equipped ?? {};
  const equipAcc = aggregateV2Equipment(v2Equipped, input.v2StatRolls);

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

  // PR-S1 5배 스케일 — float 누적 후 atk/def/maxHp/maxMp 만 최종 floor.
  // crit/eva/acc/extraAtk 는 float 그대로 (엔진이 확률 비교만, 0.1%p 단위 보존).
  // PR-T2: atk 에 DEX/SPD 보조 ×0.04 추가 (옛 라이브 dex/5+spd/5 의 ×5 환산).
  // PR-T3: LUK 보조도 같은 패턴으로 추가. crit-only axis 였으나 wr 부족.
  // strict §4 — 물리공격력 = 힘 단독 + 장비 atk(무기 위력). dex/spd/luk atk 보조 없음.
  // 4대 전투 스탯엔 초반 완화용 플랫 보너스(V2_BASE_COMBAT_BONUS)를 가산.
  // 예기 — DEX 보조 공격력. flag-on(직업 킷)은 장착 패시브 스킬 예기에서 계수 주입
  //   (atkPerDexCoef, 미장착=0). flag-off/sim 은 도적 직군 하드코딩 베이스라인 폴백.
  const atkPerDexCoef =
    input.atkPerDexCoef ?? (playerClass === "rogue" ? ROGUE_ATK_PER_DEX : 0);
  const atk =
    Math.floor(
      totalStats.str * ATK_PER_STR +
        totalStats.dex * atkPerDexCoef +
        equipAcc.atk,
    ) + V2_BASE_COMBAT_BONUS;
  // 물리 방어력 — 활력 + 장비 def.
  const def =
    Math.floor(totalStats.vit * DEF_PER_VIT + equipAcc.def) +
    V2_BASE_COMBAT_BONUS;
  // 마법 공격력 — 지능 + 무기 위력(magicAtk). +기본 보너스(마법 빌드 0 빌드도 베이스 확보).
  const magicAtk =
    Math.floor(totalStats.int * MAGIC_ATK_PER_INT) +
    equipAcc.magicAtk +
    V2_BASE_COMBAT_BONUS;
  // 마법 방어력(신규) — 정신 major + 지능 minor + 장신구 위력. combatShared 가 마법 데미지에서 차감.
  const magicDef =
    Math.floor(
      totalStats.spi * MAGIC_DEF_PER_SPI +
        totalStats.int * MAGIC_DEF_PER_INT +
        equipAcc.magicDef,
    ) + V2_BASE_COMBAT_BONUS;
  // 최소 데미지(신규) — 힘·지능 major + 활력 minor. 데미지 하한.
  const minDamage = Math.floor(
    totalStats.str * MIN_DMG_PER_STR +
      totalStats.int * MIN_DMG_PER_INT +
      totalStats.vit * MIN_DMG_PER_VIT,
  );
  // 회복량 배수(신규) — 활력·정신. heal effect 스케일(1.0 기준).
  const healMult =
    1 +
    totalStats.vit * HEAL_MULT_PER_VIT +
    totalStats.spi * HEAL_MULT_PER_SPI;
  // 코어루프 모험가 HP 패시브 — flag on + 무직(=모험가)일 때만 ×1.1. flag off = ×1.0(무변경).
  const maxHp = Math.floor(
    (V2_BASE_HP +
      Math.max(0, level - 1) * V2_HP_PER_LEVEL +
      totalStats.vit * HP_PER_VIT +
      equipAcc.hp) *
      coreLoopMaxHpMult(playerClass, V2_CORE_LOOP_V2),
  );
  const maxMp = Math.floor(
    V2_BASE_MP +
      Math.max(0, level - 1) * V2_MP_PER_LEVEL +
      totalStats.int * MP_PER_INT +
      equipAcc.mp,
  );
  const critChancePct = totalStats.luk * CRIT_PER_LUK + equipAcc.crit;
  // 치명타 피해 — 행운 major + 힘 minor.
  const critMult = Math.min(
    CRIT_MULT_BASE +
      totalStats.luk * CRIT_DMG_PER_LUK +
      totalStats.str * CRIT_DMG_PER_STR +
      equipAcc.critMult / 100, // 반지 슬롯 고유 축(백분의 일 정수 → 배수).
    CRIT_MULT_CAP,
  );
  // 치명타 저항(신규) — 정신. 피격 시 상대 치명 확률 차감(%p).
  const critResistPct = totalStats.spi * CRIT_RESIST_PER_SPI;
  // 회피 — 민첩 + 행운 minor + 장비.
  const evasionPct = Math.min(
    totalStats.dex * EVA_PER_DEX +
      totalStats.luk * EVA_PER_LUK +
      equipAcc.eva,
    EVASION_PCT_CAP,
  );
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

  // 직업 패시브 (시그니처 대체) — 현 직업군에서 학습한 시그니처 최고티어의 상시 효과.
  // 2026-06-03 재설계: 직업군당 효과 1개. 검사=atk+STR계수·마법사=magicAtk+INT계수는 여기서,
  // 궁수 방어관통·체술 카운터·마법사 평타마공화는 PlayerCombat 필드로 넘겨 엔진이 적용.
  const passive = resolveClassPassive(
    input.playerClass,
    input.learnedSkillIds ?? [],
  );
  // 검사 — 평타 공격력에 STR×계수 가산. 마법사 — 마법공격력에 INT×계수 가산.
  const finalAtk =
    atk + Math.floor(totalStats.str * (passive?.atkPerStrCoef ?? 0));
  const finalMagicAtk =
    magicAtk + Math.floor(totalStats.int * (passive?.magicAtkPerIntCoef ?? 0));
  // 인술 — 치명타 피해 배율 가산 (cap). 명중·추가타는 패시브 미기여(평값 그대로).
  const finalCritMult = Math.min(
    critMult + (passive?.critMultAdd ?? 0),
    CRIT_MULT_CAP,
  );

  // ── 전문화(스펙) 패시브 (docs/v2-job-spec-passives-plan.md §3·§6 — P3c flip) ───
  // 선택 전문화 + 해금 패시브 + 장착 무기 종류 → 합산 효과. 무기 게이트 불통과/spec 미지정 = {}.
  // 현 캐릭(specChoice 없음) = {} → 전부 항등(byte-identical inert). 활성은 save 에
  // specChoice/unlockedPassives 가 있을 때만(래퍼가 주입).
  // 전문화 픽은 차수와 무관하게 전부 유지 — 환생(차수→1, 같은 직업) 후에도 이미 해금한 전문화
  //   패시브가 비활성화되지 않게(2026-06-09 사용자 결정: "같은 직업 환생인데 전문화 초기화 막기").
  //   정상 진행 중엔 해금 수가 차수−1 이하라(spec route 가 cap) 무영향 — 환생 후 보존 픽에서만 차이.
  //   직업 변경 시엔 위에서 spec(직업 종속)이 undefined 라 어차피 무효 → stale 픽이 새지 않는다.
  const activePicks = input.unlockedPassives ?? [];
  // 직업 시스템 v2 — jobPassiveEffect 주입 시 옛 계파 specEff 대신 직업 효과 패시브 적용.
  //   (flag on 래퍼가 주입. 미지정 = 옛 aggregateSpecPassives, flag off 바이트 동일.)
  const specEff =
    input.jobPassiveEffect ??
    aggregateSpecPassives(
      input.spec,
      activePicks,
      weaponTypeOf(v2Equipped.weapon),
    );
  // 직업 특성 — 전문화별 자동 부여, 차수(classTier) 성장. 무기 게이트 무관. 전문화 시그니처와
  // 같은 방향으로 합산되어 정체성 강화. spec 없음·1차면 {} (inert). 수치 가안(P6).
  const traitEff = resolveSpecTrait(input.spec, input.classTier);
  // 합산(없거나 0 = undefined 유지 → 미보유 시 객체 모양 불변).
  const sumOrUndef = (a: number | undefined, b: number | undefined) => {
    const t = (a ?? 0) + (b ?? 0);
    return t > 0 ? t : undefined;
  };
  // 물공%·속도% = 곱(0이면 곱/floor 미적용 — inert 보장). 명중%·크리뎀·추가타 = 가산(+0 항등).
  // 직업 특성(광기 atk%·원소통달 magicAtk%)은 전문화 %와 가산 후 한 번에 곱.
  const totalAtkPct = (specEff.atkPctAdd ?? 0) + (traitEff.atkPctAdd ?? 0);
  let specAtk = totalAtkPct
    ? Math.floor(finalAtk * (1 + totalAtkPct / 100))
    : finalAtk;
  const totalMagicAtkPct =
    (specEff.magicAtkPctAdd ?? 0) + (traitEff.magicAtkPctAdd ?? 0);
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

  // 명중 — 상한 적용 전 raw(스탯+전문화). 궁사 활 패시브는 이 raw 의 적중 임계 초과분을 공격력으로.
  const rawAccuracyPct = accuracyPct + (specEff.accuracyPctAdd ?? 0);
  if (weaponTypeOf(v2Equipped.weapon) === "bow") {
    const excessAccuracy = Math.max(0, rawAccuracyPct - BOW_HIT_THRESHOLD);
    specAtk += Math.floor(excessAccuracy * BOW_ACCURACY_TO_ATK_COEF);
  }
  // hit 에 쓰는 명중은 cap 으로 클램프(궁사의 잉여 딜 환원은 위 raw 기준이라 영향 없음).
  const finalAccuracyPct = Math.min(ACCURACY_PCT_CAP, rawAccuracyPct);

  // 직업 특성 — 전문화 시그니처와 같은 훅을 공유하는 효과는 합산(강철↔받피감, 출혈숙련↔출혈,
  // 흡정↔흡정공). 0 이면 spread 생략(inert). 절제(mpCostReductionPct)는 신규 시전 훅.
  const totalDamageTakenReductionPct =
    (specEff.damageTakenReductionPct ?? 0) +
    (traitEff.damageTakenReductionPctAdd ?? 0);
  const totalBleedDmgPerStack =
    (specEff.bleedDmgPerStack ?? 0) + (traitEff.bleedDmgPerStackAdd ?? 0);
  const totalPoisonStrength =
    (specEff.poisonPctPerStackBase ?? 0) + (traitEff.poisonPctPerStackAdd ?? 0);
  const totalLifestealPct =
    (specEff.lifestealPct ?? 0) + (traitEff.lifestealPctAdd ?? 0);
  const mpCostReductionPct = traitEff.mpCostReductionPctAdd ?? 0;

  const player: PlayerCombat = {
    hp,
    maxHp,
    mp,
    maxMp,
    intStat: totalStats.int,
    // 스킬 스케일/차수용 — 나한권(vit 비례 딜)·전문화 스킬 차수 flat(baseFlatByTier).
    vitStat: totalStats.vit,
    classTier: input.classTier,
    atk: specAtk,
    magicAtk: specMagicAtk,
    def: specDef,
    spd: specSpd,
    evasionPct: evasionPct + (traitEff.evasionPctAdd ?? 0), // + 유연
    accuracyPct: finalAccuracyPct,
    attackCount: 1,
    extraAttackChancePct:
      extraAttackChancePct +
      (specEff.extraAttackChancePct ?? 0) +
      (traitEff.extraAttackChancePctAdd ?? 0), // + 연계
    critChancePct:
      critChancePct +
      (specEff.critChancePctAdd ?? 0) + // 급습
      (traitEff.critChancePctAdd ?? 0), // + 정밀
    critMult: Math.min(
      finalCritMult + (specEff.critMultAdd ?? 0) + (traitEff.critMultAdd ?? 0), // + 암살
      CRIT_MULT_CAP,
    ),
    // PR-2 신규 v2 축 — PlayerCombat 옵셔널 필드 (라이브 미사용, combatShared/engine v2 경로만).
    magicDef,
    critResistPct,
    minDamage,
    healMult,
    // 직업 패시브 — 엔진이 읽어 적용. 미보유면 undefined(no-op). 전문화 효과는 합산(sumOrUndef).
    passiveTurnHealPctMaxHp: sumOrUndef(
      passive?.turnHealPctMaxHp,
      (specEff.hpRegenPctPerTurn ?? 0) + (traitEff.turnHealPctMaxHpAdd ?? 0),
    ), // 사제 신성회복 + 신성 특성(기존 턴회복 훅 재사용)
    passiveDefPenetrationPct: sumOrUndef(
      passive?.defPenetrationPct,
      specEff.defPenetrationPct,
    ), // 궁수 + 광검류
    passiveCounterChancePct: sumOrUndef(
      passive?.counterChancePct,
      specEff.counterChancePct,
    ), // 무도가 + 철벽검류
    // 마력구(마법사 직군 패시브) — 평타를 마법공격력 기반으로. 모든 마법사 상시(무료 패시브).
    passiveMagicBasicAttack:
      playerClass === "mage" ? true : passive?.magicBasicAttack,
    // 전문화 신규 효과 — 미보유 시 키 생략(spread)으로 inert. 받피감(P3b 훅)·반사(thornsPct)·출혈/중독.
    // 받피감=방패숙련/가호 + 강철 특성, 출혈=유혈/내상 + 출혈숙련, 중독=독사 맹독.
    ...(totalDamageTakenReductionPct > 0
      ? { passiveDamageTakenReductionPct: totalDamageTakenReductionPct }
      : {}),
    ...(specEff.reflectPct ? { thornsPct: specEff.reflectPct } : {}),
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
    // 절제(워메이지 특성) — 스킬 마나 소모 -%. 엔진 시전부가 v2SkillMpCost 에 곱연산.
    ...(mpCostReductionPct > 0
      ? { mpCostReductionPct: mpCostReductionPct }
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
    ...(specEff.poisonedEnemyDefReductionPct
      ? { poisonedEnemyDefReductionPct: specEff.poisonedEnemyDefReductionPct }
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
    ...(specEff.comboFinisherBonusPct
      ? { comboFinisherBonusPct: specEff.comboFinisherBonusPct }
      : {}),
    // 주문 중첩 — 엔진이 스킬 시전 누적당 스킬 데미지 가산.
    ...(specEff.skillDmgPctPerCast
      ? { skillDmgPctPerCast: specEff.skillDmgPctPerCast }
      : {}),
    // 약점 노출 — 엔진이 스킬 적중 시 적 마법취약 스택 누적(받는 마법피해 +%).
    ...(specEff.enemyMagicVulnPctPerStack
      ? { enemyMagicVulnPctPerStack: specEff.enemyMagicVulnPctPerStack }
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

  // 전문화(스펙) — save 의 specChoice/unlockedPassives 방어 파싱. 없으면 undefined → inert.
  const specId =
    typeof character.specChoice === "string" ? character.specChoice : undefined;
  const specCandidate = specId ? getSpecById(specId) : undefined;
  // 전문화는 직업 종속 — 현 직업의 전문화가 아니면 무시(직업 변경 후 stale specChoice 누수 방지, 방어).
  const legacySpec =
    specCandidate && specCandidate.job === parsedClass
      ? specCandidate
      : undefined;
  const legacyUnlockedPassives = Array.isArray(character.unlockedPassives)
    ? character.unlockedPassives.filter(
        (x): x is string => typeof x === "string",
      )
    : [];

  // 직업 시스템 v2(flag on) — 직업 보너스(플랫 스탯) 주입 + 옛 계파 % 트레이트를 inert 로
  //   대체(더블딥 방지). 현재 직업 = jobIdFromLegacy(class, specChoice) → 카탈로그 jobBonus.
  //   flag off = jobBonus 없음 + 계파 효과 그대로(byte-identical). 모험가(none)=jobBonus {} (HP%는 별도).
  const v2JobId = V2_JOB_SYSTEM_V2
    ? jobIdFromLegacy(parsedClass, specId ?? null)
    : null;
  // 직업 킷 재설계 — flag on 패시브는 "장착 패시브 스킬"에서. 근력/강건/총명(스탯) + 예기
  //   (atkPerDexCoef). jobBonus 자동 적용 폐지(슬롯해야 효과). flag off = undefined(미적용).
  const equippedSkillIds = parseV2SkillsState(skillsRaw).equipped;
  const passiveAgg = V2_JOB_SYSTEM_V2
    ? aggregateEquippedPassives(equippedSkillIds)
    : null;
  const jobBonus = passiveAgg?.stat;
  const atkPerDexCoef = passiveAgg?.atkPerDexCoef;
  // 직업 효과 패시브(받피감·spd 등) — flag on 일 때 옛 계파 specEff 대신 주입.
  const jobPassiveEffect = v2JobId ? jobPassive(v2JobId) : undefined;
  const spec = V2_JOB_SYSTEM_V2 ? undefined : legacySpec;
  const unlockedPassives = V2_JOB_SYSTEM_V2 ? [] : legacyUnlockedPassives;

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
    spec,
    unlockedPassives,
    jobBonus,
    jobPassiveEffect,
    atkPerDexCoef,
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
