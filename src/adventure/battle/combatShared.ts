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

// ── v2 스킬 런타임 (PR-4a) ────────────────────────────────────────────────
// 새 v2 스탯 스킬 시스템 (v2_skill_*, V2_SKILLS) 의 전투 런타임 헬퍼. 옛 spells.ts
// 시스템과는 별개 — 두 시스템이 한 전투에서 동시에 돌아도 cooldowns/MP 풀은 공유한다
// (둘 다 PlayerCombat.maxMp 를 씀). PR-4a 는 framework only — 효과 적용은 PR-4b.

export type V2SkillCooldowns = Partial<Record<V2SkillId, number>>;

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

// v2 스킬 cast 한 번의 결과 (framework 만 — 효과 미적용).
//   - nextMp: MP 차감 후 잔량
//   - nextCooldowns: 이번에 cast 한 스킬의 cd 가 def.cooldown 으로 세팅된 맵
//   - castSkillId: 발동된 스킬 id (없으면 null)
//   - castSkillName: 로그용 (한글명, 없으면 null)
export type V2SkillCastResult = {
  nextMp: number;
  nextCooldowns: V2SkillCooldowns;
  castSkillId: V2SkillId | null;
  castSkillName: string | null;
};

export function resolveV2SkillCast(args: {
  skills: V2SkillsState;
  cooldowns: V2SkillCooldowns;
  mp: number;
}): V2SkillCastResult {
  // 1) cd tick.
  const ticked = tickV2SkillCooldowns(args.cooldowns);
  // 2) 발동 후보 선택.
  const id = pickAutoCastV2Skill({
    equipped: args.skills.equipped,
    cooldowns: ticked,
    mp: args.mp,
  });
  if (!id) {
    return {
      nextMp: args.mp,
      nextCooldowns: ticked,
      castSkillId: null,
      castSkillName: null,
    };
  }
  const def = V2_SKILLS[id];
  // 3) MP 차감 + cd 세팅. 효과 적용은 PR-4b.
  // cd=N → "발동 후 N턴 lockout" 의미. 다음 턴의 tick 이 -1 하므로 N+1 로 저장해야
  // 정확히 N턴 동안 cd>0 상태가 유지된다 (cast T1 → T2~Tn+1 lockout → Tn+2 재시전).
  return {
    nextMp: args.mp - def.mpCost,
    nextCooldowns: { ...ticked, [id]: def.cooldown + 1 },
    castSkillId: id,
    castSkillName: def.name,
  };
}
