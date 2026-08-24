import type {
  PvPBattleState,
  PvPSide,
} from "./engine-pvp";
import {
  applyV2DotsToTarget,
  makeBleedDot,
  makePoisonDot,
  v2DotPerStackDamage,
} from "./combatShared";
import {
  resolveTier6UniqueEvent,
  type Tier6UniqueCommand,
  type Tier6UniqueEvent,
} from "./tier6UniqueEffects";
import { finishBerserkerCurrentActionGuard } from "./berserkerCombat";
import {
  appendPvPSurvivalLogs,
  resolvePvPHostileDamageSurvival,
  type PvPHostileDamageSurvival,
} from "./pvpHostileDamage";

export type PvPSideKey = "p1" | "p2";

export function tier6PvpDotContext(target: PvPSide) {
  const summarize = (tag: "bleed" | "poison") => {
    const dots = target.v2Dots.filter(
      (dot) => dot.tag === tag && dot.turns > 0 && dot.stacks > 0,
    );
    return {
      stacks: dots.reduce((sum, dot) => sum + dot.stacks, 0),
      remainingDamage: dots.reduce(
        (sum, dot) =>
          sum +
          Math.floor(
            dot.stacks * v2DotPerStackDamage(dot, target.maxHp) * dot.turns,
          ),
        0,
      ),
    };
  };
  return { bleed: summarize("bleed"), poison: summarize("poison") };
}

export function tier6PvpStatusKindCount(
  attacker: PvPSide,
  target: PvPSide,
): number {
  let count = new Set(
    target.v2Dots
      .filter((dot) => dot.turns > 0 && dot.stacks > 0)
      .map((dot) => dot.tag),
  ).size;
  if (attacker.buffs.enemyDefDebuffTurnsLeft > 0) count += 1;
  if ((attacker.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0) count += 1;
  if (attacker.buffs.enemySpdTurnsLeft > 0) count += 1;
  return count;
}

export function applyTier6UniquePvpEvent(
  state: PvPBattleState,
  actorKey: PvPSideKey,
  targetKey: PvPSideKey,
  event: Tier6UniqueEvent,
): PvPBattleState {
  let actor = state[actorKey];
  let target = state[targetKey];
  if (!actor.stacks.tier6Uniques) return state;
  const resolved = resolveTier6UniqueEvent(
    actor.player.equipSignatures,
    actor.stacks.tier6Uniques,
    event,
  );
  actor = {
    ...actor,
    stacks: { ...actor.stacks, tier6Uniques: resolved.state },
  };
  let log = state.log;
  let finishTargetCurrentActionGuard = false;
  for (const command of resolved.commands) {
    const applied = applyCommand(actor, target, command);
    actor = applied.actor;
    target = applied.target;
    log = [
      ...log,
      {
        kind: "info",
        effect: command.kind === "damage_fixed" ? "extra_damage" : "status",
        text: `[${command.label}] ${pvpCommandText(command)}`,
        side: actorKey,
      },
    ];
    if (applied.survival) {
      log = appendPvPSurvivalLogs(
        { ...state, [actorKey]: actor, [targetKey]: target, log },
        targetKey,
        target.name,
        applied.survival,
      ).log;
      finishTargetCurrentActionGuard ||= applied.survival.berserkerTriggered;
    }
  }
  if (finishTargetCurrentActionGuard && target.berserker) {
    target = {
      ...target,
      berserker: finishBerserkerCurrentActionGuard(target.berserker),
    };
  }
  return { ...state, [actorKey]: actor, [targetKey]: target, log };
}

function applyCommand(
  actor: PvPSide,
  target: PvPSide,
  command: Tier6UniqueCommand,
): {
  actor: PvPSide;
  target: PvPSide;
  survival?: PvPHostileDamageSurvival;
} {
  if (command.kind === "damage_fixed") {
    const survival = resolvePvPHostileDamageSurvival(
      target,
      target.hp - command.amount,
    );
    return { actor, target: survival.side, survival };
  } else if (command.kind === "shield") {
    actor = {
      ...actor,
      stacks: {
        ...actor.stacks,
        playerShield: Math.max(0, actor.stacks.playerShield + command.amount),
      },
    };
  } else if (command.kind === "heal") {
    actor = { ...actor, hp: Math.min(actor.maxHp, actor.hp + command.amount) };
  } else if (command.kind === "mp") {
    actor = { ...actor, mp: Math.min(actor.maxMp, actor.mp + command.amount) };
  } else if (command.kind === "consume_dot") {
    target = { ...target, v2Dots: target.v2Dots.filter((dot) => dot.tag !== command.dot) };
  } else if (command.kind === "apply_dot") {
    const dot = command.dot === "bleed"
      ? makeBleedDot({
          stacks: command.stacks,
          flatPerStack: Math.max(1, Math.floor(actor.player.atk * 0.04)),
          sourceAtk: actor.player.atk,
        })
      : makePoisonDot({
          stacks: command.stacks,
          pctMaxHpPerStack: 0.004,
          sourceAtk: actor.player.atk,
        });
    target = { ...target, v2Dots: applyV2DotsToTarget(target.v2Dots, [dot]) };
  } else if (command.kind === "def_debuff") {
    actor = {
      ...actor,
      buffs: {
        ...actor.buffs,
        enemyDefDebuffPct: Math.max(
          actor.buffs.enemyDefDebuffTurnsLeft > 0
            ? actor.buffs.enemyDefDebuffPct
            : 0,
          command.pct,
        ),
        enemyDefDebuffTurnsLeft: Math.max(
          actor.buffs.enemyDefDebuffTurnsLeft,
          command.actions,
        ),
      },
    };
  } else if (command.kind === "mdef_debuff") {
    actor = {
      ...actor,
      buffs: {
        ...actor.buffs,
        enemyMagicDefDebuffPct: Math.max(
          (actor.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
            ? actor.buffs.enemyMagicDefDebuffPct ?? 0
            : 0,
          command.pct,
        ),
        enemyMagicDefDebuffTurnsLeft: Math.max(
          actor.buffs.enemyMagicDefDebuffTurnsLeft ?? 0,
          command.actions,
        ),
      },
    };
  } else if (command.kind === "extra_action") {
    actor = { ...actor, attacksLeft: actor.attacksLeft + 1 };
  } else if (command.kind === "unity_buff") {
    actor = {
      ...actor,
      buffs: {
        ...actor.buffs,
        playerAtkBuffPct: Math.max(
          actor.buffs.playerAtkBuffTurnsLeft > 0
            ? actor.buffs.playerAtkBuffPct
            : 0,
          command.attackPct,
        ),
        playerAtkBuffTurnsLeft: Math.max(
          actor.buffs.playerAtkBuffTurnsLeft,
          command.actions,
        ),
        tier6UnityHealPct: command.healPct,
        tier6UnityTurnsLeft: Math.max(
          actor.buffs.tier6UnityTurnsLeft ?? 0,
          command.actions,
        ),
      },
    };
  }
  return { actor, target };
}

function pvpCommandText(command: Tier6UniqueCommand): string {
  if (command.kind === "damage_fixed") return `${command.amount} 추가 피해`;
  if (command.kind === "shield") return `보호막 ${command.amount >= 0 ? "+" : ""}${command.amount}`;
  if (command.kind === "heal") return `HP +${command.amount}`;
  if (command.kind === "mp") return `MP +${command.amount}`;
  if (command.kind === "consume_dot") return `${command.dot} ${command.stacks}스택 소비`;
  if (command.kind === "apply_dot") return `${command.dot} ${command.stacks}스택 부여`;
  if (command.kind === "def_debuff") return `방어 ${command.pct}% 감소`;
  if (command.kind === "mdef_debuff") return `마법방어 ${command.pct}% 감소`;
  if (command.kind === "extra_action") return "추가 기본 공격 +1회";
  return `공격·회복 효율 +${command.attackPct}%`;
}
