import type {
  V2BerserkerCastContext,
  V2BerserkerCastTransition,
} from "./combatShared";

export type BerserkerMadnessRank = 0 | 1 | 2 | 3 | 4;
export type BerserkerCombatState = {
  finisherReady: boolean;
  deathOvercomeUsed: boolean;
  deathDamageReady: boolean;
  hpFloor: number;
  guardUntil: "none" | "current_action_end" | "player_attack_end";
  annihilationUsesRemaining: number;
};

export function initialBerserkerCombatState(): BerserkerCombatState {
  return {
    finisherReady: false,
    deathOvercomeUsed: false,
    deathDamageReady: false,
    hpFloor: 0,
    guardUntil: "none",
    annihilationUsesRemaining: 1,
  };
}

export function berserkerCastContext(
  madnessRank: BerserkerMadnessRank,
  state: BerserkerCombatState,
): V2BerserkerCastContext {
  return {
    madnessRank,
    finisherReady: state.finisherReady,
    deathDamageReady: state.deathDamageReady,
    annihilationUsesRemaining: state.annihilationUsesRemaining,
  };
}

export function applyBerserkerCastTransition(
  state: BerserkerCombatState,
  transition: V2BerserkerCastTransition,
): BerserkerCombatState {
  return {
    ...state,
    finisherReady:
      transition.grantFinisher ||
      (state.finisherReady && !transition.consumeFinisher),
    deathDamageReady:
      state.deathDamageReady && !transition.consumeDeathDamage,
    annihilationUsesRemaining: transition.consumeAnnihilationUse
      ? Math.max(0, state.annihilationUsesRemaining - 1)
      : state.annihilationUsesRemaining,
  };
}

export function applyBerserkerLethalDamage(args: {
  state: BerserkerCombatState;
  madnessRank: BerserkerMadnessRank;
  hp: number;
  maxHp: number;
  source: "hostile" | "voluntary";
}): {
  state: BerserkerCombatState;
  hp: number;
  triggered: boolean;
  deferToGenericEndurance: boolean;
} {
  if (args.hp > 0) {
    return {
      state: args.state,
      hp: args.hp,
      triggered: false,
      deferToGenericEndurance: false,
    };
  }
  if (args.source === "voluntary") {
    return {
      state: args.state,
      hp: args.hp,
      triggered: false,
      deferToGenericEndurance: false,
    };
  }
  if (args.madnessRank < 3 || args.state.deathOvercomeUsed) {
    return {
      state: args.state,
      hp: args.hp,
      triggered: false,
      deferToGenericEndurance: true,
    };
  }

  const dominion = args.madnessRank >= 4;
  const restoredHp = Math.max(
    1,
    Math.floor(Math.max(1, args.maxHp) * (dominion ? 0.4 : 0.2)),
  );
  return {
    hp: restoredHp,
    triggered: true,
    deferToGenericEndurance: false,
    state: {
      ...args.state,
      deathOvercomeUsed: true,
      deathDamageReady: dominion,
      hpFloor: restoredHp,
      guardUntil: dominion ? "player_attack_end" : "current_action_end",
      annihilationUsesRemaining: dominion
        ? Math.min(2, args.state.annihilationUsesRemaining + 1)
        : args.state.annihilationUsesRemaining,
    },
  };
}

export function clampBerserkerGuardedHp(
  state: BerserkerCombatState,
  hp: number,
): number {
  return state.guardUntil === "none" ? hp : Math.max(state.hpFloor, hp);
}

export function finishBerserkerCurrentActionGuard(
  state: BerserkerCombatState,
): BerserkerCombatState {
  return state.guardUntil === "current_action_end"
    ? { ...state, hpFloor: 0, guardUntil: "none" }
    : state;
}

export function finishBerserkerPlayerAttack(
  state: BerserkerCombatState,
): BerserkerCombatState {
  return {
    ...state,
    deathDamageReady: false,
    ...(state.guardUntil === "player_attack_end"
      ? { hpFloor: 0, guardUntil: "none" as const }
      : {}),
  };
}
