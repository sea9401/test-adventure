import type { PlayerCombat } from "./engineState";
import type { BattleState } from "./engineState";
import {
  applyV2DotsToTarget,
  makeBleedDot,
  makePoisonDot,
  v2DotPerStackDamage,
} from "./combatShared";
import {
  initialTier6UniqueRuntime,
  resolveTier6UniqueEvent,
  type Tier6UniqueCommand,
  type Tier6UniqueEvent,
} from "./tier6UniqueEffects";

export function tier6DotContext(state: BattleState) {
  const summarize = (tag: "bleed" | "poison") => {
    const dots = state.enemyV2Dots.filter(
      (dot) => dot.tag === tag && dot.turns > 0 && dot.stacks > 0,
    );
    return {
      stacks: dots.reduce((sum, dot) => sum + dot.stacks, 0),
      remainingDamage: dots.reduce(
        (sum, dot) =>
          sum +
          Math.floor(
            dot.stacks *
              v2DotPerStackDamage(dot, state.enemy.hp) *
              dot.turns,
          ),
        0,
      ),
    };
  };
  return { bleed: summarize("bleed"), poison: summarize("poison") };
}

export function tier6StatusKindCount(state: BattleState): number {
  let count = new Set(
    state.enemyV2Dots
      .filter((dot) => dot.turns > 0 && dot.stacks > 0)
      .map((dot) => dot.tag),
  ).size;
  if (state.buffs.enemyDefDebuffTurnsLeft > 0) count += 1;
  if ((state.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0) count += 1;
  if (state.buffs.enemySpdTurnsLeft > 0) count += 1;
  return count;
}

export function applyTier6UniquePveEvent(
  state: BattleState,
  player: PlayerCombat,
  event: Tier6UniqueEvent,
): BattleState {
  if (!state.stacks.tier6Uniques) return state;
  const resolved = resolveTier6UniqueEvent(
    player.equipSignatures,
    state.stacks.tier6Uniques,
    event,
  );
  let next: BattleState = {
    ...state,
    stacks: { ...state.stacks, tier6Uniques: resolved.state },
  };
  for (const command of resolved.commands) {
    next = applyCommand(next, player, command);
  }
  return next;
}

function applyCommand(
  state: BattleState,
  player: PlayerCombat,
  command: Tier6UniqueCommand,
): BattleState {
  const effect = command.kind === "damage_fixed" ? "extra_damage" : "status";
  let next = state;
  if (command.kind === "damage_fixed") {
    next = { ...next, enemyHp: Math.max(0, next.enemyHp - command.amount) };
  } else if (command.kind === "shield") {
    next = {
      ...next,
      stacks: {
        ...next.stacks,
        playerShield: Math.max(0, next.stacks.playerShield + command.amount),
      },
    };
  } else if (command.kind === "heal") {
    next = {
      ...next,
      playerHp: Math.min(next.playerMaxHp, next.playerHp + command.amount),
    };
  } else if (command.kind === "mp") {
    next = {
      ...next,
      playerMp: Math.min(next.playerMaxMp, next.playerMp + command.amount),
    };
  } else if (command.kind === "consume_dot") {
    next = {
      ...next,
      enemyV2Dots: next.enemyV2Dots.filter((dot) => dot.tag !== command.dot),
    };
  } else if (command.kind === "apply_dot") {
    const dot = command.dot === "bleed"
      ? makeBleedDot({
          stacks: command.stacks,
          flatPerStack: Math.max(1, Math.floor(player.atk * 0.04)),
          sourceAtk: player.atk,
        })
      : makePoisonDot({
          stacks: command.stacks,
          pctMaxHpPerStack: 0.004,
          sourceAtk: player.atk,
        });
    next = {
      ...next,
      enemyV2Dots: applyV2DotsToTarget(next.enemyV2Dots, [dot]),
    };
  } else if (command.kind === "def_debuff") {
    next = {
      ...next,
      buffs: {
        ...next.buffs,
        enemyDefDebuffPct: Math.max(
          next.buffs.enemyDefDebuffTurnsLeft > 0
            ? next.buffs.enemyDefDebuffPct
            : 0,
          command.pct,
        ),
        enemyDefDebuffTurnsLeft: Math.max(
          next.buffs.enemyDefDebuffTurnsLeft,
          command.actions,
        ),
      },
    };
  } else if (command.kind === "mdef_debuff") {
    next = {
      ...next,
      buffs: {
        ...next.buffs,
        enemyMagicDefDebuffPct: Math.max(
          (next.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
            ? next.buffs.enemyMagicDefDebuffPct ?? 0
            : 0,
          command.pct,
        ),
        enemyMagicDefDebuffTurnsLeft: Math.max(
          next.buffs.enemyMagicDefDebuffTurnsLeft ?? 0,
          command.actions,
        ),
      },
    };
  } else if (command.kind === "extra_action") {
    next = { ...next, playerAttacksLeft: next.playerAttacksLeft + 1 };
  } else if (command.kind === "unity_buff") {
    next = {
      ...next,
      buffs: {
        ...next.buffs,
        playerAtkBuffPct: Math.max(
          next.buffs.playerAtkBuffTurnsLeft > 0
            ? next.buffs.playerAtkBuffPct
            : 0,
          command.attackPct,
        ),
        playerAtkBuffTurnsLeft: Math.max(
          next.buffs.playerAtkBuffTurnsLeft,
          command.actions,
        ),
        tier6UnityHealPct: command.healPct,
        tier6UnityTurnsLeft: Math.max(
          next.buffs.tier6UnityTurnsLeft ?? 0,
          command.actions,
        ),
      },
    };
  }
  const value = "amount" in command
    ? Math.abs(command.amount)
    : "pct" in command
      ? command.pct
      : command.kind === "unity_buff"
        ? command.attackPct
        : 0;
  return {
    ...next,
    log: [...next.log, {
      kind: "info",
      effect,
      text: `[${command.label}] ${commandText(command, value)}`,
      turn: "player",
    }],
  };
}

function commandText(command: Tier6UniqueCommand, value: number): string {
  if (command.kind === "damage_fixed") return `${value} 추가 피해`;
  if (command.kind === "shield") return `보호막 ${command.amount >= 0 ? "+" : "-"}${value}`;
  if (command.kind === "heal") return `HP +${value}`;
  if (command.kind === "mp") return `MP +${value}`;
  if (command.kind === "consume_dot") return `${command.dot} ${command.stacks}스택 소비`;
  if (command.kind === "apply_dot") return `${command.dot} ${command.stacks}스택 부여`;
  if (command.kind === "def_debuff") return `방어 ${value}% 감소`;
  if (command.kind === "mdef_debuff") return `마법방어 ${value}% 감소`;
  if (command.kind === "extra_action") return "추가 행동 +1";
  return `공격·회복 효율 +${value}%`;
}

export function ensureTier6Runtime(state: BattleState): BattleState {
  if (state.stacks.tier6Uniques) return state;
  return {
    ...state,
    stacks: {
      ...state.stacks,
      tier6Uniques: initialTier6UniqueRuntime(),
    },
  };
}
