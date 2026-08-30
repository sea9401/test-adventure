import type {
  PvPBattleState,
  PvPSide,
} from "./engine-pvp";
import {
  applyBleedChangeToDots,
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
import {
  magicBarrierCombatLogEntries,
  resolveMagicBarrierDamage,
} from "./magicBarrier";
import { pvpSideDamageTakenReductionPct } from "./pvpDamageReduction";
import {
  effectiveTier6MagicDefense,
  tier6DamageAfterMultiplier,
  tier6MagicDamageAfterMitigation,
} from "./tier6UniqueMagicDamage";
import {
  resolveTripleWardDamage,
  TRIPLE_WARD_LABELS,
  tripleWardStabilityReductionPct,
} from "./tripleWard";

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
    const applied = applyCommand(state, actor, target, command);
    actor = applied.actor;
    target = applied.target;
    if (command.kind === "damage_magic" && applied.signatureDamage > 0) {
      const linked = resolveTier6UniqueEvent(
        actor.player.equipSignatures,
        actor.stacks.tier6Uniques,
        {
          kind: "signature_damage",
          mechanic: command.mechanic,
          damage: applied.signatureDamage,
          origin: event.origin,
        },
      );
      actor = {
        ...actor,
        stacks: { ...actor.stacks, tier6Uniques: linked.state },
      };
    }
    log = [...log, ...applied.defenseLogs.map((text) => ({
      kind: "info" as const,
      text,
      side: targetKey,
    }))];
    log = [
      ...log,
      {
        kind: "info",
        effect: command.kind === "damage_fixed" || command.kind === "damage_magic"
          ? "extra_damage"
          : "status",
        text: `[${command.label}] ${pvpCommandText(command, applied.hpDamage)}`,
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
  state: PvPBattleState,
  actor: PvPSide,
  target: PvPSide,
  command: Tier6UniqueCommand,
): {
  actor: PvPSide;
  target: PvPSide;
  survival?: PvPHostileDamageSurvival;
  signatureDamage: number;
  hpDamage: number;
  defenseLogs: string[];
} {
  if (command.kind === "damage_fixed") {
    const survival = resolvePvPHostileDamageSurvival(
      target,
      target.hp - command.amount,
    );
    return {
      actor,
      target: survival.side,
      survival,
      signatureDamage: 0,
      hpDamage: Math.min(target.hp, command.amount),
      defenseLogs: [],
    };
  } else if (command.kind === "damage_magic") {
    const magicDefense = effectiveTier6MagicDefense({
      baseDefense: target.player.magicDef ?? target.player.def,
      reductionPcts: [
        (actor.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0
          ? actor.buffs.enemyMagicDefDebuffPct ?? 0
          : 0,
        actor.player.enemyMagicDefReductionPct ?? 0,
      ],
    });
    const stabilityPct = tripleWardStabilityReductionPct(
      target.stacks.tripleWard,
    );
    let stabilityReducedBy = 0;
    const magicBarrier = resolveMagicBarrierDamage({
      rawDamage: command.amount,
      durability: target.magicBarrier ?? 0,
      absorbPct: target.player.magicBarrierPvpAbsorbPct,
      efficiencyPct: target.player.magicBarrierPvpEfficiencyPct,
      eligible: true,
      mitigateBody: (bodyRawDamage) => {
        const reduced = tier6MagicDamageAfterMitigation({
          rawDamage: bodyRawDamage,
          magicDefense,
          damageTakenReductionPct: pvpSideDamageTakenReductionPct(target),
        });
        const afterStability = stabilityPct > 0 && reduced > 0
          ? Math.max(1, Math.floor(reduced * (1 - stabilityPct / 100)))
          : reduced;
        stabilityReducedBy += reduced - afterStability;
        return afterStability;
      },
    });
    const ward = resolveTripleWardDamage(
      target.stacks.tripleWard,
      "magic",
      "pvp",
      [magicBarrier.hpBoundDamage],
    );
    const scaledDamage = tier6DamageAfterMultiplier(
      ward.totalDamage,
      state.damageMultiplier ?? 1,
    );
    const shieldAbsorbed = Math.min(
      target.stacks.playerShield,
      scaledDamage,
    );
    const hpBoundDamage = scaledDamage - shieldAbsorbed;
    const defendedTarget: PvPSide = {
      ...target,
      magicBarrier: magicBarrier.durabilityLeft,
      stacks: {
        ...target.stacks,
        playerShield: target.stacks.playerShield - shieldAbsorbed,
        tripleWard: ward.state,
      },
    };
    const survival = hpBoundDamage > 0
      ? resolvePvPHostileDamageSurvival(
          defendedTarget,
          defendedTarget.hp - hpBoundDamage,
        )
      : undefined;
    const defenseLogs = magicBarrierCombatLogEntries(magicBarrier).map(
      (entry) => entry.text,
    );
    if (stabilityReducedBy > 0) {
      defenseLogs.push(
        `[영역 안정 ${target.stacks.tripleWard.stabilityStacks}중첩] ${target.name} 피해 -${stabilityReducedBy}`,
      );
    }
    if (ward.consumed) {
      defenseLogs.push(
        `[${TRIPLE_WARD_LABELS.magic}] ${target.name} 직접 마법 피해 ${ward.reductionPct}% 감소 (${ward.remaining}회 남음)`,
      );
    }
    if (shieldAbsorbed > 0) {
      defenseLogs.push(
        `[철벽] ${target.name} 보호막이 ${shieldAbsorbed} 흡수 (남은 ${defendedTarget.stacks.playerShield})`,
      );
    }
    return {
      actor,
      target: survival?.side ?? defendedTarget,
      survival,
      signatureDamage: scaledDamage,
      hpDamage: Math.min(target.hp, hpBoundDamage),
      defenseLogs,
    };
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
  } else if (command.kind === "refresh_bleed") {
    target = {
      ...target,
      v2Dots: applyBleedChangeToDots(target.v2Dots, {
        stacksToAdd: 0,
        setTurns: command.turns,
        reason: "refresh",
      }),
    };
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
  return {
    actor,
    target,
    signatureDamage: 0,
    hpDamage: 0,
    defenseLogs: [],
  };
}

function pvpCommandText(
  command: Tier6UniqueCommand,
  hpDamage: number,
): string {
  if (command.kind === "damage_fixed") return `${command.amount} 추가 피해`;
  if (command.kind === "damage_magic") return `${hpDamage} 마법 피해`;
  if (command.kind === "shield") return `보호막 ${command.amount >= 0 ? "+" : ""}${command.amount}`;
  if (command.kind === "heal") return `HP +${command.amount}`;
  if (command.kind === "mp") return `MP +${command.amount}`;
  if (command.kind === "consume_dot") return `${command.dot} ${command.stacks}스택 소비`;
  if (command.kind === "apply_dot") return `${command.dot} ${command.stacks}스택 부여`;
  if (command.kind === "refresh_bleed") {
    return `출혈 중첩 유지 · 지속 횟수 최소 ${command.turns}회로 갱신`;
  }
  if (command.kind === "def_debuff") return `방어 ${command.pct}% 감소`;
  if (command.kind === "mdef_debuff") return `마법방어 ${command.pct}% 감소`;
  if (command.kind === "extra_action") return "추가 기본 공격 +1회";
  return `공격·회복 효율 +${command.attackPct}%`;
}
