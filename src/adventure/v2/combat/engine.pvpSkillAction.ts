import { combatRandom } from "./combatRandom";
import { hasUnexploredEffect } from "./unexploredSetPveAdapter";
import { setSide } from "./engine.pvpSide";
import { advanceTurnPvP } from "./engine.pvpPhase";
import { scalePvPShield } from "./engine.pvpScaling";
import { castV2SkillOnAttackerTurnPvPBody } from "./engine.pvpSkills";
import { type PvPBattleState } from "./engine.pvpState";
import { chainDriveFollowUp, manaRedeployment } from "./unexploredSetEffects";
import { finishUnexploredActionPvP } from "./unexploredSetPvpAdapter";

export function castV2SkillOnAttackerTurnPvP(
  state: PvPBattleState, who: "p1" | "p2",
): Omit<ReturnType<typeof castV2SkillOnAttackerTurnPvPBody>, "directHit"> {
  const { directHit, ...result } = castV2SkillOnAttackerTurnPvPBody(state, who);
  let next = result.state;
  const target = who === "p1" ? "p2" : "p1";
  const actor = next[who];
  let chainExtraActions = 0;
  if (directHit && next.phase !== "ended" && next[target].hp > 0 && next[who].hp > 0 &&
    next[who].stacks.unexplored && !next[who].stacks.unexplored!.chainDriveResolving && hasUnexploredEffect(actor.player, "chain_drive")) {
    const followUp = chainDriveFollowUp({ eligibleDirectSkillHit: true, alreadyResolving: false,
      roll: combatRandom(), extraBasicAttackDamagePct: actor.player.extraBasicAttackDamagePct ?? 0 });
    if (followUp.fires) {
      const side = next[who];
      next = setSide(next, who, { ...side, stacks: { ...side.stacks, unexplored: { ...side.stacks.unexplored!, chainDriveResolving: true } } });
      const attacksBefore = side.attacksLeft;
      next = advanceTurnPvP(next, { kind: "attack" }, { tickDefenderDots: false,
        basicOrigin: "extra_basic", embeddedBasic: true, basicDamageMult: followUp.basicDamageMult });
      chainExtraActions = Math.max(0, next[who].attacksLeft - attacksBefore);
      const after = next[who];
      next = setSide(next, who, { ...after, stacks: { ...after.stacks, unexplored: { ...after.stacks.unexplored!, chainDriveResolving: false } } });
    }
  }
  if (result.castFired && next.phase === "ended") next = finishUnexploredActionPvP(next, who, target);
  const completedActor = next[who];
  if (result.castFired && completedActor.stacks.unexplored && hasUnexploredEffect(completedActor.player, "mana_redeployment")) {
    const deployment = manaRedeployment({ currentSkillCount: completedActor.stacks.unexplored.manaSkillCount,
      isSkill: true, currentShield: 0, maxHp: completedActor.maxHp });
    next = setSide(next, who, { ...completedActor, stacks: { ...completedActor.stacks,
      playerShield: Math.max(completedActor.stacks.playerShield, scalePvPShield(next, deployment.shield)),
      unexplored: { ...completedActor.stacks.unexplored, manaSkillCount: deployment.skillCount },
    } });
  }
  return { ...result, state: next, signatureExtraActions: result.signatureExtraActions + chainExtraActions };
}
