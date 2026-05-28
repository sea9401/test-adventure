// 두 전투 엔진(engine.ts = PvE, engine-pvp.ts = PvP)이 공유하는 순수 헬퍼.
//
// 두 엔진은 데이터 모델이 다르다 — PvE 는 비대칭(player vs enemy), PvP 는 대칭(side vs side).
// 그래서 턴 상태머신·데미지 계산은 각자 갖되, 모델과 무관한 순수 계산은 여기 한 곳에 둔다.
// 한쪽만 고쳐 둘이 어긋나는 divergence(예: 추가공격 롤이 PvP 에서만 +1 로 막혀 있던 버그)를 막기 위함.
//
// PlayerCombat 은 engine.ts 에서 정의 — type-only import 라 런타임 순환참조 없음(타입은 소거).

import { computeHealAmount, type Potion } from "../data/potions";
import type { APSkill, APSkillEffect } from "../character/apSkills";
import {
  V2_SKILLS,
  type V2SkillId,
  type V2SkillsState,
} from "../data/v2/v2Skills";
import type { StatKey } from "../data/stats";
import type { EquippedAPSkill, PlayerCombat } from "./engine";

export const AP_SKILLS_PER_TURN_CAP = 3;

type ApSkillSelectionState = {
  canFireApSkill: (equipped: EquippedAPSkill) => boolean;
};

export function isOffensiveApEffect(effect: APSkillEffect): boolean {
  return (
    effect.kind === "atk_multiplier" ||
    effect.kind === "multi_hit_self_damage" ||
    effect.kind === "atk_multiplier_with_silence" ||
    effect.kind === "atk_plus_spd_pct_bonus"
  );
}

export function selectApSkillsToFire(
  equipped: ReadonlyArray<EquippedAPSkill>,
  state: ApSkillSelectionState,
  budgetAp: number,
): { offensive: EquippedAPSkill | null; utilities: EquippedAPSkill[]; totalCost: number } {
  let remainingAp = budgetAp;
  let offensive: EquippedAPSkill | null = null;
  const utilities: EquippedAPSkill[] = [];
  let count = 0;

  for (const e of equipped) {
    if (count >= AP_SKILLS_PER_TURN_CAP) break;
    const skill: APSkill = e.skill;
    if (skill.apCost > remainingAp) continue;
    if (!state.canFireApSkill(e)) continue;

    const isOffensive = isOffensiveApEffect(skill.effect);
    if (isOffensive && offensive) continue;

    if (isOffensive) offensive = e;
    else utilities.push(e);
    remainingAp -= skill.apCost;
    count += 1;
  }

  return { offensive, utilities, totalCost: budgetAp - remainingAp };
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
const V2_ATK_STATS: readonly StatKey[] = ["str", "dex", "spd", "luk"];
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

// v2 스킬 damage 계산. statCoef × attackerAtk × v2AtkBuffMult + baseFlat 을 raw atk 로,
// 적 def 에 v2DefBuffMult(target) 곱 후 damageBetween. 일반 공격과 같은 경로(DEF 적용).
//   - attackerSelfBuffs / attackerSelfDebuffs: 공격자 측 (atk 기여 stat 전부 합산)
//   - targetSelfBuffs / targetSelfDebuffs: 방어자 측 (vit 만 def 에 영향)
export function v2DamageAmount(args: {
  attackerAtk: number;
  targetDef: number;
  statCoef: number;
  baseFlat: number;
  attackerSelfBuffs: V2BuffMap;
  attackerSelfDebuffs: V2BuffMap;
  targetSelfBuffs: V2BuffMap;
  targetSelfDebuffs: V2BuffMap;
}): number {
  const atkMult = v2AtkBuffMult(args.attackerSelfBuffs, args.attackerSelfDebuffs);
  const defMult = v2DefBuffMult(args.targetSelfBuffs, args.targetSelfDebuffs);
  const rawAtk = Math.floor(args.attackerAtk * atkMult * args.statCoef) + args.baseFlat;
  const effectiveDef = Math.floor(args.targetDef * defMult);
  // 일반 공격과 같은 경로 — damageBetween 식 (atk - def, 1 하한).
  return Math.max(1, rawAtk - effectiveDef);
}

// v2 스킬 heal 계산. pctMaxHp × maxHp / 100 + flat (caller 가 maxHp 클램프).
export function v2HealAmount(args: {
  attackerMaxHp: number;
  pctMaxHp: number;
  flat: number;
}): number {
  const pctPart = Math.floor((args.attackerMaxHp * args.pctMaxHp) / 100);
  return Math.max(0, pctPart + args.flat);
}

// PR-5b — monster.v2MaxMp 미지정 시 자동 시드. equipped 중 max mpCost × 3 → 약 3-5 회 cast.
// 0 = equipped 비어 cast 불가능. monster 데이터 작성 부담 줄이는 default.
export function defaultV2MaxMpFor(skills: V2SkillsState): number {
  if (skills.equipped.length === 0) return 0;
  let maxCost = 0;
  for (const id of skills.equipped) {
    const cost = V2_SKILLS[id]?.mpCost ?? 0;
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
    if (args.mp < def.mpCost) continue;
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
export type V2SkillBuffApply = { stat: StatKey; pct: number; turns: number };
export type V2SkillCastResult = {
  nextMp: number;
  nextCooldowns: V2SkillCooldowns;
  castSkillId: V2SkillId | null;
  castSkillName: string | null;
  enemyDamage: number;
  selfHeal: number;
  selfBuffsToApply: V2SkillBuffApply[];
  enemyDebuffsToApply: V2SkillBuffApply[];
};

// PR-4b — attacker/target ctx 로 묶음. PR-4a 의 단순 mp/cd 입력에서 확장.
export type V2SkillCastInput = {
  skills: V2SkillsState;
  cooldowns: V2SkillCooldowns;
  attacker: {
    mp: number;
    atk: number;
    maxHp: number;
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
  };
  target: {
    def: number;
    // PR-5a: target buff/debuff 둘 다 필요 — target.vit buff 가 def 증폭, vit debuff 가 def 감소.
    selfBuffs: V2BuffMap;
    selfDebuffs: V2BuffMap;
  };
};

const EMPTY_CAST_RESULT_BASE = {
  enemyDamage: 0,
  selfHeal: 0,
  selfBuffsToApply: [] as V2SkillBuffApply[],
  enemyDebuffsToApply: [] as V2SkillBuffApply[],
};

export function resolveV2SkillCast(input: V2SkillCastInput): V2SkillCastResult {
  // 1) cd tick.
  const ticked = tickV2SkillCooldowns(input.cooldowns);
  // 2) 발동 후보 선택.
  const id = pickAutoCastV2Skill({
    equipped: input.skills.equipped,
    cooldowns: ticked,
    mp: input.attacker.mp,
  });
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
  // 3) effect 별 결과 누산.
  let enemyDamage = 0;
  let selfHeal = 0;
  const selfBuffsToApply: V2SkillBuffApply[] = [];
  const enemyDebuffsToApply: V2SkillBuffApply[] = [];
  for (const effect of def.effects) {
    if (effect.kind === "damage") {
      enemyDamage += v2DamageAmount({
        attackerAtk: input.attacker.atk,
        targetDef: input.target.def,
        statCoef: effect.statCoef,
        baseFlat: effect.baseFlat ?? 0,
        attackerSelfBuffs: input.attacker.selfBuffs,
        attackerSelfDebuffs: input.attacker.selfDebuffs,
        targetSelfBuffs: input.target.selfBuffs,
        targetSelfDebuffs: input.target.selfDebuffs,
      });
    } else if (effect.kind === "heal") {
      selfHeal += v2HealAmount({
        attackerMaxHp: input.attacker.maxHp,
        pctMaxHp: effect.pctMaxHp ?? 0,
        flat: effect.flat ?? 0,
      });
    } else if (effect.kind === "selfBuff") {
      selfBuffsToApply.push({
        stat: effect.stat,
        pct: effect.pct,
        turns: effect.turns,
      });
    } else if (effect.kind === "enemyDebuff") {
      enemyDebuffsToApply.push({
        stat: effect.stat,
        pct: effect.pct,
        turns: effect.turns,
      });
    }
  }
  // 4) MP 차감 + cd 세팅 (cd=N → N+1 저장으로 다음 tick 후 정확히 N 유지).
  return {
    nextMp: input.attacker.mp - def.mpCost,
    nextCooldowns: { ...ticked, [id]: def.cooldown + 1 },
    castSkillId: id,
    castSkillName: def.name,
    enemyDamage,
    selfHeal,
    selfBuffsToApply,
    enemyDebuffsToApply,
  };
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
