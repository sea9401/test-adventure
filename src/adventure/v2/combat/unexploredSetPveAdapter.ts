import { type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import { type MagicBarrierDamageResult } from "./magicBarrier";
import { afterimageShield, crystalFocusStep, defenseAfterColossusCrush, frostMark, ironWallDefGain, precisionShotStep, revengeDamageMultiplier, revengePendingAfterAttack, shouldQueueRevenge, unyieldingDamage, type EnemyHitResolution, type UnexploredAttackContext } from "./unexploredSetEffects";

export function hasUnexploredEffect(
  player: PlayerCombat,
  kind: NonNullable<PlayerCombat["unexploredSetEffects"]>[number]["kind"],
): boolean {
  return player.unexploredSetEffects?.some(effect => effect.kind === kind) ?? false;
}

export function unyieldingDamagePve(
  state: BattleState, player: PlayerCombat, damage: number,
): number {
  return hasUnexploredEffect(player, "unyielding_dead")
    ? unyieldingDamage({ damage, hpBefore: state.playerHp, maxHp: state.playerMaxHp, eligibleKind: true })
    : damage;
}

export function recordUnexploredEnemyHit(
  state: BattleState, player: PlayerCombat, hit: EnemyHitResolution,
  shieldAfterAbsorption = state.stacks.playerShield,
): BattleState {
  const runtime = state.unexploredSetRuntime;
  if (!runtime || hit.fullyEvaded) return state;
  return {
    ...state,
    unexploredSetRuntime: {
      ...runtime,
      ironWallDefBonus: hasUnexploredEffect(player, "iron_wall")
        ? ironWallDefGain({
            hpDamage: hit.hpDamage,
            currentBonus: runtime.ironWallDefBonus,
            battleStartDef: runtime.battleStartDef,
          })
        : runtime.ironWallDefBonus,
      // Other shields absorb first; this pool is the last portion of the shared shield.
      afterimageShield: Math.min(runtime.afterimageShield, Math.max(0, shieldAfterAbsorption)),
      enemyActionHpDamage: runtime.enemyActionHpDamage + hit.hpDamage,
      evasionReducedThisEnemyAction: runtime.evasionReducedThisEnemyAction + hit.evasionPreventedDamage,
    },
  };
}

export function finishUnexploredEnemyAction(
  state: BattleState, player: PlayerCombat,
): BattleState {
  const runtime = state.unexploredSetRuntime;
  if (!runtime) return state;
  const shield = hasUnexploredEffect(player, "afterimage_coating")
    ? afterimageShield({
        evasionPreventedDamage: runtime.evasionReducedThisEnemyAction,
        currentShield: runtime.afterimageShield,
        maxHp: state.playerMaxHp,
      })
    : runtime.afterimageShield;
  const gain = shield - runtime.afterimageShield;
  return {
    ...state,
    stacks: gain > 0 ? { ...state.stacks, playerShield: state.stacks.playerShield + gain } : state.stacks,
    unexploredSetRuntime: {
      ...runtime,
      afterimageShield: shield,
      revengePending: runtime.revengePending || (
        hasUnexploredEffect(player, "battle_revenge") &&
        shouldQueueRevenge(runtime.enemyActionHpDamage, state.playerMaxHp)
      ),
      enemyActionHpDamage: 0,
      evasionReducedThisEnemyAction: 0,
    },
    log: gain > 0 ? appendLog(state.log, {
      kind: "info", turn: "enemy", text: `[허상 피막] 보호막 +${gain}`,
    }) : state.log,
  };
}

export function recordUnexploredEnemySkillHits(
  state: BattleState, player: PlayerCombat,
  hits: EnemyHitResolution[], actualHpDamage: number,
): BattleState {
  let remainingHpDamage = actualHpDamage;
  for (const hit of hits) {
    const hpDamage = Math.min(remainingHpDamage, hit.hpDamage);
    remainingHpDamage -= hpDamage;
    state = recordUnexploredEnemyHit(state, player, { ...hit, hpDamage });
  }
  return finishUnexploredEnemyAction(state, player);
}

export function sumMagicBarrierDamage(previous: MagicBarrierDamageResult, next: MagicBarrierDamageResult): MagicBarrierDamageResult {
  return {
    ...next,
    bodyRawDamage: previous.bodyRawDamage + next.bodyRawDamage,
    absorbedDamage: previous.absorbedDamage + next.absorbedDamage,
    spillDamage: previous.spillDamage + next.spillDamage,
    durabilitySpent: previous.durabilitySpent + next.durabilitySpent,
    destroyed: previous.destroyed || next.destroyed,
    mitigatedBodyDamage: previous.mitigatedBodyDamage + next.mitigatedBodyDamage,
    hpBoundDamage: previous.hpBoundDamage + next.hpBoundDamage,
  };
}

export function beginUnexploredPlayerAttack(
  state: BattleState, player: PlayerCombat,
  kind: UnexploredAttackContext["kind"], mpActuallySpent = 0,
): { state: BattleState; context: UnexploredAttackContext; damageMult: number; ignoreNormalMiss: boolean } {
  const context: UnexploredAttackContext = {
    kind, mpActuallySpent, hit: false, anyCrit: false, multiHitIndex: 0, multiHitCount: 1,
  };
  const runtime = state.unexploredSetRuntime;
  if (!runtime) return { state, context, damageMult: 1, ignoreNormalMiss: false };
  const crystal = crystalFocusStep({
    count: runtime.paidDirectSkillCount,
    isPaidDirectSkill: hasUnexploredEffect(player, "crystal_focus") && kind === "direct_skill" && mpActuallySpent > 0,
  });
  const precision = precisionShotStep({
    count: runtime.manualBasicAttackCount,
    isManualBasic: hasUnexploredEffect(player, "precision_shot") && kind === "manual_basic",
  });
  return {
    state: { ...state, unexploredSetRuntime: { ...runtime,
      paidDirectSkillCount: crystal.count, manualBasicAttackCount: precision.count,
    } },
    context,
    damageMult: crystal.damageMult * precision.damageMult * revengeDamageMultiplier({
      pending: hasUnexploredEffect(player, "battle_revenge") && runtime.revengePending, context,
    }),
    // PvE currently has no ordinary miss roll. This must never bypass damage mitigation.
    ignoreNormalMiss: precision.ignoreNormalMiss,
  };
}

export function finishUnexploredPlayerAttack(
  state: BattleState, player: PlayerCombat, context: UnexploredAttackContext, hpDamage: number,
): BattleState {
  const runtime = state.unexploredSetRuntime;
  if (!runtime) return state;
  const mark = frostMark({
    eligibleCrit: hasUnexploredEffect(player, "frost_mark") && context.hit && context.anyCrit &&
      (context.kind === "manual_basic" || context.kind === "direct_skill"),
    freezingLock: hasUnexploredEffect(player, "freezing_lock"),
  });
  return {
    ...state,
    unexploredSetRuntime: {
      ...runtime,
      revengePending: revengePendingAfterAttack({ pending: runtime.revengePending, context, hpDamage }),
      ...(mark ? { frost: mark } : {}),
    },
    log: mark ? appendLog(state.log, { kind: "info", turn: "player",
      text: `[서리 표식] 속도 −${mark.speedReductionPct}%${mark.accuracyPenalty ? ` · 적중도 −${mark.accuracyPenalty}` : ""} (적 행동 2회)`,
    }) : state.log,
  };
}

export function finishUnexploredFrostEnemyAction(state: BattleState): BattleState {
  const runtime = state.unexploredSetRuntime;
  if (!runtime?.frost || runtime.frost.actions <= 0) return state;
  return { ...state, unexploredSetRuntime: { ...runtime,
    frost: { ...runtime.frost, actions: runtime.frost.actions - 1 },
  } };
}

export function unexploredDefensePve(
  defense: number, player: PlayerCombat, context: UnexploredAttackContext,
): number {
  return hasUnexploredEffect(player, "colossus_crush")
    ? defenseAfterColossusCrush({ defense, context }) : defense;
}
