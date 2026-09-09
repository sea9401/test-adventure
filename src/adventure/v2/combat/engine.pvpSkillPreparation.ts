import { type PvPBattleState } from "./engine.pvpState";
import { type UnexploredAttackContext } from "./unexploredSetEffects";
import { setSide } from "./engine.pvpSide";
import { preparePvPSkillCast } from "./engine.pvpSkillInput";
import { unexploredDefensePvP } from "./unexploredSetPvpAdapter";

export function beginPvPSkillCast(state: PvPBattleState, who: "p1" | "p2") {
  const sideStart = state[who];
  const otherKey: "p1" | "p2" = who === "p1" ? "p2" : "p1";
  let st = state;
  const preLog = state.log;
  st = setSide({ ...st, log: preLog }, who, sideStart);
  const side = st[who];
  const opp = st[otherKey];
  const directContext: UnexploredAttackContext = { kind: "direct_skill", mpActuallySpent: 0, hit: false, anyCrit: false, multiHitIndex: 0, multiHitCount: 1 };
  const {
    tier6UnityMult,
    tier6UnityMagicAtk,
    tickedSelfBuffs,
    tickedSelfDebuffs,
    shadowCoreEquipped,
    shadowCoreMechanic,
    formulaCoreEquipped,
    formulaOptimizationEquipped,
    formulaState,
    castInput,
  } = preparePvPSkillCast(side, opp, who);
  castInput.target.def = unexploredDefensePvP(castInput.target.def, side, directContext);
  castInput.target.magicDef = unexploredDefensePvP(castInput.target.magicDef ?? castInput.target.def, side, directContext);
  return { st, side, opp, otherKey, tier6UnityMult, tier6UnityMagicAtk, tickedSelfBuffs, tickedSelfDebuffs, shadowCoreEquipped, shadowCoreMechanic, formulaCoreEquipped, formulaOptimizationEquipped, formulaState, castInput };
}
