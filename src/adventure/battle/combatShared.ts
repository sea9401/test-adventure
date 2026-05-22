// 두 전투 엔진(engine.ts = PvE, engine-pvp.ts = PvP)이 공유하는 순수 헬퍼.
//
// 두 엔진은 데이터 모델이 다르다 — PvE 는 비대칭(player vs enemy), PvP 는 대칭(side vs side).
// 그래서 턴 상태머신·데미지 계산은 각자 갖되, 모델과 무관한 순수 계산은 여기 한 곳에 둔다.
// 한쪽만 고쳐 둘이 어긋나는 divergence(예: 추가공격 롤이 PvP 에서만 +1 로 막혀 있던 버그)를 막기 위함.
//
// PlayerCombat 은 engine.ts 에서 정의 — type-only import 라 런타임 순환참조 없음(타입은 소거).

import { computeHealAmount, type Potion } from "../data/potions";
import type { APSkill, APSkillEffect } from "../character/apSkills";
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
