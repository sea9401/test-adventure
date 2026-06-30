// 두 전투 엔진(engine.ts = PvE, engine-pvp.ts = PvP)이 공유하는 순수 헬퍼.
//
// 두 엔진은 데이터 모델이 다르다 — PvE 는 비대칭(player vs enemy), PvP 는 대칭(side vs side).
// 그래서 턴 상태머신·데미지 계산은 각자 갖되, 모델과 무관한 순수 계산은 여기 한 곳에 둔다.
// 한쪽만 고쳐 둘이 어긋나는 divergence(예: 추가공격 롤이 PvP 에서만 +1 로 막혀 있던 버그)를 막기 위함.
//
// PlayerCombat 은 engine.ts 에서 정의 — type-only import 라 런타임 순환참조 없음(타입은 소거).

import { computeHealAmount, type Potion } from "@/adventure/data/potions";
import type { APSkillEffect } from "@/adventure/character/apSkills";
import {
  V2_SKILLS,
  v2SkillMpCostValue,
  type V2SkillDefinition,
  type V2SkillId,
  type V2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  elementDamageMult,
  V2_ELEMENT_LABEL,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  BLEED_ATK_COEF_PER_STACK,
  BLEED_MAX_STACKS,
  POISON_CAP_ATK_COEF,
  POISON_MAX_STACKS,
} from "@/adventure/data/v2/v2CombatConstants";
import type { StatKey } from "@/adventure/data/stats";
import type { PlayerCombat } from "./engine";
import {
  evaluateCombatPatternCandidates,
  V2_PATTERN_DOT_POWER_MULT,
  V2_PATTERN_SKILL_POWER_MULT_BY_TIER,
  type V2CombatPattern,
  type V2CombatRole,
  type V2PatternCtx,
} from "./combatPattern";

// 기본 명중 상수는 v2CombatConstants 로 이관(UI StatsPanel 이 무거운 combatShared 를 끌어오지
// 않고 가벼운 상수 파일에서 읽도록). 두 엔진은 여전히 combatShared 에서 import 하므로 재노출.
export { V2_BASE_MISS_PCT } from "@/adventure/data/v2/v2CombatConstants";

export const AP_SKILLS_PER_TURN_CAP = 3;

// 시한부 버프/디버프 턴 카운터 — 매 플레이어 턴 진입 시 8개 TurnsLeft 필드 일괄 -1(0 하한).
// PvE BattleBuffs / PvP PvPSideBuffs 공용(두 타입의 해당 필드 동형) — 단일 소스.
type TimedBuffTurns = {
  playerDmgReductionTurnsLeft: number;
  playerAtkBuffTurnsLeft: number;
  playerDefDebuffTurnsLeft: number;
  playerSpdTurnsLeft: number;
  enemyDefDebuffTurnsLeft: number;
  enemySpdTurnsLeft: number;
  enemySilenceTurnsLeft: number;
  playerLifestealTurnsLeft: number;
};
export function decrementTimedBuffs<T extends TimedBuffTurns>(buffs: T): T {
  return {
    ...buffs,
    playerDmgReductionTurnsLeft: Math.max(0, buffs.playerDmgReductionTurnsLeft - 1),
    playerAtkBuffTurnsLeft: Math.max(0, buffs.playerAtkBuffTurnsLeft - 1),
    playerDefDebuffTurnsLeft: Math.max(0, buffs.playerDefDebuffTurnsLeft - 1),
    playerSpdTurnsLeft: Math.max(0, buffs.playerSpdTurnsLeft - 1),
    enemyDefDebuffTurnsLeft: Math.max(0, buffs.enemyDefDebuffTurnsLeft - 1),
    enemySpdTurnsLeft: Math.max(0, buffs.enemySpdTurnsLeft - 1),
    enemySilenceTurnsLeft: Math.max(0, buffs.enemySilenceTurnsLeft - 1),
    playerLifestealTurnsLeft: Math.max(0, buffs.playerLifestealTurnsLeft - 1),
  };
}

export function isOffensiveApEffect(effect: APSkillEffect): boolean {
  return (
    effect.kind === "atk_multiplier" ||
    effect.kind === "multi_hit_self_damage" ||
    effect.kind === "atk_multiplier_with_silence" ||
    effect.kind === "atk_plus_spd_pct_bonus"
  );
}


// AP 스킬 effect → 공격 배수/방어무시/회피무시/타격수. atk_multiplier 계열(광살참
// multi_hit_self_damage·천뢰 일격 atk_multiplier_with_silence 포함)이 atkMult/ignoresDef/
// ignoresEvasion 를 공유한다. 두 엔진(PvE/PvP)이 토씨까지 같던 블록을 한 곳으로 — 한쪽만
// 고쳐 어긋나는 divergence 방지. 동작은 옛 인라인 조건과 동일.
export function extractApEffect(effect: APSkillEffect | undefined): {
  atkMult: number;
  ignoresDef: boolean;
  ignoresEvasion: boolean;
  hits: number;
} {
  if (
    effect?.kind === "atk_multiplier" ||
    effect?.kind === "multi_hit_self_damage" ||
    effect?.kind === "atk_multiplier_with_silence"
  ) {
    return {
      atkMult: effect.atkMult,
      ignoresDef: effect.ignoresDef === true,
      ignoresEvasion: effect.ignoresEvasion === true,
      hits: effect.kind === "multi_hit_self_damage" ? effect.hits : 1,
    };
  }
  return { atkMult: 1, ignoresDef: false, ignoresEvasion: false, hits: 1 };
}

// 공격 횟수 롤 — base(attackCount) + 추가타. 추가공격 확률은 100% 초과 가능:
// 정수부는 보장 추가타, 나머지(%)는 확률. (예: 150% → +1 보장 + 50% 확률로 +1 더.)
export function rollAttackCount(player: PlayerCombat): number {
  const base = Math.max(1, player.attackCount);
  const luckBonus = player.universalLuckBonusPct ?? 0;
  const chance = (player.extraAttackChancePct ?? 0) + luckBonus;
  if (chance <= 0) return base;
  const guaranteed = Math.floor(chance / 100);
  const remainder = chance - guaranteed * 100;
  const extra = guaranteed + (Math.random() * 100 < remainder ? 1 : 0);
  return base + extra;
}

// 평타 데미지 하한 비율 — 평타는 def 가 atk 를 초과해도 atk 의 이 비율은 보장(0 딜 방지).
//   v2DamageAmount(스킬)의 minDamage 하한과는 별개 — 평타 전용 바닥이다.
export const DAMAGE_FLOOR_FRACTION = 0.15;

// 평타 1타 데미지 = max(1, ceil(atk×하한비율), atk−def). 엔진 평타·패턴 "평타 바닥" 모델 공유.
//   (구 engine.ts 정의를 여기로 이전 — combatShared 가 더 하위 레이어라 engine 이 재노출.)
//   ⚠️ 플레이어→적(공격) 전용. 적→플레이어(피격)는 damageToDefender(비대칭 비율감산).
export function damageBetween(atk: number, def: number): number {
  const minByAtk = Math.ceil(Math.max(0, atk) * DAMAGE_FLOOR_FRACTION);
  return Math.max(1, minByAtk, atk - def);
}

// 비대칭 방어 비율감산(DEX 독주 재설계 — docs/v2-dex-dominance-plan §0-C) — **적→플레이어 피격 전용**.
//   경감률 = K·def/(atk + K·def). 엔드(적atk≫def)서도 def 가 %경감 유지 → VIT/SPI 방어축 부활.
//   🔑 비대칭인 이유: 대칭(damageBetween 양쪽)이면 K↑가 적 def 로 플레이어 공격도 깎아 저공격 빌드를
//   floor 로 밀어 백파이어(실측 #922 §0-B). 그래서 **피격(생존)에만** 적용, 플레이어 공격은 불변.
//   def=0 이면 atk 그대로(무방어 적 무관). 15% floor 유지 = 최대 경감 85%(무적 탱 방지).
export const DEF_MITIGATION_K = 3; // sim 보정 다이얼
export function damageToDefender(atk: number, def: number): number {
  const a = Math.max(0, atk);
  const d = Math.max(0, def);
  const minByAtk = Math.ceil(a * DAMAGE_FLOOR_FRACTION);
  // 분모 가드 — a=0(적 atk 완전 디버프) & d=0 이면 0/0=NaN → Math.max 가 NaN 전파(Codex). 0 으로.
  const denom = a + DEF_MITIGATION_K * d;
  const mitigated = denom > 0 ? Math.round((a * a) / denom) : 0;
  return Math.max(1, minByAtk, mitigated);
}

// 포션 회복량(정수, 현재 HP 클램프 전). computeHealAmount 에 potionHealPct(연단의 룬 등) 가산.
// HP 클램프·상태 반영·로그는 상태 모델이 다른 각 엔진이 직접 처리한다.
export function potionHealAmount(
  potion: Potion,
  maxHp: number,
  potionHealPct: number,
): number {
  const baseHeal = computeHealAmount(potion, maxHp);
  return Math.floor(baseHeal * (1 + (potionHealPct ?? 0) / 100));
}

// ── v2 DoT ────────────────────────────────────────────────────────────────
// 지속 피해 (출혈/중독/연소). 모든 출처는 tag 별 V2Dot entry 로 target 에 박힌다.
// 매 target 의 turn 진입 시 tick — entry 별 스택 피해 합산 후 turns -= 1, turns <= 0 drop.
// DEF 무시. 같은 tag 는 스택 누적 + turns refresh + 데미지 파라미터 최신값으로 덮어쓰기.
export type V2DotTag = "bleed" | "poison" | "burn";
export type V2Dot = {
  tag: V2DotTag;
  label: string;
  stacks: number;
  maxStacks: number;
  turns: number;
  flatPerStack: number;
  atkCoefPerStack: number;
  pctMaxHpPerStack: number;
  sourceAtk: number;
};
export type V2DotList = readonly V2Dot[];

// 모든 v2 DoT 의 1틱 피해 = floor(스택 수 × 스택당 피해) (음수 클램프). 갈래 A(리스트 dot,
// stacks=1)와 갈래 B(출혈·독공 스택 풀)가 공유하는 단일 공식. 스택당 피해의 구성(정액 vs
// 정액+독공%HP)은 출처별로 다르며 호출부에서 합성한다.
//   floor — 평타 데미지(v2DamageAmount)와 동일하게 정수로 떨어뜨린다. ATK 계수(0.08)·%최대HP
//   비례라 곱이 소수로 나오는데, 그대로 HP·로그에 들어가면 "출혈 12.84 피해"처럼 지저분해진다.
//   곱을 floor(스택당이 아니라) — 원시값에 가장 충실(예 3×8.96=26.88 → 26).
export function dotTickDamage(stacks: number, perStack: number): number {
  return Math.max(0, Math.floor(stacks * perStack));
}

export function v2DotPerStackDamage(dot: V2Dot, targetMaxHp: number): number {
  const hpComponent =
    dot.pctMaxHpPerStack > 0
      ? Math.min(
          targetMaxHp * dot.pctMaxHpPerStack,
          dot.sourceAtk * POISON_CAP_ATK_COEF,
        )
      : 0;
  return dot.flatPerStack + dot.sourceAtk * dot.atkCoefPerStack + hpComponent;
}

// tick: dot 들 turns -1 + 총 dmg 합산. turns 0 도달 dot drop.
// turns +0 시드 정책 — applyV2DotsToTarget 가 그대로 박음 (cd/buff 의 +1 시드와 다름).
// 이유: dot 은 tick 시점에 즉시 dmg 적용 + turns-1. buff 는 tick 후 turns > 0 이어야 active.
export function tickV2Dots(
  dots: V2DotList,
  targetMaxHp = 0,
): { nextDots: V2Dot[]; totalDmg: number } {
  const nextDots: V2Dot[] = [];
  let totalDmg = 0;
  for (const d of dots) {
    if (d.turns <= 0) continue;
    totalDmg += dotTickDamage(d.stacks, v2DotPerStackDamage(d, targetMaxHp));
    if (d.turns > 1) nextDots.push({ ...d, turns: d.turns - 1 });
    // turns === 1 → drop (이번 turn 이 마지막 적용).
  }
  return { nextDots, totalDmg };
}

export function makeBleedDot(args: {
  stacks?: number;
  turns?: number;
  flatPerStack: number;
  sourceAtk: number;
}): V2Dot {
  return {
    tag: "bleed",
    label: "출혈",
    stacks: args.stacks ?? 1,
    maxStacks: BLEED_MAX_STACKS,
    turns: args.turns ?? 3,
    flatPerStack: args.flatPerStack,
    atkCoefPerStack: BLEED_ATK_COEF_PER_STACK,
    pctMaxHpPerStack: 0,
    sourceAtk: args.sourceAtk,
  };
}

export function makePoisonDot(args: {
  stacks?: number;
  turns?: number;
  pctMaxHpPerStack: number;
  sourceAtk: number;
}): V2Dot {
  return {
    tag: "poison",
    label: "중독",
    stacks: args.stacks ?? 1,
    maxStacks: POISON_MAX_STACKS,
    turns: args.turns ?? 3,
    flatPerStack: 0,
    atkCoefPerStack: 0,
    pctMaxHpPerStack: args.pctMaxHpPerStack,
    sourceAtk: args.sourceAtk,
  };
}

// target 의 dot 목록 갱신. 같은 tag 가 들어오면 스택 누적 + refresh, 새 tag 는 append.
// turns 는 그대로 박는다 — tick 시점에 즉시 dmg 적용 + turns-1 패턴이라 cd 의 +1 시드 패턴과 다름.
// 의도: N=3 → 3번 tick 마다 dmg 적용.
export function applyV2DotsToTarget(
  current: V2DotList,
  toApply: ReadonlyArray<V2Dot>,
): V2Dot[] {
  if (toApply.length === 0) return [...current];
  const byTag = new Map<V2DotTag, V2Dot>(current.map((d) => [d.tag, d]));
  for (const a of toApply) {
    const prev = byTag.get(a.tag);
    byTag.set(a.tag, {
      ...a,
      stacks: Math.min(a.maxStacks, (prev?.stacks ?? 0) + a.stacks),
    });
  }
  return Array.from(byTag.values());
}

// ── v2 스킬 런타임 (PR-4a~b) ──────────────────────────────────────────────
// v2 스탯 스킬 시스템 (v2_skill_*, V2_SKILLS) 의 전투 런타임 헬퍼. PR-7a 부터 옛 spell
// 시스템 (data/v2/spells.ts) 폐기 — 모든 마법은 V2SkillsState 로 통합. MP 풀은 단판 풀충전 모델.

export type V2SkillCooldowns = Partial<Record<V2SkillId, number>>;

// v2 스킬 selfBuff/enemyDebuff 의 stat 별 시한부 효과. PR-4b.
// pct 정수 퍼센트, turns 남은 턴 (매 player turn 진입 시 -1, 0 도달이면 제거).
// 같은 stat 키에 새 buff/debuff 가 박히면 덮어쓰기 (refresh) — pct/turns 새 값으로.
export type V2BuffEntry = { pct: number; turns: number };
export type V2BuffMap = Partial<Record<StatKey, V2BuffEntry>>;

// 매 player turn 진입 시 turns -1. 0 이하 키는 제거.
export function tickV2BuffMap(map: V2BuffMap): V2BuffMap {
  const next: V2BuffMap = {};
  for (const [stat, entry] of Object.entries(map)) {
    if (!entry) continue;
    if (entry.turns > 1) next[stat as StatKey] = { pct: entry.pct, turns: entry.turns - 1 };
    // turns <= 1 → drop.
  }
  return next;
}

// 활성화된 buff/debuff 의 stat 별 효과 % (turns > 0 인 것만). 0 이면 효과 없음.
// caller 는 stat 곱셈 보정에 사용 — 예: atk *= (1 + buffPct/100), atk *= (1 - debuffPct/100).
export function v2BuffActive(map: V2BuffMap, stat: StatKey): number {
  const entry = map[stat];
  if (!entry || entry.turns <= 0) return 0;
  return entry.pct;
}

// atk 에 기여하는 stat 의 buff/debuff 합산 → 곱셈 multiplier (1 + Σbuff% − Σdebuff%).
// PR-5a: 격리 해제 — v2 buff/debuff 가 일반 공격에도 영향. atk 기여 stat = str/dex/spd/luk.
// int 는 일반 공격 atk 와 무관 (마법/MP 자원만 관련) — 합산에서 제외.
// 0 floor — 합산 debuff 가 buff+100% 초과해도 atk 음수 안 되게.
// PR-2 strict §4 — 물리 atk 버프는 STR 만 (dex/spd/luk atk 보조 폐기와 일관).
const V2_ATK_STATS: readonly StatKey[] = ["str"];
export function v2AtkBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  let totalBuff = 0;
  let totalDebuff = 0;
  for (const s of V2_ATK_STATS) {
    totalBuff += v2BuffActive(selfBuffs, s);
    totalDebuff += v2BuffActive(selfDebuffs, s);
  }
  return Math.max(0, 1 + totalBuff / 100 - totalDebuff / 100);
}

// 마법 데미지에 기여하는 stat 의 buff/debuff → 곱셈 multiplier. 마법 축 = int 만.
// 물리의 v2AtkBuffMult(str/dex/spd/luk) 와 대칭 — int 는 그쪽에서 제외돼 있어 명상(int +10%
// selfBuff)·정신 안개(int enemyDebuff)가 그동안 전투 no-op 였다. 마법 경로(scaling="magic")
// 가 이 헬퍼를 쓰면서 비로소 실효를 가진다. 공격자 자신의 int buff 가 자기 마법을 키우고,
// 자신에게 박힌 int debuff(상대의 정신 안개)가 자기 마법을 깎는다. 0 floor.
export function v2MagicBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  const buff = v2BuffActive(selfBuffs, "int");
  const debuff = v2BuffActive(selfDebuffs, "int");
  return Math.max(0, 1 + buff / 100 - debuff / 100);
}

// def 에 기여하는 stat = vit 만 (다른 stat 은 def 무관).
// vit buff → +%, vit debuff → −%. 0 floor.
export function v2DefBuffMult(
  selfBuffs: V2BuffMap,
  selfDebuffs: V2BuffMap,
): number {
  const vitBuff = v2BuffActive(selfBuffs, "vit");
  const vitDebuff = v2BuffActive(selfDebuffs, "vit");
  return Math.max(0, 1 + vitBuff / 100 - vitDebuff / 100);
}

// ── v2 스킬 effect 계산 (PR-4b → PR-5a) ───────────────────────────────────
// PR-4a 의 cast 결정 + MP/cd 외에 실제 효과(damage/heal/buff/debuff) 를 계산.
// PR-5a 격리 해제: v2 buff/debuff 가 일반 공격에도 영향 → v2DamageAmount 도 공통 헬퍼
// (v2AtkBuffMult / v2DefBuffMult) 사용해 일관성 유지. scalingStat 인자 폐지 — atk 기여
// stat 전부 합산 (이전엔 def.stat 한 stat 만 사용했으나 격리 해제 의미 약해 폐기).

// v2 스킬 damage 계산. (물리) statCoef × attackerAtk × v2AtkBuffMult + baseFlat,
// (마법) statCoef × attackerMagicAtk × v2MagicBuffMult + baseFlat 을 raw 로, 적 def 에
// v2DefBuffMult(target) 곱 후 damageBetween. 일반 공격과 같은 경로(DEF 적용, 물리·마법 공유).
//   - scaling: "magic" 이면 magicAtk(INT 환산)+int 버프 배수, 아니면 atk+물리 버프 배수.
//   - attackerMagicAtk 미지정(적·구 호출) 이면 attackerAtk 로 폴백 → 물리와 동일 동작 보존.
//   - attackerSelfBuffs / attackerSelfDebuffs: 공격자 측 (물리=str/dex/spd/luk, 마법=int)
//   - targetSelfBuffs / targetSelfDebuffs: 방어자 측 (vit 만 def 에 영향)
export function v2DamageAmount(args: {
  attackerAtk: number;
  attackerMagicAtk?: number;
  // PR-2 — 공격자 최소 데미지(데미지 하한). 미지정=0(하한 1 유지).
  attackerMinDamage?: number;
  scaling?: "physical" | "magic";
  targetDef: number;
  // PR-2 — 마법 방어력. scaling="magic" 일 때 사용, 미지정이면 물리 def 폴백(몹·구호출 보존).
  targetMagicDef?: number;
  statCoef: number;
  baseFlat: number;
  attackerSelfBuffs: V2BuffMap;
  attackerSelfDebuffs: V2BuffMap;
  targetSelfBuffs: V2BuffMap;
  targetSelfDebuffs: V2BuffMap;
  // PR-5b — 스킬 속성 보정 배수. 평타속성(atk 에 baked) 대비 스킬속성으로 재정규화한 비율.
  // 미지정/1 = 보정 없음(평타속성 그대로). atk 기여분(base)에만 적용, baseFlat 은 불변.
  elementMult?: number;
}): number {
  const isMagic = args.scaling === "magic";
  const base =
    (isMagic ? args.attackerMagicAtk ?? args.attackerAtk : args.attackerAtk) *
    (args.elementMult ?? 1);
  const mult = isMagic
    ? v2MagicBuffMult(args.attackerSelfBuffs, args.attackerSelfDebuffs)
    : v2AtkBuffMult(args.attackerSelfBuffs, args.attackerSelfDebuffs);
  const defMult = v2DefBuffMult(args.targetSelfBuffs, args.targetSelfDebuffs);
  const rawAtk = Math.floor(base * mult * args.statCoef) + args.baseFlat;
  // 마법 데미지는 마법 방어력으로 경감(미지정=물리 def 폴백). 물리는 물리 def.
  const defStat = isMagic ? args.targetMagicDef ?? args.targetDef : args.targetDef;
  const effectiveDef = Math.floor(defStat * defMult);
  // 데미지 하한 = max(1, 공격자 최소 데미지). 저-atk 빌드의 바닥 데미지 보장.
  const floor = Math.max(1, args.attackerMinDamage ?? 0);
  return Math.max(floor, rawAtk - effectiveDef);
}

// v2 스킬 heal 계산. pctMaxHp × maxHp / 100 + flat (caller 가 maxHp 클램프).
export function v2HealAmount(args: {
  attackerMaxHp: number;
  pctMaxHp: number;
  flat: number;
  // PR-2 — 회복량 배수(활력·정신). 미지정=1.
  healMult?: number;
}): number {
  const pctPart = Math.floor((args.attackerMaxHp * args.pctMaxHp) / 100);
  const base = Math.max(0, pctPart + args.flat);
  return Math.floor(base * (args.healMult ?? 1));
}

// MP-throttle 모델 — 전 스킬 쿨다운 폐지(데이터 cooldown:0), MP 소모량이 유일 throttle.
// P5 — 고정 절대값(v2Skills.v2SkillMpCostValue): 기준 풀 × % × 계열 × 차수. 무료·몬스터는 리터럴.
export function v2SkillMpCost(def: V2SkillDefinition): number {
  return v2SkillMpCostValue(def);
}

// PR-5b — monster.v2MaxMp 미지정 시 자동 시드. equipped 중 max mpCost × 3 → 약 3-5 회 cast.
// 0 = equipped 비어 cast 불가능. monster 데이터 작성 부담 줄이는 default.
export function defaultV2MaxMpFor(skills: V2SkillsState): number {
  if (skills.equipped.length === 0) return 0;
  let maxCost = 0;
  for (const id of skills.equipped) {
    const def = V2_SKILLS[id];
    const cost = def ? v2SkillMpCost(def) : 0;
    if (cost > maxCost) maxCost = cost;
  }
  return maxCost * 3;
}

export function emptyV2SkillCooldowns(): V2SkillCooldowns {
  return {};
}

// 매 플레이어 턴 진입 시 호출. 양수 카운터 -1 (0 이하 키는 삭제 — ready 상태).
export function tickV2SkillCooldowns(map: V2SkillCooldowns): V2SkillCooldowns {
  const next: V2SkillCooldowns = {};
  for (const [id, n] of Object.entries(map)) {
    if (typeof n !== "number") continue;
    if (n > 1) next[id as V2SkillId] = n - 1;
    // n <= 1 → drop (0 = ready, 음수는 정상 상태 아님이나 보수적으로 drop).
  }
  return next;
}

// 슬롯 우선순위로 발동 가능한 첫 스킬 선택. 조건:
//   (a) cooldowns[id] === 0 (또는 undefined),
//   (b) mp >= def.mpCost,
//   (c) def.effects.length > 0 (효과 없는 스킬은 PR-4a 에서 skip).
// equipped 배열 순서가 우선순위 = 자동 발동 정책 (spec Section 6.4 PR-4 contract).
export function pickAutoCastV2Skill(args: {
  equipped: readonly V2SkillId[];
  cooldowns: V2SkillCooldowns;
  mp: number;
}): V2SkillId | null {
  for (const id of args.equipped) {
    const def = V2_SKILLS[id];
    if (!def) continue;
    if ((args.cooldowns[id] ?? 0) > 0) continue;
    if (args.mp < v2SkillMpCost(def)) continue;
    if (def.effects.length === 0) continue;
    return id;
  }
  return null;
}

// v2 스킬 cast 한 번의 결과.
//   PR-4a (framework):
//     - nextMp / nextCooldowns: MP 차감 + cd 세팅 후 상태
//     - castSkillId / castSkillName: 발동된 스킬 (없으면 null)
//   PR-4b (효과 적용):
//     - enemyDamage: damage effect 들의 합 (0 = 미발동)
//     - selfHeal: heal effect 들의 합 (caller 가 maxHp 클램프, 0 = 미발동)
//     - selfBuffsToApply: selfBuff effect 의 {stat,pct,turns} 목록 — caller 가 state.v2SelfBuffs 갱신
//     - enemyDebuffsToApply: enemyDebuff effect 의 {stat,pct,turns} 목록 — caller 가 target.v2SelfDebuffs 갱신
//   PR-8 (DoT 적용):
//     - dotsToApplyToTarget: tagged dot entry 목록 — caller 가 target.v2Dots 갱신.
export type V2SkillBuffApply = { stat: StatKey; pct: number; turns: number };
export type V2SkillDotApply = V2Dot;
// PR2-B 파생 스탯 버프 — 회피(선풍각)·크리율(연환집중)·받피감 등 StatKey 밖.
export type V2SkillPctBuffApply = {
  target: "evasion" | "crit" | "damageReduction" | "reflectDamage";
  pct: number;
  turns: number;
};
export type V2SkillCastResult = {
  nextMp: number;
  nextCooldowns: V2SkillCooldowns;
  castSkillId: V2SkillId | null;
  castSkillName: string | null;
  enemyDamage: number;
  /** 적에게 가한 damage 효과별 개별 피해(다단 스킬 = 타당 1개). 합 = enemyDamage.
   *  엔진이 전투 로그를 타마다 한 줄로 쪼개는 데 사용(부스트는 distributeBoostedHits 로 분배). */
  hitDamages: number[];
  selfHeal: number;
  selfBuffsToApply: V2SkillBuffApply[];
  enemyDebuffsToApply: V2SkillBuffApply[];
  dotsToApplyToTarget: V2SkillDotApply[];
  // PR2-B 신규 메커닉 — caller(엔진 PvE/PvP)가 적용.
  selfHpCost: number; // 사혈격 — 시전자 HP 소모량(절대값)
  selfBuffPctToApply: V2SkillPctBuffApply[]; // 파생 스탯 버프
  shieldToApply?: { hp: number; mp: number; turns: number }; // 마나 보호막(흡수량)
  selfRegenToApply?: { pctMaxHpPerTurn: number; turns: number }; // 운기 리젠
  enemyVulnToApply?: { pct: number; turns: number }; // 속박 취약(받는 피해 +%)
  enemyEvasionDownToApply?: { pct: number; turns: number }; // 실명(원소술사 빛) — 적 회피 -%
  enemyAccuracyDownToApply?: { pct: number; turns: number }; // 암흑(원소술사 어둠) — 적 명중 -%
  selfHasteToApply?: { pct: number }; // 바람(원소술사) — ATB 내 다음 행동 가속 %(1회). 비-ATB 무시.
  enemyDelayToApply?: { pct: number }; // 대지(원소술사) — ATB 적 다음 행동 지연 %(1회). 비-ATB 무시.
  enemyHealReduceToApply?: { pct: number; turns: number }; // 화상(원소술사 불) — 적 회복 −%(N턴)
  manaRestored: number; // 명상 등 — 이번 시전이 회복한 마나(nominal). 0 = 마나회복 효과 없음. 로그용.
};

// PR-4b — attacker/target ctx 로 묶음. PR-4a 의 단순 mp/cd 입력에서 확장.
export type V2SkillCastInput = {
  skills: V2SkillsState;
  cooldowns: V2SkillCooldowns;
  /** 발동 확률 롤 (0~100). 엔진이 Math.random()*100 로 채움. procChance<100 스킬만 사용 —
   *  미지정이면 항상 발동(구 호출·테스트 호환). */
  procRoll?: number;
  /** 발동 확률 보너스 %p (워메이지 주문연사 등 — 스킬 procChance 에 합산, 100 클램프). 미지정=0. */
  procChanceBonus?: number;
  /** 전투 패턴(갬빗) — 주어지면 슬롯순서+procChance 대신 우선순위 평가로 스킬 선택(조건 충족=확정
   *  발동). 미지정이면 옛 경로(pickAutoCastV2Skill + procRoll). 엔진이 플레이어 cast 에만
   *  주입(몹 cast 는 미주입 = 옛 경로). 플래그 V2_COMBAT_PATTERN_ENABLED 가 엔진단 게이트. */
  combatPattern?: V2CombatPattern;
  /** 패턴 경로에서도 procChance 굴림(부활) — true 면 패턴이 고른 스킬도 procChance 게이트를 통과해야
   *  발동(확정 발동 → 확률 발동). 미지정/false 면 패턴 경로는 procChance 은퇴(조건 충족=확정, 현행
   *  byte-identical). 옛 경로(viaPattern=false)는 이 값과 무관하게 항상 procChance 롤. 엔진이
   *  V2_SKILL_PROC_IN_PATTERN 플래그로 주입. */
  applyProcInPattern?: boolean;
  /** 현재 턴(1-based) — combatPattern 의 turn 조건용. 미지정=1. */
  turn?: number;
  /** 속성 상성 계수(%) — 스킬 속성 보정용. 미지정=PvE 기본(25/0). PvP(engine-pvp)는 PvP 계수(15/15) 전달. */
  elementAdvPct?: number;
  elementDisPct?: number;
  attacker: {
    mp: number;
    atk: number;
    // 한 턴 평타 횟수(>=1). 패턴 경로 "평타 기준 보너스" 모델의 평타 바닥 = 단타 평타 × 이 값.
    // 미지정=1(구 호출·테스트 호환). 패턴 경로(viaPattern)에서만 쓰인다.
    attackCount?: number;
    // 마법 공격력(INT 환산). 미지정이면 v2DamageAmount 가 atk 로 폴백 — 적·구 호출 무영향.
    // scaling="magic" 데미지 스킬만 이 값을 쓴다.
    magicAtk?: number;
    // PR-2 v2 — 최소 데미지(하한)·회복량 배수. 미지정 안전(폴백).
    minDamage?: number;
    healMult?: number;
    maxHp: number;
    // PR2-B 스킬 메커닉 — def/vit 비례 딜(방패가격·나한권), 현재HP(사혈격·기공순환),
    //   maxMp(마나보호막·명상), 차수(전문화 스킬 baseFlatByTier flat 성장). 미지정=안전 폴백.
    def?: number;
    vit?: number;
    dex?: number;
    luk?: number;
    allStatTotal?: number;
    currentHp?: number;
    maxMp?: number;
    classTier?: number;
    // 활성 파생버프(회피/치명/받피감 = selfBuffPct) — 패턴 조건 self_buff_pct 평가용. 엔진이
    //   state.stacks 의 turns>0 여부로 채운다. 미지정=전부 비활성(구 호출 안전).
    selfBuffPctActive?: {
      evasion?: boolean;
      crit?: boolean;
      damageReduction?: boolean;
      reflectDamage?: boolean;
    };
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
    // PR-5b — 평타 속성(무기 ?? 캐릭, atk 에 baked)·캐릭 속성(스킬 기본). 미지정=neutral.
    attackElement?: V2Element;
    characterElement?: V2Element;
  };
  target: {
    def: number;
    // PR-2 v2 — 마법 방어력 (마법 데미지 경감, 미지정=물리 def 폴백).
    magicDef?: number;
    // PR2-B — execute(처단 처형 임계)·스택 payoff(참절/중독폭발/비전작렬). 미지정=폴백.
    currentHp?: number;
    maxHp?: number;
    executeHpThresholdFloorPct?: number;
    bleedStacks?: number;
    poisonStacks?: number;
    magicVulnStacks?: number;
    // PR-5a: target buff/debuff 둘 다 필요 — target.vit buff 가 def 증폭, vit debuff 가 def 감소.
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
    // PR-5b — 피격 대상 속성(상성 계산). 미지정=neutral.
    element?: V2Element;
  };
};

const EMPTY_CAST_RESULT_BASE = {
  enemyDamage: 0,
  hitDamages: [] as number[],
  selfHeal: 0,
  selfBuffsToApply: [] as V2SkillBuffApply[],
  enemyDebuffsToApply: [] as V2SkillBuffApply[],
  dotsToApplyToTarget: [] as V2SkillDotApply[],
  selfHpCost: 0,
  selfBuffPctToApply: [] as V2SkillPctBuffApply[],
  manaRestored: 0,
};

// 전투 패턴 조건 평가용 ctx — cast 입력(공격자/대상 상태)에서 합성. 자버프 활성 스탯 = selfBuffs 키.
function buildPatternCtx(input: V2SkillCastInput): V2PatternCtx {
  const a = input.attacker;
  const t = input.target;
  const maxHp = Math.max(1, a.maxHp);
  const maxMp = Math.max(1, a.maxMp ?? 1);
  const enemyMaxHp = Math.max(1, t.maxHp ?? 1);
  return {
    selfHpPct: ((a.currentHp ?? a.maxHp) / maxHp) * 100,
    selfMpPct: (a.mp / maxMp) * 100,
    // 활성 자버프 스탯만(turns>0). 엔진은 tick 으로 만료 키를 제거하지만, 비-엔진 호출의 stale
    //   0턴 키가 false-positive(버프 활성) 내지 않게 방어적 필터.
    selfBuffStats: new Set(
      (Object.entries(a.selfBuffs) as [StatKey, V2BuffEntry | undefined][])
        .filter(([, e]) => e != null && e.turns > 0)
        .map(([k]) => k),
    ),
    // 활성 파생버프(회피/치명/받피감/반사피해) — 엔진이 넘긴 turns>0 플래그. self_buff_pct 조건 평가용.
    selfBuffPctTargets: new Set(
      (
        ["evasion", "crit", "damageReduction", "reflectDamage"] as const
      ).filter((tg) => a.selfBuffPctActive?.[tg]),
    ),
    enemyHpPct: ((t.currentHp ?? enemyMaxHp) / enemyMaxHp) * 100,
    enemyBleed: t.bleedStacks ?? 0,
    enemyPoison: t.poisonStacks ?? 0,
    enemyVuln: t.magicVulnStacks ?? 0,
    turn: input.turn ?? 1,
  };
}

export function resolveV2SkillCast(input: V2SkillCastInput): V2SkillCastResult {
  // 1) cd tick.
  const ticked = tickV2SkillCooldowns(input.cooldowns);
  // 2) 발동 후보 선택 — 전투 패턴(갬빗)이 주어지면 우선순위 평가, 아니면 옛 슬롯순서+proc.
  const viaPattern = input.combatPattern != null;
  // 패턴 경로도 "장착 스킬만 발동"(옛 pickAutoCastV2Skill 의 equipped 풀 의미 유지) — 커스텀 패턴이
  //   미장착/미학습 스킬 id 를 참조해도 발동 안 함. + 효과 있음·쿨다운·MP 게이트.
  const equippedSet = new Set<string>(input.skills.equipped);
  const isUsable = (sid: string) => {
    if (!equippedSet.has(sid)) return false;
    const d = V2_SKILLS[sid as V2SkillId];
    return (
      !!d &&
      d.effects.length > 0 &&
      (ticked[sid as V2SkillId] ?? 0) === 0 &&
      input.attacker.mp >= v2SkillMpCost(d)
    );
  };
  const resolveRole = (role: V2CombatRole): string | null => {
    for (const sid of input.skills.equipped) {
      const d = V2_SKILLS[sid as V2SkillId];
      if (!d) continue;
      if (role === "main_attack" && d.category !== "attack") continue;
      if (role !== "main_attack" && d.category !== role) continue;
      if (isUsable(sid)) return sid;
    }
    return null;
  };
  const candidateIds: V2SkillId[] = viaPattern
    ? (evaluateCombatPatternCandidates(
        input.combatPattern!,
        buildPatternCtx(input),
        isUsable,
        resolveRole,
      ) as V2SkillId[])
    : ([
        pickAutoCastV2Skill({
          equipped: input.skills.equipped,
          cooldowns: ticked,
          mp: input.attacker.mp,
        }),
      ].filter(Boolean) as V2SkillId[]);
  let id: V2SkillId | null = null;
  for (const candidateId of candidateIds) {
    const candidateDef = V2_SKILLS[candidateId];
    if (!candidateDef) continue;
    // 발동 확률 — 옛 경로(viaPattern=false)는 항상 procChance 롤. 패턴 경로는 기본적으로 procChance
    // 은퇴(조건 충족 = 확정 발동)지만, applyProcInPattern(V2_SKILL_PROC_IN_PATTERN) 가 켜지면 패턴이
    // 고른 스킬도 procChance 게이트를 통과해야 발동(확정 발동 → 확률 발동, 부활).
    // 패턴 후보가 procChance 에 실패하면 다음 우선순위 후보를 시도한다. 모든 후보가 실패해야 평타 폴백.
    // 비패턴 경로는 후보가 하나라 기존처럼 실패 시 평타 폴백한다. MP·쿨다운은 소모하지 않는다.
    const rollProc = !viaPattern || (input.applyProcInPattern ?? false);
    if (rollProc) {
      const procChance = Math.min(
        100,
        (candidateDef.procChance ?? 100) + (input.procChanceBonus ?? 0),
      );
      if (
        procChance < 100 &&
        input.procRoll !== undefined &&
        input.procRoll >= procChance
      ) {
        continue;
      }
    }
    id = candidateId;
    break;
  }
  if (!id) {
    return {
      ...EMPTY_CAST_RESULT_BASE,
      nextMp: input.attacker.mp,
      nextCooldowns: ticked,
      castSkillId: null,
      castSkillName: null,
    };
  }
  const def = V2_SKILLS[id];
  // PR-5b — 스킬 속성 보정. atk 엔 평타속성(무기??캐릭)이 baked 되어 있으므로, 스킬 데미지는
  // 스킬속성(없으면 캐릭속성) 기준으로 재정규화: ×(M_skill / M_basic). 둘 다 neutral 이면 1.
  const attackEl = input.attacker.attackElement ?? "neutral";
  const charEl = input.attacker.characterElement ?? "neutral";
  const targetEl = input.target.element ?? "neutral";
  const mBasic = elementDamageMult(
    attackEl,
    targetEl,
    input.elementAdvPct,
    input.elementDisPct,
  );
  const mSkill = elementDamageMult(
    def.element ?? charEl,
    targetEl,
    input.elementAdvPct,
    input.elementDisPct,
  );
  const skillElementMult = mBasic > 0 ? mSkill / mBasic : 1;
  // 3) effect 별 결과 누산.
  let enemyDamage = 0;
  // 개별 damage 효과(다단 스킬 = 타당 1개)를 따로 모아 둔다 — 엔진이 로그를 타마다 쪼갬.
  const hitDamages: number[] = [];
  const dealDamage = (x: number): void => {
    enemyDamage += x;
    hitDamages.push(x);
  };
  let selfHeal = 0;
  let selfHpCost = 0;
  let manaRestore = 0;
  const selfBuffsToApply: V2SkillBuffApply[] = [];
  const enemyDebuffsToApply: V2SkillBuffApply[] = [];
  const dotsToApplyToTarget: V2SkillDotApply[] = [];
  const selfBuffPctToApply: V2SkillPctBuffApply[] = [];
  let shieldToApply: V2SkillCastResult["shieldToApply"];
  let selfRegenToApply: V2SkillCastResult["selfRegenToApply"];
  let enemyVulnToApply: V2SkillCastResult["enemyVulnToApply"];
  let enemyEvasionDownToApply: V2SkillCastResult["enemyEvasionDownToApply"];
  let enemyAccuracyDownToApply: V2SkillCastResult["enemyAccuracyDownToApply"];
  let selfHasteToApply: V2SkillCastResult["selfHasteToApply"];
  let enemyDelayToApply: V2SkillCastResult["enemyDelayToApply"];
  let enemyHealReduceToApply: V2SkillCastResult["enemyHealReduceToApply"];

  // 전문화 스킬 차수 flat — baseFlatByTier 있으면 시전자 차수(2/3/4 → idx 0/1/2)로 선택, 없으면 baseFlat.
  const tierIdx = Math.min(2, Math.max(0, (input.attacker.classTier ?? 2) - 2));
  const flatOf = (
    baseFlat: number | undefined,
    byTier: readonly [number, number, number] | undefined,
  ): number => (byTier ? byTier[tierIdx] : baseFlat ?? 0);

  // 데미지 — scaling physical/magic + def/vit(그 값을 attackerAtk 로 써서 물리 경로). extraFlat=추가 flat.
  //   targetDefOverride 지정 시 적 방어를 그 값으로 대체(관통 추가타의 "0방어 피해" 계산용).
  const damageWith = (
    statCoef: number,
    baseFlat: number,
    scaling: "physical" | "magic" | "def" | "vit" | "dex" | "luk" | "all" | "maxHp" | undefined,
    extraFlat = 0,
    targetDefOverride?: number,
  ): number => {
    let attackerAtk = input.attacker.atk;
    let scale: "physical" | "magic" = "physical";
    if (scaling === "magic") scale = "magic";
    else if (scaling === "def") attackerAtk = input.attacker.def ?? input.attacker.atk;
    else if (scaling === "vit") attackerAtk = input.attacker.vit ?? input.attacker.atk;
    else if (scaling === "dex") attackerAtk = input.attacker.dex ?? input.attacker.atk;
    else if (scaling === "luk") attackerAtk = input.attacker.luk ?? input.attacker.atk;
    else if (scaling === "all") attackerAtk = input.attacker.allStatTotal ?? input.attacker.atk;
    else if (scaling === "maxHp") attackerAtk = input.attacker.maxHp;
    // def/vit/dex/luk/all/maxHp 비례딜은 STR 공격버프가 atk 를 부풀리는 v2DamageAmount 의 버프 곱을 받으면
    //   안 됨(Codex 검토). attackerAtk 이 이미 그 스탯 값이라 빈 버프 전달.
    const statScaled =
      scaling === "def" ||
      scaling === "vit" ||
      scaling === "dex" ||
      scaling === "luk" ||
      scaling === "all" ||
      scaling === "maxHp";
    return v2DamageAmount({
      attackerAtk,
      attackerMagicAtk: scale === "magic" ? input.attacker.magicAtk : undefined,
      attackerMinDamage: input.attacker.minDamage,
      scaling: scale,
      targetDef: targetDefOverride ?? input.target.def,
      targetMagicDef: targetDefOverride ?? input.target.magicDef,
      statCoef,
      baseFlat: baseFlat + extraFlat,
      attackerSelfBuffs: statScaled ? {} : input.attacker.selfBuffs,
      attackerSelfDebuffs: statScaled ? {} : input.attacker.selfDebuffs,
      targetSelfBuffs: input.target.selfBuffs,
      targetSelfDebuffs: input.target.selfDebuffs,
      elementMult: skillElementMult,
    });
  };

  // 속성 분기(원소술사) — def.elementEffects 가 있으면 시전자 캐릭 속성의 효과 배열을 쓴다(매칭
  //   없으면 effects 폴백=무속성). 기존 스킬은 elementEffects 미정의 → def.effects 그대로(byte-identical).
  const castEffects = def.elementEffects?.[charEl] ?? def.effects;
  for (const effect of castEffects) {
    if (effect.kind === "damage") {
      const flat = flatOf(effect.baseFlat, effect.baseFlatByTier);
      const base = damageWith(effect.statCoef, flat, effect.scaling);
      // 관통(방어 무시) 추가타 — 0방어 피해의 pierceDamagePct% 를 방어로 깎이지 않는 추가분으로 합산.
      const pierceBonus = effect.pierceDamagePct
        ? Math.round((damageWith(effect.statCoef, flat, effect.scaling, 0, 0) * effect.pierceDamagePct) / 100)
        : 0;
      dealDamage(base + pierceBonus);
    } else if (effect.kind === "heal") {
      if (effect.pctLostHp != null) {
        // 잃은 체력 비례 회복(기공 순환).
        const lost = Math.max(0, input.attacker.maxHp - (input.attacker.currentHp ?? input.attacker.maxHp));
        selfHeal += Math.floor(((lost * effect.pctLostHp) / 100) * (input.attacker.healMult ?? 1));
      } else {
        selfHeal += v2HealAmount({
          attackerMaxHp: input.attacker.maxHp,
          pctMaxHp: effect.pctMaxHp ?? 0,
          flat: effect.flat ?? 0,
          healMult: input.attacker.healMult,
        });
      }
    } else if (effect.kind === "selfBuff") {
      selfBuffsToApply.push({ stat: effect.stat, pct: effect.pct, turns: effect.turns });
    } else if (effect.kind === "selfBuffPct") {
      selfBuffPctToApply.push({ target: effect.target, pct: effect.pct, turns: effect.turns });
    } else if (effect.kind === "selfRegen") {
      selfRegenToApply = { pctMaxHpPerTurn: effect.pctMaxHpPerTurn, turns: effect.turns };
    } else if (effect.kind === "shield") {
      const hp = Math.floor((input.attacker.maxHp * (effect.pctMaxHp ?? 0)) / 100);
      const mp = Math.floor(((input.attacker.maxMp ?? 0) * (effect.pctMaxMp ?? 0)) / 100);
      shieldToApply = {
        hp: (shieldToApply?.hp ?? 0) + hp,
        mp: (shieldToApply?.mp ?? 0) + mp,
        turns: effect.turns,
      };
    } else if (effect.kind === "manaRestore") {
      manaRestore += Math.floor(((input.attacker.maxMp ?? 0) * effect.pctMaxMp) / 100);
    } else if (effect.kind === "enemyDebuff") {
      enemyDebuffsToApply.push({ stat: effect.stat, pct: effect.pct, turns: effect.turns });
    } else if (effect.kind === "enemyVuln") {
      enemyVulnToApply = { pct: effect.pct, turns: effect.turns };
    } else if (effect.kind === "enemyEvasionDown") {
      enemyEvasionDownToApply = { pct: effect.pct, turns: effect.turns };
    } else if (effect.kind === "enemyAccuracyDown") {
      enemyAccuracyDownToApply = { pct: effect.pct, turns: effect.turns };
    } else if (effect.kind === "selfHaste") {
      // 바람 — ATB 1회성 자기 가속. 효과 적용은 ATB 루프(틱)에서. cast 결과로만 전달.
      selfHasteToApply = { pct: effect.pct };
    } else if (effect.kind === "enemyDelay") {
      // 대지 — ATB 1회성 적 지연. 효과 적용은 ATB 루프(틱)에서. cast 결과로만 전달.
      enemyDelayToApply = { pct: effect.pct };
    } else if (effect.kind === "enemyHealReduce") {
      // 화상 — 적 회복 효과 감소 디버프(N턴). 소비는 적/상대 회복 지점(회복 스킬·재생).
      enemyHealReduceToApply = { pct: effect.pct, turns: effect.turns };
    } else if (effect.kind === "hpCostDamage") {
      // 사혈격 — 현재 HP pct 소모 + 소모량×soakRatio 추가딜.
      const cost = Math.floor(((input.attacker.currentHp ?? input.attacker.maxHp) * effect.pctCurrentHp) / 100);
      selfHpCost += cost;
      dealDamage(damageWith(effect.statCoef, flatOf(undefined, effect.baseFlatByTier), effect.scaling, Math.floor(cost * effect.soakRatio)));
    } else if (effect.kind === "healToDamage") {
      // 신성 강타 — 자힐 후 힐량×damageRatio 적에게 딜.
      const atkBase = (effect.scaling === "magic" ? input.attacker.magicAtk ?? input.attacker.atk : input.attacker.atk) * effect.healStatCoef;
      const heal = Math.floor((atkBase + flatOf(undefined, effect.healFlatByTier)) * (input.attacker.healMult ?? 1));
      selfHeal += heal;
      dealDamage(Math.floor(heal * effect.damageRatio * skillElementMult));
    } else if (effect.kind === "executeDamage") {
      // 처단 — 적 HP 임계 이하면 ×bonusMult.
      const base = damageWith(effect.statCoef, flatOf(undefined, effect.baseFlatByTier), effect.scaling);
      const frac = (input.target.currentHp ?? 1) / Math.max(1, input.target.maxHp ?? 1);
      const thresholdPct = Math.max(
        effect.hpThresholdPct,
        input.target.executeHpThresholdFloorPct ?? 0,
      );
      dealDamage(frac <= thresholdPct / 100 ? Math.floor(base * effect.bonusMult) : base);
    } else if (effect.kind === "ambushDamage") {
      // 기습 — 처형의 역. 적 HP 임계 "이상"(풀피)이면 ×bonusMult (오프너 알파), 아니면 낮은 기본딜.
      const base = damageWith(effect.statCoef, flatOf(undefined, effect.baseFlatByTier), effect.scaling);
      const frac = (input.target.currentHp ?? 1) / Math.max(1, input.target.maxHp ?? 1);
      dealDamage(frac >= effect.hpThresholdPct / 100 ? Math.floor(base * effect.bonusMult) : base);
    } else if (effect.kind === "stackPayoffDamage") {
      // 참절/중독폭발/비전작렬 — 적 DoT/취약 스택당 추가딜.
      const stacks =
        effect.tag === "bleed" ? input.target.bleedStacks ?? 0
        : effect.tag === "poison" ? input.target.poisonStacks ?? 0
        : input.target.magicVulnStacks ?? 0;
      dealDamage(damageWith(effect.statCoef, flatOf(undefined, effect.baseFlatByTier) + stacks * effect.perStackFlat, effect.scaling));
    } else if (effect.kind === "dot") {
      // 패턴 경로 DoT throttle — 확정 발동으로 자주 적용되는 DoT 틱 위력을 깎는다(평타 바닥 보호로
      //   직타는 안 깎이므로 DoT 만 줄여도 빌드가 평타 이하로 안 떨어짐). off/몹 cast 는 미적용.
      const dm = viaPattern ? V2_PATTERN_DOT_POWER_MULT : 1;
      const dotSourceAtk =
        effect.tag === "poison"
          ? Math.max(input.attacker.atk, input.attacker.luk ?? 0)
          : input.attacker.atk;
      dotsToApplyToTarget.push({
        tag: effect.tag,
        label: effect.label,
        stacks: effect.stacks,
        maxStacks: effect.maxStacks,
        turns: effect.turns,
        flatPerStack: effect.flatPerStack * dm,
        atkCoefPerStack: effect.atkCoefPerStack * dm,
        pctMaxHpPerStack: effect.pctMaxHpPerStack * dm,
        sourceAtk: dotSourceAtk,
      });
    }
  }
  // 4) MP 차감(+명상 회복) + cd 세팅 (cd=N → N+1 저장으로 다음 tick 후 정확히 N 유지).
  // 패턴 경로(proc 은퇴 — 위력 중립 재밸런스): proc 없이 확정 발동이라 스킬 빈도가 ~5배.
  //   "평타 기준 보너스" 모델 — 스킬 피해를 단순 ×배율로 깎으면 강스킬은 중립이어도 약스킬·DoT
  //   빌드는 평타 이하로 떨어져 너프된다(빌드별 중립 불가). 대신 평타 바닥(평타로 때렸을 한 턴
  //   피해)은 보존하고 그 위 초과분만 V2_PATTERN_SKILL_POWER_MULT 로 깎는다:
  //     패턴피해 = 평타바닥 + max(0, 스킬피해 − 평타바닥) × mult
  //   → 어떤 스킬도 평타보다 나빠지지 않고(바닥 보장), 패턴이 주는 "초과 위력"만 중립화. 평타바닥은
  //   스킬 주피해 속성(마법/물리)·attackCount 로 산출(damageBetween — 엔진 평타와 동일 공식).
  //   hitDamages 는 비율용이라 미스케일(엔진이 enemyDamage 총합을 distributeBoostedHits 로 재분배).
  //   DoT 는 평타 등가가 없어 위 모델 대신 V2_PATTERN_DOT_POWER_MULT 로 별도 throttle(위 dot 분기).
  //   selfHeal 도 동일 ×skillMult throttle. 버프/디버프/마나회복은 미적용.
  // 차수별 위력 통과율 — 고차 스킬일수록 평타 초과분을 더 많이 반영(쓸 가치). t1=중립 기본값.
  const skillMult = viaPattern ? V2_PATTERN_SKILL_POWER_MULT_BY_TIER[def.tier] : 1;
  // 기습(ambushDamage) = 빈도 제한 오프너 — 첫 턴 풀피에서만 큰 값이고(그 외엔 낮은 기본딜·평타 이하)
  //   매 턴 스팸이 아니다. 패턴 빈도 throttle(0.14·~5배 발동 가정)을 면제하지 않으면 "큰 오프너"가
  //   평타바닥+14% 로 뭉개진다(설계 무력화). raw 그대로 통과(off 경로/일반 스킬은 무영향).
  const ambushOpener = castEffects.some((e) => e.kind === "ambushDamage");
  const scaledEnemyDamage = ((): number => {
    if (!viaPattern || enemyDamage <= 0 || ambushOpener) return enemyDamage;
    // 평타 바닥 — 단타 평타(statCoef 1·baseFlat 0) × 한 턴 평타 횟수. 스킬에 마법 데미지 효과가
    //   하나라도 있으면 마법 공격력 기준, 아니면 물리 공격력 기준으로 바닥을 잡는다.
    //   (물리+마법 혼합 효과 스킬은 전체 바닥을 마법으로 잡게 되나, 현 데이터엔 혼합 스킬 없음.)
    const magic = castEffects.some(
      (e) =>
        (e.kind === "damage" ||
          e.kind === "hpCostDamage" ||
          e.kind === "executeDamage" ||
          e.kind === "stackPayoffDamage" ||
          e.kind === "healToDamage") &&
        e.scaling === "magic",
    );
    // 평타 1타 = damageBetween(유효 atk, 유효 def) — 엔진 평타와 동일 공식(minDamage 하한이 아닌
    //   atk×0.15 하한). 마법 스킬이면 마법 평타(마공 vs 물방, PvE 평타와 동일). v2 자버프/적 def
    //   버프 곱은 엔진 평타(engine.ts v2EffectiveAtk/Def)와 맞춘다. 상황 보너스(크리·AP·속성)는 제외.
    const basicPower = magic
      ? input.attacker.magicAtk ?? input.attacker.atk
      : input.attacker.atk;
    const atkMult = v2AtkBuffMult(input.attacker.selfBuffs, input.attacker.selfDebuffs);
    const defMult = v2DefBuffMult(input.target.selfBuffs, input.target.selfDebuffs);
    const effAtk = atkMult !== 1 ? Math.floor(basicPower * atkMult) : basicPower;
    const effDef = defMult !== 1 ? Math.floor(input.target.def * defMult) : input.target.def;
    const basicFloor =
      damageBetween(effAtk, effDef) * Math.max(1, input.attacker.attackCount ?? 1);
    const surplus = Math.max(0, enemyDamage - basicFloor);
    // viaPattern 가드 통과 = skillMult 가 차수별 통과율(1 아님).
    return Math.round(basicFloor + surplus * skillMult);
  })();
  return {
    nextMp: input.attacker.mp - v2SkillMpCost(def) + manaRestore,
    nextCooldowns: { ...ticked, [id]: def.cooldown + 1 },
    castSkillId: id,
    // 원소술사 "속성 마법" → 로그에 시전자 속성으로 동적 표기("불 마법" 등). 그 외=정적 def.name.
    castSkillName: def.elementNamed
      ? `${V2_ELEMENT_LABEL[charEl]} 마법`
      : def.name,
    enemyDamage: scaledEnemyDamage,
    hitDamages,
    selfHeal: skillMult === 1 ? selfHeal : Math.round(selfHeal * skillMult),
    selfBuffsToApply,
    enemyDebuffsToApply,
    dotsToApplyToTarget,
    selfHpCost,
    selfBuffPctToApply,
    shieldToApply,
    selfRegenToApply,
    enemyVulnToApply,
    enemyEvasionDownToApply,
    enemyAccuracyDownToApply,
    selfHasteToApply,
    enemyDelayToApply,
    enemyHealReduceToApply,
    manaRestored: manaRestore,
  };
}

// 다단 스킬 로그용 — 엔진이 부스트(주문중첩·취약 등)를 적용한 최종 총합(boostedTotal)을
// 타당 raw 피해(rawHits) 비율로 정수 분배한다. 반환 합 == boostedTotal(반올림 누수 없음 —
// 마지막 칸이 나머지를 흡수). 엔진 HP 차감은 boostedTotal 단일값을 그대로 쓰고, 이 함수는
// 표시(로그 줄 쪼개기) 전용. rawHits 가 비었으면 [] (호출부에서 단일 라인으로 폴백).
export function distributeBoostedHits(
  rawHits: readonly number[],
  boostedTotal: number,
): number[] {
  const n = rawHits.length;
  if (n === 0) return [];
  if (n === 1) return [boostedTotal];
  const rawSum = rawHits.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let allocated = 0;
  if (rawSum <= 0) {
    // 퇴화(전부 0) — 균등 분배.
    const base = Math.floor(boostedTotal / n);
    for (let i = 0; i < n - 1; i += 1) {
      out.push(base);
      allocated += base;
    }
  } else {
    for (let i = 0; i < n - 1; i += 1) {
      const share = Math.floor((boostedTotal * rawHits[i]) / rawSum);
      out.push(share);
      allocated += share;
    }
  }
  out.push(boostedTotal - allocated); // 마지막 칸이 나머지 흡수 → 합 정확.
  return out;
}

// V2BuffMap 갱신 — selfBuff/enemyDebuff effect 의 결과를 stat 키에 박는다.
// 같은 stat 키에 새 entry 박히면 덮어쓰기 (refresh): pct/turns 새 값으로.
// turns 는 +1 박는다 — 다음 턴의 tickV2BuffMap 이 -1 하므로 정확히 N 턴 활성이 되려면 N+1 시드.
// (cd off-by-one 과 같은 패턴 — 매 player turn 진입 시 tick 후 cast/damage 계산.)
export function applyV2BuffsToMap(
  map: V2BuffMap,
  buffs: readonly V2SkillBuffApply[],
): V2BuffMap {
  if (buffs.length === 0) return map;
  const next: V2BuffMap = { ...map };
  for (const b of buffs) {
    next[b.stat] = { pct: b.pct, turns: b.turns + 1 };
  }
  return next;
}
