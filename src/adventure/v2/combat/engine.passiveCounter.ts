import { combatRandom } from "./combatRandom";
import { type BattleState, type PlayerCombat } from "./engineState";
import { applyEnemyDamage, playerFacingEnemyDef } from "./engine.pveOperations";
import { appendLog } from "./engineSupport";
import { damageBetween, v2AtkBuffMult, v2DefBuffMult } from "./combatShared";
import { dreadnoughtCounterHit } from "./dreadnought";

// 피격 생존 반격 패시브 — enemyPhase 기본 공격뿐 아니라 몬스터 v2 스킬 피해에도 같은 조건으로 발동.
export function applyPassiveCounterOnHitIfAny(
  state: BattleState,
  player: PlayerCombat,
): BattleState {
  const pct = player.passiveCounterChancePct ?? 0;
  if (
    pct <= 0 ||
    state.playerHp <= 0 ||
    state.enemyHp <= 0 ||
    combatRandom() * 100 >= pct
  ) {
    return state;
  }

  const v2AtkMult = v2AtkBuffMult(state.v2SelfBuffs, state.v2SelfDebuffs);
  const v2DefMult = v2DefBuffMult(state.enemyV2SelfBuffs, state.enemyV2Debuffs);
  const counterDef = playerFacingEnemyDef(state, player);
  const counterBoostPct =
    player.passiveCounterDamageUsesReflectBoost &&
    state.stacks.skillReflectBoostTurns > 0
      ? state.stacks.skillReflectBoostPct
      : 0;
  const counterAtk =
    v2AtkMult !== 1 ? Math.floor(player.atk * v2AtkMult) : player.atk;
  const boostedCounterAtk =
    counterBoostPct > 0
      ? Math.floor(counterAtk * (1 + counterBoostPct / 100))
      : counterAtk;
  const counter = dreadnoughtCounterHit({
    state: state.stacks.dreadnought, impact: state.stacks.fortressImpact,
    gain: player.counterImpactGain, actionId: state.turn.enemyPhasesCompleted + 1, landed: true,
  });
  const dmg = Math.floor(counter.damageMult * damageBetween(
    boostedCounterAtk,
    v2DefMult !== 1 ? Math.floor(counterDef * v2DefMult) : counterDef,
  ));
  const damagedState = applyEnemyDamage(state, dmg);
  const enemyHp = damagedState.enemyHp;
  let next: BattleState = {
    ...damagedState,
    stacks: { ...damagedState.stacks, fortressImpact: counter.impact, ...(counter.state ? { dreadnought: counter.state } : {}) },
    enemyHp,
    log: appendLog(state.log, {
      kind: "player_attack",
      text: `[${counterBoostPct > 0 ? "반격 + 금강인" : "반격"}${counter.damageMult > 1 ? " + 시즈 브레이커" : ""}] ${state.enemy.name}에게 ${dmg} 반격 피해.`,
    }),
  };
  if (enemyHp <= 0) {
    next = {
      ...next,
      log: appendLog(next.log, {
        kind: "info",
        text: `${state.enemy.name}을(를) 쓰러뜨렸다!`,
      }),
      phase: "ended",
      outcome: "win",
    };
  }
  return next;
}

