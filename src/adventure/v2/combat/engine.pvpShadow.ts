import type { PvPBattleState } from "./engine.pvpState";
import { setSide } from "./engine.pvpSide";
import { appendLog } from "./engineSupport";
import { recordCombatDamage } from "./combatDiagnostics";
import { releaseSwordShadow } from "./shadowBladeCombat";
import { recordChargeHpLoss } from "./ruinBladeCombat";
import { resolvePvPHostileDamageSurvival, appendPvPSurvivalLogs } from "./pvpHostileDamage";

export function releaseSwordShadowAfterPvPAction(
  state: PvPBattleState,
  actorKey: "p1" | "p2",
  shadowOwnerKey: "p1" | "p2",
): PvPBattleState {
  const owner = state[shadowOwnerKey];
  const swordShadow = owner.stacks.tier7?.swordShadow;
  if (!swordShadow) return state;
  const actor = state[actorKey];
  const released = releaseSwordShadow(swordShadow, {
    nextSingleDamagePct: 12,
  });
  const shieldAbsorbed = Math.min(
    actor.stacks.playerShield,
    released.damage,
  );
  const hpDamage = Math.min(
    actor.hp,
    Math.max(0, released.damage - shieldAbsorbed),
  );
  recordCombatDamage("sword_shadow", actorKey, actor.hp, Math.max(0, released.damage - shieldAbsorbed), shieldAbsorbed);
  const survival = resolvePvPHostileDamageSurvival(
    {
      ...actor,
      stacks: {
        ...actor.stacks,
        playerShield: actor.stacks.playerShield - shieldAbsorbed,
      },
    },
    actor.hp - hpDamage,
    actorKey,
  );
  const actorTier7 = survival.side.stacks.tier7?.ruinCharge
    ? {
        ...survival.side.stacks.tier7,
        ruinCharge: {
          ...recordChargeHpLoss(
            survival.side.stacks.tier7.ruinCharge,
            hpDamage,
          ),
          deathBypassTriggered:
            survival.side.stacks.tier7.ruinCharge.deathBypassTriggered ||
            survival.berserkerTriggered,
        },
      }
    : survival.side.stacks.tier7;
  let next = setSide(state, actorKey, {
    ...survival.side,
    stacks: {
      ...survival.side.stacks,
      ...(actorTier7 ? { tier7: actorTier7 } : {}),
    },
  });
  next = setSide(next, shadowOwnerKey, {
    ...owner,
    stacks: {
      ...owner.stacks,
      tier7: {
        ...owner.stacks.tier7,
        swordShadow: undefined,
        shadowFollowUpPct: released.followUpPct,
        shadowReleaseHastePct: swordShadow.refined ? 20 : 0,
      },
    },
  });
  next = {
    ...next,
    log: appendLog(next.log, {
      kind: "player_attack",
      text: `[검영] ${actor.name}에게 ${released.damage} 지연 피해${shieldAbsorbed > 0 ? ` (보호막 ${shieldAbsorbed} 흡수)` : ""}.`,
      side: shadowOwnerKey,
    }),
  };
  next = appendPvPSurvivalLogs(next, actorKey, actor.name, survival);
  const p1Dead = next.p1.hp <= 0;
  const p2Dead = next.p2.hp <= 0;
  if (!p1Dead && !p2Dead) {
    return state.phase === "ended"
      ? { ...next, phase: actorKey, outcome: null }
      : next;
  }
  return {
    ...next,
    phase: "ended",
    outcome: p1Dead && p2Dead ? "draw" : p1Dead ? "p2_win" : "p1_win",
  };
}
