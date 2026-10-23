import { healingReductionPct } from "./burnHealing";
import { recordCombatDamage, recordCombatMetric } from "./combatDiagnostics";
import { applyV2DotsToTarget } from "./combatShared";
import { BOSS_MAX_HP_DAMAGE_MULT, type BattleState, type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import { applyStatusDotDamageBonus, makePlayerPoisonDot } from "./playerDotDamage";
import { canApplyShock } from "./shockAction";
import {
  beginBossUniqueAttack,
  bossUniqueCritBonusPct,
  bossUniqueDamageTaken,
  bossUniqueLethalSave,
  consumeBossUniqueHaste,
  finishBossUniqueAttack,
  finishBossUniqueEnemyAction,
  initialBossUniqueRuntime,
  ORBIT_DEFENSE_MULT,
  ORBIT_PURSUIT_MAX,
  recordBossUniqueHit,
  startBossUniquePlayerAction,
  type BossUniqueCommand,
  type BossUniqueRuntime,
} from "./unexploredBossUniqueEffects";
import type { EnemyHitResolution, UnexploredAttackContext } from "./unexploredSetEffects";

type Turn = "player" | "enemy";

const BEGIN_LOG_TEXT: Record<string, string> = {
  "궤도 절단": "방어·마법방어 50% 무시, 피해 +80%",
  "빙결 일격": "빙결된 적에게 피해 +30%",
  "보정 사격": "피해 +25%",
};

const isDirect = (kind: UnexploredAttackContext["kind"]) =>
  kind === "manual_basic" || kind === "direct_skill" || kind === "extra_basic";

export function initialBossUniquePve(
  player: PlayerCombat,
): { runtime: BossUniqueRuntime; startShield: number } | null {
  if (!player.unexploredBossEffects?.length) return null;
  return initialBossUniqueRuntime(player.unexploredBossEffects, { maxHp: player.maxHp, pvp: false });
}

/** 스킬 피해 계산이 공격 시작보다 앞서므로, 궤도 절단 방어 무시 여부를 미리 본다. */
export function peekBossUniqueDefenseMultPve(state: BattleState, player: PlayerCombat): number {
  const runtime = state.unexploredBossRuntime;
  return runtime && player.unexploredBossEffects?.includes("infinite_orbit") && runtime.pursuit >= ORBIT_PURSUIT_MAX
    ? ORBIT_DEFENSE_MULT
    : 1;
}

export function beginBossUniqueAttackPve(
  state: BattleState, player: PlayerCombat, kind: UnexploredAttackContext["kind"],
): { state: BattleState; damageMult: number; defenseMult: number } {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return { state, damageMult: 1, defenseMult: 1 };
  const begun = beginBossUniqueAttack(runtime, player.unexploredBossEffects, {
    direct: isDirect(kind),
    targetPoisonStacks: state.enemyV2Dots
      .filter(dot => dot.tag === "poison" && dot.turns > 0)
      .reduce((sum, dot) => sum + dot.stacks, 0),
    hp: state.playerHp,
    maxHp: state.playerMaxHp,
  });
  let log = state.log;
  for (const label of begun.logs) {
    log = appendLog(log, { kind: "info", turn: "player", text: `[${label}] ${BEGIN_LOG_TEXT[label] ?? "발동"}` });
  }
  return {
    state: { ...state, unexploredBossRuntime: begun.runtime, log },
    damageMult: begun.damageMult,
    defenseMult: begun.defenseMult,
  };
}

export function finishBossUniqueAttackPve(
  state: BattleState, player: PlayerCombat, context: UnexploredAttackContext,
): BattleState {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return state;
  const done = finishBossUniqueAttack(runtime, player.unexploredBossEffects, {
    direct: isDirect(context.kind),
    hit: context.hit,
    crit: context.anyCrit,
    atk: player.atk,
    magicAtk: player.magicAtk ?? player.atk,
  });
  return applyBossUniqueCommandsPve({ ...state, unexploredBossRuntime: done.runtime }, player, done.commands, "player");
}

export function bossUniqueCritBonusPve(state: BattleState, player: PlayerCombat): number {
  return bossUniqueCritBonusPct(state.unexploredBossRuntime, player.unexploredBossEffects);
}

export function recordBossUniqueHitPve(
  state: BattleState, hit: EnemyHitResolution, shieldAfter: number,
): BattleState {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return state;
  return {
    ...state,
    unexploredBossRuntime: recordBossUniqueHit(runtime, {
      fullyEvaded: hit.fullyEvaded,
      evadedFraction: hit.rawDirectDamage > 0 ? hit.evasionPreventedDamage / hit.rawDirectDamage : 0,
      hpDamage: hit.hpDamage,
      shieldAbsorbed: hit.shieldAbsorbed,
      shieldAfter,
    }),
  };
}

export function markBossUniqueDodgePve(state: BattleState): BattleState {
  const runtime = state.unexploredBossRuntime;
  if (!runtime || runtime.actionEvadedFraction >= 1) return state;
  return { ...state, unexploredBossRuntime: { ...runtime, actionEvadedFraction: 1 } };
}

export function finishBossUniqueEnemyActionPve(state: BattleState, player: PlayerCombat): BattleState {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return state;
  const done = finishBossUniqueEnemyAction(runtime, player.unexploredBossEffects, {
    maxHp: state.playerMaxHp,
    hasDots: state.playerV2Dots.some(dot => dot.turns > 0 && dot.stacks > 0),
  });
  return applyBossUniqueCommandsPve({ ...state, unexploredBossRuntime: done.runtime }, player, done.commands, "enemy");
}

export function bossUniqueDamageTakenPve(state: BattleState, player: PlayerCombat, damage: number): number {
  return bossUniqueDamageTaken(state.unexploredBossRuntime, player.unexploredBossEffects, {
    damage,
    shield: state.stacks.playerShield,
  });
}

/** 적대 피해 공통 관문에서 HP가 0 이하가 될 때 호출한다. */
export function bossUniqueLethalSavePve(
  state: BattleState, player: PlayerCombat, turn: Turn,
): BattleState {
  if (state.playerHp > 0) return state;
  const saved = bossUniqueLethalSave(state.unexploredBossRuntime, player.unexploredBossEffects, {
    hpAfterDamage: state.playerHp,
    maxHp: state.playerMaxHp,
  });
  if (!saved) return state;
  recordCombatMetric("survival_restoration", "unexplored_eternal", "player", saved.hp);
  return {
    ...state,
    playerHp: saved.hp,
    unexploredBossRuntime: saved.runtime,
    log: appendLog(state.log, {
      kind: "info",
      turn,
      text: `[영겁] 쓰러지지 않고 HP ${saved.hp}로 버텼다. 피해와 속도가 끓어오른다.`,
    }),
  };
}

export function startBossUniquePlayerActionPve(state: BattleState, player: PlayerCombat): BattleState {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return state;
  const done = startBossUniquePlayerAction(runtime, player.unexploredBossEffects, {
    hp: state.playerHp,
    maxHp: state.playerMaxHp,
    healMult: 1,
  });
  return applyBossUniqueCommandsPve({ ...state, unexploredBossRuntime: done.runtime }, player, done.commands, "player");
}

export function consumeBossUniqueHastePve(state: BattleState): { state: BattleState; pct: number } {
  const runtime = state.unexploredBossRuntime;
  if (!runtime) return { state, pct: 0 };
  const consumed = consumeBossUniqueHaste(runtime);
  if (consumed.pct <= 0) return { state, pct: 0 };
  return {
    state: {
      ...state,
      unexploredBossRuntime: consumed.runtime,
      log: appendLog(state.log, { kind: "info", turn: "enemy", text: `[잔상 가속] 다음 행동이 ${Math.round(consumed.pct * 10) / 10}% 앞당겨진다.` }),
    },
    pct: consumed.pct,
  };
}

function healMultiplier(state: BattleState, player: PlayerCombat): number {
  return Math.min(1, player.receivedHealMult ?? 1) * (1 - healingReductionPct(state.playerV2Dots) / 100);
}

export function applyBossUniqueCommandsPve(
  state: BattleState, player: PlayerCombat, commands: readonly BossUniqueCommand[], turn: Turn,
): BattleState {
  let next = state;
  for (const command of commands) {
    let text: string;
    if (command.kind === "damage_fixed") {
      const amount = Math.min(next.enemyHp, command.amount);
      recordCombatDamage(`unique:boss:${command.label}`, "enemy", next.enemyHp, amount);
      next = {
        ...next,
        enemyHp: Math.max(0, next.enemyHp - command.amount),
        ...(next.enemyDamageDealtTotal == null ? {} : { enemyDamageDealtTotal: next.enemyDamageDealtTotal + command.amount }),
      };
      text = `${next.enemy.name}에게 ${command.amount} 추가 피해`;
    } else if (command.kind === "apply_poison") {
      const dot = makePlayerPoisonDot({ stacks: command.stacks, pctMaxHpPerStack: 0.004 }, player);
      next = {
        ...next,
        enemyV2Dots: applyV2DotsToTarget(
          next.enemyV2Dots,
          applyStatusDotDamageBonus([dot], player.statusDotDamagePct),
          next.enemy.hp,
          next.maxHpDamageMult ?? (next.isBoss ? BOSS_MAX_HP_DAMAGE_MULT : 1),
        ),
      };
      text = `${next.enemy.name}에게 중독 ${command.stacks}스택`;
    } else if (command.kind === "def_debuff") {
      next = { ...next, buffs: {
        ...next.buffs,
        enemyDefDebuffPct: Math.max(next.buffs.enemyDefDebuffTurnsLeft > 0 ? next.buffs.enemyDefDebuffPct : 0, command.pct),
        enemyDefDebuffTurnsLeft: Math.max(next.buffs.enemyDefDebuffTurnsLeft, command.actions),
      } };
      text = `방어 ${command.pct}% 감소 (${command.actions}행동)`;
    } else if (command.kind === "mdef_debuff") {
      next = { ...next, buffs: {
        ...next.buffs,
        enemyMagicDefDebuffPct: Math.max((next.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0 ? next.buffs.enemyMagicDefDebuffPct ?? 0 : 0, command.pct),
        enemyMagicDefDebuffTurnsLeft: Math.max(next.buffs.enemyMagicDefDebuffTurnsLeft ?? 0, command.actions),
      } };
      text = `마법방어 ${command.pct}% 감소 (${command.actions}행동)`;
    } else if (command.kind === "shield") {
      next = { ...next, stacks: { ...next.stacks, playerShield: next.stacks.playerShield + command.amount } };
      text = `보호막 +${command.amount}`;
    } else if (command.kind === "heal") {
      const amount = Math.min(
        Math.max(0, next.playerMaxHp - next.playerHp),
        Math.floor(command.amount * healMultiplier(next, player)),
      );
      if (amount <= 0) continue;
      recordCombatMetric("healing", `unique:boss:${command.label}`, "player", amount);
      next = { ...next, playerHp: next.playerHp + amount };
      text = `HP +${amount}`;
    } else if (command.kind === "cleanse_dots") {
      next = { ...next, playerV2Dots: [] };
      text = "지속 피해 정화";
    } else {
      const cancels = canApplyShock(next.stacks.enemyShockAction);
      if (cancels) next = { ...next, stacks: { ...next.stacks, enemyShockAction: "pending" } };
      text = `${next.enemy.name} 빙결${cancels ? " · 다음 행동 취소" : ""} · 다음 직접 공격 피해 +30%`;
    }
    next = { ...next, log: appendLog(next.log, { kind: "info", turn, text: `[${command.label}] ${text}` }) };
  }
  return next;
}
