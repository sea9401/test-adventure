import { healingAfterBurn } from "./burnHealing";
import { hasUnexploredEffect } from "./unexploredSetPveAdapter";
import { type PvPSide } from "./engine.pvpState";
import { setSide } from "./engine.pvpSide";
import { scalePvPHealing, scalePvPShield } from "./engine.pvpScaling";
import { type PvPBattleState } from "./engine.pvpState";
import { appendLog } from "./engineSupport";
import { mergeFrostChillSnapshot } from "./frostChill";
import { playerResourceSnapshot } from "./playerResourceSnapshot";
import { afterimageShield, colonyRegeneration, crystalFocusStep, defenseAfterColossusCrush, frostMark, ironWallDefGain, precisionShotStep, revengeDamageMultiplier, revengePendingAfterAttack, shouldQueueRevenge, unexploredResourceSnapshot, unyieldingDamage, type EnemyHitResolution, type UnexploredAttackContext } from "./unexploredSetEffects";

export function pvpSideResourceSnapshot(side: PvPSide): Record<string, number | string> | undefined {
  const existing = mergeFrostChillSnapshot(playerResourceSnapshot(side.stacks), side.stacks.frostChillStacks);
  const unexplored = unexploredResourceSnapshot(side.stacks.unexplored, side.unexploredDebuffs);
  return unexplored ? { ...existing, ...unexplored } : existing;
}

export function unexploredDefensePvP(defense: number, attacker: PvPSide, context: UnexploredAttackContext): number {
  return hasUnexploredEffect(attacker.player, "colossus_crush")
    ? defenseAfterColossusCrush({ defense, context }) : defense;
}

export function beginUnexploredAttackPvP(
  state: PvPBattleState, actor: "p1" | "p2", kind: UnexploredAttackContext["kind"], mpActuallySpent = 0,
): { state: PvPBattleState; context: UnexploredAttackContext; damageMult: number } {
  const context: UnexploredAttackContext = { kind, mpActuallySpent, hit: false, anyCrit: false, multiHitIndex: 0, multiHitCount: 1 };
  const side = state[actor];
  const runtime = side.stacks.unexplored;
  if (!runtime) return { state, context, damageMult: 1 };
  const crystal = crystalFocusStep({ count: runtime.paidDirectSkillCount,
    isPaidDirectSkill: hasUnexploredEffect(side.player, "crystal_focus") && kind === "direct_skill" && mpActuallySpent > 0 });
  const precision = precisionShotStep({ count: runtime.manualBasicAttackCount,
    isManualBasic: hasUnexploredEffect(side.player, "precision_shot") && kind === "manual_basic" });
  return {
    state: setSide(state, actor, { ...side, stacks: { ...side.stacks, unexplored: {
      ...runtime, paidDirectSkillCount: crystal.count, manualBasicAttackCount: precision.count,
    } } }), context,
    // PvP has deterministic ordinary evasion reduction; precision never bypasses it or full evades.
    damageMult: crystal.damageMult * precision.damageMult * revengeDamageMultiplier({
      pending: hasUnexploredEffect(side.player, "battle_revenge") && runtime.revengePending, context,
    }),
  };
}

export function applyUnexploredFrostMarkPvP(
  state: PvPBattleState, attacker: "p1" | "p2", defender: "p1" | "p2",
): PvPBattleState {
  const player = state[attacker].player;
  const mark = frostMark({ eligibleCrit: hasUnexploredEffect(player, "frost_mark"), freezingLock: hasUnexploredEffect(player, "freezing_lock") });
  if (!mark) return state;
  return setSide({ ...state, log: appendLog(state.log, {
    kind: "info", side: attacker,
    text: `[서리 표식] ${state[defender].name} 속도 −${mark.speedReductionPct}%${mark.accuracyPenalty ? ` · 적중도 −${mark.accuracyPenalty}` : ""} (대상 행동 2회)`,
  }) }, defender, { ...state[defender], unexploredDebuffs: {
    frostActions: mark.actions, speedReductionPct: mark.speedReductionPct, accuracyPenalty: mark.accuracyPenalty,
  } });
}

export function tickUnexploredDebuffs(state: PvPBattleState, actor: "p1" | "p2"): PvPBattleState {
  const side = state[actor];
  if (!side.unexploredDebuffs) return state;
  const { unexploredDebuffs, ...rest } = side;
  return setSide(state, actor, unexploredDebuffs.frostActions <= 1 ? rest : {
    ...side, unexploredDebuffs: { ...unexploredDebuffs, frostActions: unexploredDebuffs.frostActions - 1 },
  });
}

export function finishUnexploredAttackPvP(
  state: PvPBattleState, actor: "p1" | "p2", target: "p1" | "p2", context: UnexploredAttackContext, hpDamage: number,
): PvPBattleState {
  const side = state[actor];
  const runtime = side.stacks.unexplored;
  if (!runtime) return state;
  state = setSide(state, actor, { ...side, stacks: { ...side.stacks, unexplored: {
    ...runtime, revengePending: revengePendingAfterAttack({ pending: runtime.revengePending, context, hpDamage }),
  } } });
  return context.hit && context.anyCrit && (context.kind === "manual_basic" || context.kind === "direct_skill")
    ? applyUnexploredFrostMarkPvP(state, actor, target) : state;
}

export function unyieldingDamagePvP(side: PvPSide, damage: number, hpBefore = side.hp): number {
  return hasUnexploredEffect(side.player, "unyielding_dead")
    ? unyieldingDamage({ damage, hpBefore, maxHp: side.maxHp, eligibleKind: true }) : damage;
}

export function recordUnexploredHitPvP(side: PvPSide, hit: EnemyHitResolution): PvPSide {
  const runtime = side.stacks.unexplored;
  if (!runtime || hit.fullyEvaded) return side;
  return { ...side, stacks: { ...side.stacks, unexplored: {
    ...runtime,
    ironWallDefBonus: hasUnexploredEffect(side.player, "iron_wall")
      ? ironWallDefGain({ hpDamage: hit.hpDamage, currentBonus: runtime.ironWallDefBonus, battleStartDef: runtime.battleStartDef })
      : runtime.ironWallDefBonus,
    enemyActionHpDamage: runtime.enemyActionHpDamage + hit.hpDamage,
    evasionReducedThisEnemyAction: runtime.evasionReducedThisEnemyAction + hit.evasionPreventedDamage,
  } } };
}

export function finishUnexploredActionPvP(
  state: PvPBattleState, actor: "p1" | "p2", target: "p1" | "p2", successful = true,
): PvPBattleState {
  const defender = state[target];
  const runtime = defender.stacks.unexplored;
  if (runtime) {
    const remaining = Math.min(runtime.afterimageShield, defender.stacks.playerShield);
    const scaledCap = scalePvPShield(state, Math.floor(runtime.battleStartMaxHp * 0.03));
    const rawGain = afterimageShield({ evasionPreventedDamage: runtime.evasionReducedThisEnemyAction, currentShield: 0, maxHp: runtime.battleStartMaxHp });
    const shield = hasUnexploredEffect(defender.player, "afterimage_coating")
      ? Math.min(scaledCap, remaining + scalePvPShield(state, rawGain)) : remaining;
    const gain = shield - remaining;
    state = setSide(state, target, { ...defender, stacks: { ...defender.stacks,
      playerShield: defender.stacks.playerShield + gain,
      unexplored: { ...runtime, afterimageShield: shield,
        revengePending: runtime.revengePending || (hasUnexploredEffect(defender.player, "battle_revenge") && shouldQueueRevenge(runtime.enemyActionHpDamage, runtime.battleStartMaxHp)),
        enemyActionHpDamage: 0, evasionReducedThisEnemyAction: 0,
      },
    } });
    if (gain > 0) state = { ...state, log: appendLog(state.log, { kind: "info", side: target, text: `[허상 피막] ${defender.name} 보호막 +${gain}` }) };
  }
  const side = state[actor];
  if (successful && hasUnexploredEffect(side.player, "colony_regeneration")) {
    const amount = scalePvPHealing(state, healingAfterBurn(colonyRegeneration({
      hp: side.hp, maxHp: side.maxHp, receivedHealMult: side.player.receivedHealMult ?? 1,
    }), side.v2Dots, side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0));
    if (amount > 0) state = setSide({ ...state, log: appendLog(state.log, {
      kind: "info", side: actor, text: `[군체 재생] ${side.name} HP +${amount}`,
    }) }, actor, { ...side, hp: Math.min(side.maxHp, side.hp + amount) });
  }
  return tickUnexploredDebuffs(state, actor);
}
