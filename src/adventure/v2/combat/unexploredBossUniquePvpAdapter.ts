import { healingAfterBurn } from "./burnHealing";
import { recordCombatDamage, recordCombatMetric } from "./combatDiagnostics";
export { bossUniqueLethalSavePvp, carryBossUniqueStacks } from "./unexploredBossUniquePvpSurvival";
import { applyV2DotsToTarget } from "./combatShared";
import { setSide } from "./engine.pvpSide";
import { scalePositivePvPValue, scalePvPHealing, scalePvPShield } from "./engine.pvpScaling";
import { type PvPBattleState, type PvPSide } from "./engine.pvpState";
import { type PlayerCombat } from "./engineState";
import { appendLog } from "./engineSupport";
import { applyStatusDotDamageBonus, makePlayerPoisonDot } from "./playerDotDamage";
import { appendPvPSurvivalLogs, resolvePvPHostileDamageSurvival } from "./pvpHostileDamage";
import { canApplyShock } from "./shockAction";
import {
  beginBossUniqueAttack,
  bossUniqueCritBonusPct,
  bossUniqueDamageTaken,
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

type Key = "p1" | "p2";
const otherKey = (key: Key): Key => key === "p1" ? "p2" : "p1";
const isDirect = (kind: UnexploredAttackContext["kind"]) =>
  kind === "manual_basic" || kind === "direct_skill" || kind === "extra_basic";

const BEGIN_LOG_TEXT: Record<string, string> = {
  "궤도 절단": "방어·마법방어 50% 무시, 피해 +80%",
  "빙결 일격": "빙결된 상대에게 피해 +30%",
  "보정 사격": "피해 +25%",
};

export function initialBossUniquePvp(
  player: PlayerCombat, sustainMultiplier: number,
): { runtime: BossUniqueRuntime; startShield: number } | null {
  if (!player.unexploredBossEffects?.length) return null;
  return initialBossUniqueRuntime(player.unexploredBossEffects, {
    maxHp: player.maxHp,
    pvp: true,
    scaleShield: amount => scalePositivePvPValue(amount, sustainMultiplier),
  });
}

export function peekBossUniqueDefenseMultPvp(side: PvPSide): number {
  const runtime = side.stacks.unexploredBoss;
  return runtime && side.player.unexploredBossEffects?.includes("infinite_orbit") && runtime.pursuit >= ORBIT_PURSUIT_MAX
    ? ORBIT_DEFENSE_MULT
    : 1;
}

export function bossUniqueCritBonusPvp(side: PvPSide): number {
  return bossUniqueCritBonusPct(side.stacks.unexploredBoss, side.player.unexploredBossEffects);
}

const withRuntime = (side: PvPSide, runtime: BossUniqueRuntime): PvPSide =>
  ({ ...side, stacks: { ...side.stacks, unexploredBoss: runtime } });

export function beginBossUniqueAttackPvp(
  state: PvPBattleState, actor: Key, kind: UnexploredAttackContext["kind"],
): { state: PvPBattleState; damageMult: number; defenseMult: number } {
  const side = state[actor];
  const runtime = side.stacks.unexploredBoss;
  if (!runtime) return { state, damageMult: 1, defenseMult: 1 };
  const target = state[otherKey(actor)];
  const begun = beginBossUniqueAttack(runtime, side.player.unexploredBossEffects, {
    direct: isDirect(kind),
    targetPoisonStacks: target.v2Dots
      .filter(dot => dot.tag === "poison" && dot.turns > 0)
      .reduce((sum, dot) => sum + dot.stacks, 0),
    hp: side.hp,
    maxHp: side.maxHp,
  });
  let log = state.log;
  for (const label of begun.logs) {
    log = appendLog(log, { kind: "info", side: actor, text: `[${label}] ${BEGIN_LOG_TEXT[label] ?? "발동"}` });
  }
  return {
    state: setSide({ ...state, log }, actor, withRuntime(side, begun.runtime)),
    damageMult: begun.damageMult,
    defenseMult: begun.defenseMult,
  };
}

export function finishBossUniqueAttackPvp(
  state: PvPBattleState, actor: Key, context: UnexploredAttackContext,
): PvPBattleState {
  const side = state[actor];
  const runtime = side.stacks.unexploredBoss;
  if (!runtime) return state;
  const done = finishBossUniqueAttack(runtime, side.player.unexploredBossEffects, {
    direct: isDirect(context.kind),
    hit: context.hit,
    crit: context.anyCrit,
    atk: side.player.atk,
    magicAtk: side.player.magicAtk ?? side.player.atk,
  });
  return applyBossUniqueCommandsPvp(setSide(state, actor, withRuntime(side, done.runtime)), actor, done.commands);
}

export function recordBossUniqueHitPvp(side: PvPSide, hit: EnemyHitResolution): PvPSide {
  const runtime = side.stacks.unexploredBoss;
  if (!runtime) return side;
  return withRuntime(side, recordBossUniqueHit(runtime, {
    fullyEvaded: hit.fullyEvaded,
    evadedFraction: hit.rawDirectDamage > 0 ? hit.evasionPreventedDamage / hit.rawDirectDamage : 0,
    hpDamage: hit.hpDamage,
    shieldAbsorbed: hit.shieldAbsorbed,
    shieldAfter: side.stacks.playerShield,
  }));
}

export function markBossUniqueDodgePvp(side: PvPSide): PvPSide {
  const runtime = side.stacks.unexploredBoss;
  if (!runtime || runtime.actionEvadedFraction >= 1) return side;
  return withRuntime(side, { ...runtime, actionEvadedFraction: 1 });
}

export function bossUniqueDamageTakenPvp(side: PvPSide, damage: number): number {
  return bossUniqueDamageTaken(side.stacks.unexploredBoss, side.player.unexploredBossEffects, {
    damage,
    shield: side.stacks.playerShield,
  });
}

/** 한 행동이 끝날 때: 방어자 쪽 행동당 효과, 행동자 쪽 자기 행동 효과, 보류 로그를 처리한다. */
export function finishBossUniqueActionPvp(
  state: PvPBattleState, actor: Key, target: Key, successful: boolean,
): PvPBattleState {
  const defender = state[target];
  const defenderRuntime = defender.stacks.unexploredBoss;
  if (defenderRuntime) {
    const done = finishBossUniqueEnemyAction(defenderRuntime, defender.player.unexploredBossEffects, {
      maxHp: defender.maxHp,
      hasDots: defender.v2Dots.some(dot => dot.turns > 0 && dot.stacks > 0),
      scaleShield: amount => scalePvPShield(state, amount),
    });
    state = applyBossUniqueCommandsPvp(setSide(state, target, withRuntime(defender, done.runtime)), target, done.commands);
  }
  const acting = state[actor];
  if (successful && acting.stacks.unexploredBoss) {
    const done = startBossUniquePlayerAction(acting.stacks.unexploredBoss, acting.player.unexploredBossEffects, {
      hp: acting.hp,
      maxHp: acting.maxHp,
      healMult: 1,
    });
    state = applyBossUniqueCommandsPvp(setSide(state, actor, withRuntime(acting, done.runtime)), actor, done.commands);
  }
  return flushBossUniqueLogsPvp(flushBossUniqueLogsPvp(state, actor), target);
}

export function flushBossUniqueLogsPvp(state: PvPBattleState, key: Key): PvPBattleState {
  const pending = state[key].stacks.unexploredBossLogs;
  if (!pending?.length) return state;
  const { unexploredBossLogs: _flushed, ...stacks } = state[key].stacks;
  void _flushed;
  let log = state.log;
  for (const text of pending) log = appendLog(log, { kind: "info", side: key, text });
  return setSide({ ...state, log }, key, { ...state[key], stacks });
}

export function consumeBossUniqueHastePvp(state: PvPBattleState, key: Key): { state: PvPBattleState; pct: number } {
  const runtime = state[key].stacks.unexploredBoss;
  if (!runtime) return { state, pct: 0 };
  const consumed = consumeBossUniqueHaste(runtime);
  if (consumed.pct <= 0) return { state, pct: 0 };
  return {
    state: setSide({
      ...state,
      log: appendLog(state.log, { kind: "info", side: key, text: `[잔상 가속] ${state[key].name}의 다음 행동이 ${Math.round(consumed.pct * 10) / 10}% 앞당겨진다.` }),
    }, key, withRuntime(state[key], consumed.runtime)),
    pct: consumed.pct,
  };
}

function healAmount(state: PvPBattleState, side: PvPSide, amount: number): number {
  const received = Math.floor(amount * Math.min(1, side.player.receivedHealMult ?? 1));
  const afterBurn = healingAfterBurn(received, side.v2Dots, side.stacks.healReduceTurns > 0 ? side.stacks.healReducePct : 0);
  return Math.min(Math.max(0, side.maxHp - side.hp), scalePvPHealing(state, afterBurn));
}

/** owner는 효과 보유자. 피해·중독·방어 감소·빙결은 상대에게, 보호막·회복·정화는 보유자에게 적용한다. */
export function applyBossUniqueCommandsPvp(
  state: PvPBattleState, owner: Key, commands: readonly BossUniqueCommand[],
): PvPBattleState {
  const foe = otherKey(owner);
  let next = state;
  for (const command of commands) {
    let self = next[owner];
    let target = next[foe];
    let text: string;
    let survival: ReturnType<typeof resolvePvPHostileDamageSurvival> | undefined;
    if (command.kind === "damage_fixed") {
      recordCombatDamage(`unique:boss:${command.label}`, foe, target.hp, command.amount);
      survival = resolvePvPHostileDamageSurvival(target, target.hp - command.amount, foe);
      target = survival.side;
      text = `${target.name}에게 ${command.amount} 추가 피해`;
    } else if (command.kind === "apply_poison") {
      const dot = makePlayerPoisonDot({ stacks: command.stacks, pctMaxHpPerStack: 0.004 }, self.player);
      target = {
        ...target,
        v2Dots: applyV2DotsToTarget(target.v2Dots, applyStatusDotDamageBonus([dot], self.player.statusDotDamagePct), target.maxHp),
      };
      text = `${target.name}에게 중독 ${command.stacks}스택`;
    } else if (command.kind === "def_debuff") {
      self = { ...self, buffs: {
        ...self.buffs,
        enemyDefDebuffPct: Math.max(self.buffs.enemyDefDebuffTurnsLeft > 0 ? self.buffs.enemyDefDebuffPct : 0, command.pct),
        enemyDefDebuffTurnsLeft: Math.max(self.buffs.enemyDefDebuffTurnsLeft, command.actions),
      } };
      text = `${target.name} 방어 ${command.pct}% 감소 (${command.actions}행동)`;
    } else if (command.kind === "mdef_debuff") {
      self = { ...self, buffs: {
        ...self.buffs,
        enemyMagicDefDebuffPct: Math.max((self.buffs.enemyMagicDefDebuffTurnsLeft ?? 0) > 0 ? self.buffs.enemyMagicDefDebuffPct ?? 0 : 0, command.pct),
        enemyMagicDefDebuffTurnsLeft: Math.max(self.buffs.enemyMagicDefDebuffTurnsLeft ?? 0, command.actions),
      } };
      text = `${target.name} 마법방어 ${command.pct}% 감소 (${command.actions}행동)`;
    } else if (command.kind === "shield") {
      self = { ...self, stacks: { ...self.stacks, playerShield: self.stacks.playerShield + command.amount } };
      text = `${self.name} 보호막 +${command.amount}`;
    } else if (command.kind === "heal") {
      const amount = healAmount(next, self, command.amount);
      if (amount <= 0) continue;
      recordCombatMetric("healing", `unique:boss:${command.label}`, owner, amount);
      self = { ...self, hp: self.hp + amount };
      text = `${self.name} HP +${amount}`;
    } else if (command.kind === "cleanse_dots") {
      self = { ...self, v2Dots: [] };
      text = `${self.name} 지속 피해 정화`;
    } else {
      const cancels = canApplyShock(target.stacks.shockAction);
      if (cancels) target = { ...target, stacks: { ...target.stacks, shockAction: "pending" } };
      text = `${target.name} 빙결${cancels ? " · 다음 행동 취소" : ""} · 다음 직접 공격 피해 +30%`;
    }
    next = setSide(setSide(next, owner, self), foe, target);
    next = { ...next, log: appendLog(next.log, { kind: "info", side: owner, text: `[${command.label}] ${text}` }) };
    if (survival) next = { ...next, log: appendPvPSurvivalLogs(next, foe, target.name, survival).log };
    if (target.hp <= 0 && next.phase !== "ended") {
      next = {
        ...next,
        phase: "ended",
        outcome: owner === "p1" ? "p1_win" : "p2_win",
        log: appendLog(next.log, { kind: "info", text: `${target.name}이(가) 쓰러졌다.` }),
      };
    }
  }
  return next;
}
